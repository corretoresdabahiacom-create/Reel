import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { boot, shutdown, http, signup, auth, waitFor, redis, type Session } from './helpers.js';
import { asSystem } from '../src/db/pool.js';
import { env } from '../src/config/env.js';
import { invalidateFlags } from '../src/modules/flags.service.js';
import { storage, refLocation } from '../src/providers/storage.js';
import { ffmpeg, withTmp } from '../src/utils/ffmpeg.js';
import { score, extractFeatures } from '../src/modules/insights/predictiveInsights.js';
import { authenticityService } from '../src/modules/authenticity/authenticityService.js';
import { derToP1363, readEmbedded } from '../src/modules/authenticity/c2pa.js';
import { complianceService } from '../src/modules/compliance/compliance.service.js';
import { SCORE_LIMIT, LIVE_CREATE_LIMIT } from '../src/modules/m10/m10.routes.js';

/**
 * Módulo 10 — Insights, séries, selo C2PA e live com avatar (Postgres/Redis reais, FFmpeg, c2pa-node real com PKI efêmera).
 * Checkpoint 10: verifySeal lê o manifest EMBUTIDO (nunca URL externa); rótulo "IA" visível e registrado; rate limits ativos.
 */
const FLAGS = ['ff_insights', 'ff_series', 'ff_seal', 'ff_live'];
let a: Session; let b: Session; let biz: Session;
const setFlags = async (on: boolean) => { await asSystem((db) => db.query(`UPDATE feature_flags SET enabled=$1, rollout_percent=$2 WHERE key = ANY($3)`, [on, on ? 100 : 0, FLAGS])); await invalidateFlags(); };
const idem = () => ({ 'idempotency-key': `m10-${randomUUID()}` });
const sha = (x: Buffer) => createHash('sha256').update(x).digest('hex');
let video: Buffer;
async function source(): Promise<Buffer> {
  return withTmp(async (d) => { const o = join(d, 'v.mp4');
    await ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=30:d=4', '-f', 'lavfi', '-i', 'sine=frequency=440:d=4', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', o], 120_000); return readFile(o); });
}
async function project(s: Session, title: string, texts: string[], dur = 12) {
  const id = (await asSystem((db) => db.query(`INSERT INTO projects (user_id, title, script, status, duration_sec) VALUES ($1,$2,'Roteiro.','ready',$3) RETURNING id`, [s.id, title, dur]))).rows[0].id as string;
  for (const [i, t] of texts.entries()) await asSystem((db) => db.query(`INSERT INTO scenes (project_id, index, text, status, duration_sec, selected) VALUES ($1,$2,$3,'done',$4,true)`, [id, i, t, Math.min(15, Math.max(3, Math.round(dur / texts.length)))]));
  const key = `projects/${id}/final.mp4`; await storage.put('videos', key, video, 'video/mp4'); await asSystem((db) => db.query('UPDATE projects SET final_video_url=$2 WHERE id=$1', [id, key]));
  return id;
}
async function catalog(s: Session, n = 3) {
  const id = (await asSystem((db) => db.query(`INSERT INTO catalogs (owner_id, name) VALUES ($1,'Loja Aro 29') RETURNING id`, [s.id]))).rows[0].id as string;
  for (let i = 0; i < n; i++) await asSystem((db) => db.query(`INSERT INTO catalog_items (catalog_id, name, price, sku) VALUES ($1,$2,$3,$4)`, [id, `Bike ${i + 1}`, 1999.9 + i * 100, `SKU-${i}`]));
  return id;
}
const resetRate = async (s: Session) => { for (const sc of ['insights_score', 'live_create', 'm10_write', 'seal_apply']) { const k = await redis.keys(`rl:${sc}*:${s.id}:*`); if (k.length) await redis.del(...k); } };

beforeAll(async () => {
  await boot(); video = await source();
  a = await signup({ plan: 'pro', credits: 50 }); b = await signup({ plan: 'pro', credits: 50 }); biz = await signup({ plan: 'business', credits: 50 });
}, 180_000);
afterAll(async () => { await setFlags(false); await shutdown(); });

describe('Módulo 10 — unidade', () => {
  it('heuristic-v1: notas 5–95, sugestões ordenadas pelo efeito e só para o que falta', () => {
    const good = score({ durationSec: 24, sceneCount: 6, avgSceneSec: 4, hookWords: 8, hookQuestion: true, hookNumber: false, ctaPresent: true, wordsPerSec: 2.4, hasMusic: true, localizedCount: 1, titleChars: 30, pastPublications: 3, pastSuccessRate: 1 });
    const bad = score({ durationSec: 90, sceneCount: 5, avgSceneSec: 18, hookWords: 30, hookQuestion: false, hookNumber: false, ctaPresent: false, wordsPerSec: 4.2, hasMusic: false, localizedCount: 0, titleChars: 4, pastPublications: 0, pastSuccessRate: 0 });
    for (const x of [good, bad]) for (const v of [x.retention, x.ctr, x.conversion]) { expect(v).toBeGreaterThanOrEqual(5); expect(v).toBeLessThanOrEqual(95); }
    expect(good.retention).toBeGreaterThan(bad.retention); expect(good.ctr).toBeGreaterThan(bad.ctr); expect(good.conversion).toBeGreaterThan(bad.conversion);
    expect(good.suggestions).toHaveLength(0); expect(bad.suggestions.map((s) => s.code)).toContain('add_cta');
    expect(bad.suggestions.map((s) => s.impact)).toEqual([...bad.suggestions.map((s) => s.impact)].sort((x, y) => y - x));
  });
  it('assinatura do KMS (DER) vira r||s de 64 bytes (COSE ES256)', () => {
    const r = Buffer.alloc(32, 1), s = Buffer.concat([Buffer.from([0x80]), Buffer.alloc(31, 2)]);
    const der = Buffer.concat([Buffer.from([0x30, 0x45, 0x02, 0x20]), r, Buffer.from([0x02, 0x21, 0x00]), s]);
    expect(derToP1363(der)).toEqual(Buffer.concat([r, s]));
  });
});

describe('Módulo 10 — flags desligadas = app idêntico', () => {
  it('todas as rotas (inclusive as públicas) respondem 404', async () => {
    await setFlags(false); const pid = await project(a, 'Sem flag', ['Oi']); const x = randomUUID();
    for (const [m, u] of [['post', `/api/v1/projects/${pid}/insights`], ['get', '/api/v1/series'], ['post', '/api/v1/series'], ['post', `/api/v1/projects/${pid}/seal`], ['get', '/api/v1/seal/config'],
      ['get', '/api/v1/live/sessions'], ['post', '/api/v1/live/sessions'], ['get', `/api/v1/live/${x}/watch`]] as const) {
      const r = await (http as any)[m](u).set(auth(a)).set(idem()).send(m === 'post' ? { title: 'x' } : undefined); expect(r.status, `${m} ${u}`).toBe(404);
    }
    expect((await http.post('/api/v1/seal/verify').set('content-type', 'video/mp4').send(video)).status).toBe(404);
    expect((await http.get(`/api/v1/projects/${pid}`).set(auth(a))).status).toBe(200);
  });
});

describe('Módulo 10 — flags ligadas', () => {
  beforeAll(async () => { await setFlags(true); });

  describe('insights (estimativa)', () => {
    it('score com sugestões, rotulado "estimativa", sem PII nas features; ai_usage insights_score', async () => {
      const pid = await project(a, 'Bike', ['Você sabia que essa bike pesa só 9 kg e aguenta trilha pesada todos os dias?', 'Quadro de alumínio.', 'Freio a disco.', 'Garanta a sua no link'], 80);
      const r = await http.post(`/api/v1/projects/${pid}/insights?locale=pt-BR`).set(auth(a)); expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body).toMatchObject({ label: 'estimativa', isEstimate: true, modelVersion: 'heuristic-v1' }); expect(r.body.disclaimer).toMatch(/Estimativa/);
      for (const k of ['retention', 'ctr', 'conversion']) expect(r.body.scores[k]).toBeGreaterThanOrEqual(5);
      expect(r.body.suggestions.length).toBeGreaterThan(0); expect(r.body.suggestions.map((s: any) => s.code)).toContain('shorten_video'); expect(r.body.suggestions[0].text).toMatch(/\S/);
      const row = (await asSystem((db) => db.query('SELECT features_json, label FROM predictions WHERE id=$1', [r.body.predictionId]))).rows[0];
      expect(row.label).toBe('estimativa'); for (const v of Object.values(row.features_json)) expect(['number', 'boolean']).toContain(typeof v); // só agregados
      expect(JSON.stringify(row.features_json)).not.toMatch(/bike|link|alum/i);
      expect((await asSystem((db) => db.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='insights_score'`, [a.id]))).rows[0].n).toBe(1);
      const en = await http.get(`/api/v1/projects/${pid}/insights?locale=en`).set(auth(a)); expect(en.body.items[0].disclaimer).toMatch(/estimate/); expect(en.body.items[0].label).toBe('estimativa');
      expect((await asSystem((db) => db.query(`INSERT INTO predictions (project_id,user_id,score_retention,score_ctr,score_conversion,model_version,label) VALUES ($1,$2,1,1,1,'x','certeza')`, [pid, a.id]).then(() => 'ok', (e) => e.code)))).toBe('23514');
      expect((await http.post(`/api/v1/projects/${pid}/insights`).set(auth(b))).status).toBe(404); // projeto de outra pessoa
      const f = await extractFeatures(a.id, pid); expect(f).toMatchObject({ hookQuestion: true, hookNumber: true, ctaPresent: true, sceneCount: 4 });
    });
  });

  describe('séries', () => {
    let sid: string; const P: string[] = [];
    it('série com 3 episódios, continuidade e CTA por capítulo', async () => {
      for (const [i, t] of ['Ana descobre o segredo da loja.', 'Bruno some na noite da promoção.', 'O final: tudo se revela.'].entries()) P.push(await project(a, `Capítulo ${i + 1}`, ['Abertura', t]));
      const s = await http.post('/api/v1/series').set(auth(a)).set(idem()).send({ title: 'Amor na Loja', template: 'mininovela' }); expect(s.status, JSON.stringify(s.body)).toBe(201); sid = s.body.seriesId;
      expect((await http.post(`/api/v1/series/${sid}/episodes`).set(auth(a)).set(idem()).send({ projectId: P[0], ctaUrl: 'http://inseguro.com' })).body.code).toBe('invalid_cta_url');
      expect((await http.post(`/api/v1/series/${sid}/episodes`).set(auth(a)).set(idem()).send({ projectId: P[0], ctaUrl: 'javascript:alert(1)' })).status).toBe(422);
      await http.post(`/api/v1/series/${sid}/episodes`).set(auth(a)).set(idem()).send({ projectId: P[0] });
      await http.post(`/api/v1/series/${sid}/episodes`).set(auth(a)).set(idem()).send({ projectId: P[1], ctaUrl: 'https://loja.example/promo', ctaLabel: 'Ver a promoção' });
      const v = await http.post(`/api/v1/series/${sid}/episodes`).set(auth(a)).set(idem()).send({ projectId: P[2] }); expect(v.status).toBe(201);
      expect(v.body.episodeCount).toBe(3); const e = v.body.episodes;
      expect(e.map((x: any) => x.order)).toEqual([1, 2, 3]); expect(e[0].recap).toBeNull();
      expect(e[1].recap).toBe('Anteriormente em Amor na Loja: Ana descobre o segredo da loja.'); expect(e[2].recap).toMatch(/Bruno some/);
      expect(e[0].cta).toEqual({ url: null, label: 'Assista ao capítulo 2', kind: 'next_episode' }); expect(e[1].cta).toEqual({ url: 'https://loja.example/promo', label: 'Ver a promoção', kind: 'custom' }); expect(e[2].cta.kind).toBe('none');
      expect([e[0].prevEpisodeId, e[0].nextEpisodeId, e[2].nextEpisodeId]).toEqual([null, e[1].episodeId, null]);
      expect((await http.post(`/api/v1/series/${sid}/episodes`).set(auth(a)).set(idem()).send({ projectId: P[0] })).status).toBe(409);
    });
    it('linkEpisodes reordena e refaz a continuidade; ordem incompleta = 422', async () => {
      const cur = (await http.get(`/api/v1/series/${sid}`).set(auth(a))).body.episodes.map((x: any) => x.episodeId);
      expect((await http.put(`/api/v1/series/${sid}/episodes/order`).set(auth(a)).send({ episodeIds: cur.slice(0, 2) })).status).toBe(422);
      const r = await http.put(`/api/v1/series/${sid}/episodes/order`).set(auth(a)).send({ episodeIds: [cur[2], cur[0], cur[1]] }); expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.episodes.map((x: any) => x.projectId)).toEqual([P[2], P[0], P[1]]); expect(r.body.episodes[1].recap).toMatch(/tudo se revela/); expect(r.body.episodes[0].recap).toBeNull();
      const en = await http.get(`/api/v1/series/${sid}?locale=en`).set(auth(a)); expect(en.body.episodes[1].recap).toMatch(/^Previously on Amor na Loja/);
    });
    it('isolamento: outra pessoa não vê a série nem usa projetos alheios; remover renumera', async () => {
      expect((await http.get(`/api/v1/series/${sid}`).set(auth(b))).status).toBe(404);
      const sb = (await http.post('/api/v1/series').set(auth(b)).set(idem()).send({ title: 'Minha' })).body.seriesId;
      expect((await http.post(`/api/v1/series/${sb}/episodes`).set(auth(b)).set(idem()).send({ projectId: P[0] })).status).toBe(404);
      const cur = (await http.get(`/api/v1/series/${sid}`).set(auth(a))).body.episodes;
      const r = await http.delete(`/api/v1/series/${sid}/episodes/${cur[0].episodeId}`).set(auth(a)); expect(r.body.episodes.map((x: any) => x.order)).toEqual([1, 2]); expect(r.body.episodes[0].recap).toBeNull();
      await http.post(`/api/v1/series/${sid}/episodes`).set(auth(a)).set(idem()).send({ projectId: P[2] }); // volta a ter 3
    });
  });

  describe('selo C2PA embutido', () => {
    let pid: string; let st: any;
    it('ativar o selo assina o MP4 com o manifest EMBUTIDO; original intacto; ai_usage c2pa_sign', async () => {
      pid = await project(a, 'Selo', ['Oi', 'Tchau']); const before = sha(await storage.get('videos', `projects/${pid}/final.mp4`));
      const cfg = await http.get('/api/v1/seal/config').set(auth(a)); expect(cfg.body).toMatchObject({ configured: true, embedded: true, signer: 'NexusReel' });
      const r = await http.post(`/api/v1/projects/${pid}/seal`).set(auth(a)).set(idem()); expect(r.status, JSON.stringify(r.body)).toBe(202);
      st = await waitFor(async () => { const x = await http.get(`/api/v1/projects/${pid}/seal`).set(auth(a)); return ['done', 'failed'].includes(x.body.status) ? x.body : undefined; }, 120_000, 150);
      expect(st.status, JSON.stringify(st)).toBe('done'); expect(st).toMatchObject({ c2paManifestEmbedded: true, verifyUrl: null });
      expect(st.seal).toMatchObject({ kind: 'ai_human_directed', aiGenerated: true, humanDirected: true, signedBy: 'NexusReel' }); expect(st.seal.text['pt-BR']).toBe('IA com direção humana');
      const row = (await asSystem((db) => db.query('SELECT * FROM authenticity_records WHERE id=$1', [st.sealId]))).rows[0];
      expect(row).toMatchObject({ c2pa_manifest_embedded: true, verify_url: null }); expect(row.signed_video_key).toBe(`projects/${pid}/sealed/${st.sealId}.mp4`);
      expect(sha(await storage.get('videos', `projects/${pid}/final.mp4`))).toBe(before);
      expect((await asSystem((db) => db.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='c2pa_sign' AND status='ok'`, [a.id]))).rows[0].n).toBe(1);
      const again = await http.post(`/api/v1/projects/${pid}/seal`).set(auth(a)).set(idem()); expect(again.body.sealId).toBe(st.sealId); // mesmo vídeo = mesmo selo
    }, 180_000);
    it('verifySeal lê o manifest embutido nos BYTES (sem rede): válido, confiável e com o selo; adulterado = inválido; sem selo = nenhum', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      const key = (await asSystem((db) => db.query('SELECT signed_video_key FROM authenticity_records WHERE id=$1', [st.sealId]))).rows[0].signed_video_key as string;
      const v = await authenticityService.verifySeal(key);
      expect(v).toMatchObject({ embedded: true, manifestPresent: true, valid: true, trusted: true, state: 'Trusted', verifyUrl: null, signedBy: 'NexusReel' });
      expect(v.seal).toMatchObject({ kind: 'ai_human_directed', humanDirected: true }); expect(v.actions).toContain('c2pa.created');
      const bytes = await storage.get(refLocation(key).bucket, refLocation(key).key); const bad = Buffer.from(bytes); bad[bad.length - 4000] ^= 0xff;
      const t = await readEmbedded(bad); expect(t).toMatchObject({ embedded: true, valid: false, state: 'Invalid' }); expect(t.failures.join(',')).toMatch(/hash/i);
      expect(await readEmbedded(video)).toMatchObject({ manifestPresent: false, state: 'none', valid: false });
      await expect(authenticityService.verifySeal('https://evil.example/fake.mp4')).rejects.toMatchObject({ status: 422, code: 'external_url_not_allowed' });
      await expect(authenticityService.verifySeal('http://169.254.169.254/latest')).rejects.toMatchObject({ status: 422 });
      expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore();
      const viaApi = await http.get(`/api/v1/projects/${pid}/seal/verify`).set(auth(a)); expect(viaApi.body).toMatchObject({ valid: true, embedded: true, verifyUrl: null });
    });
    it('verificação pública por upload (sem login): selado = válido; adulterado = inválido; não-MP4 = 415', async () => {
      const key = (await asSystem((db) => db.query('SELECT signed_video_key FROM authenticity_records WHERE id=$1', [st.sealId]))).rows[0].signed_video_key as string;
      const bytes = await storage.get('videos', key);
      const ok = await http.post('/api/v1/seal/verify').set('content-type', 'video/mp4').send(bytes); expect(ok.status, JSON.stringify(ok.body)).toBe(200); expect(ok.body).toMatchObject({ valid: true, embedded: true, seal: { humanDirected: true } });
      const bad = Buffer.from(bytes); bad[bad.length - 4000] ^= 0xff; expect((await http.post('/api/v1/seal/verify').set('content-type', 'video/mp4').send(bad)).body.valid).toBe(false);
      expect((await http.post('/api/v1/seal/verify').set('content-type', 'video/mp4').send(Buffer.from('nao e video nenhum'))).status).toBe(415);
    });
    it('sem certificado configurado = 503 seal_not_configured; outro usuário não vê o selo', async () => {
      const prev = env.C2PA_SIGNER; (env as any).C2PA_SIGNER = 'none';
      try { const p2 = await project(a, 'Sem cert', ['x']); const r = await http.post(`/api/v1/projects/${p2}/seal`).set(auth(a)).set(idem()); expect(r.status).toBe(503); expect(r.body.code).toBe('seal_not_configured'); }
      finally { (env as any).C2PA_SIGNER = prev; }
      expect((await http.get(`/api/v1/projects/${pid}/seal`).set(auth(b))).status).toBe(404);
    });
  });

  describe('live commerce com avatar de IA', () => {
    let cat: string; let sid: string;
    it('B2B, opt-in do lojista e rótulo "IA" obrigatórios; avatar próprio exige consentimento avatar_live', async () => {
      cat = await catalog(biz); const base = { catalogId: cat, title: 'Vitrine 24h', avatar: { source: 'preset', preset: 'ana' }, aiLabelEnabled: true, merchantOptIn: true };
      expect((await http.post('/api/v1/live/sessions').set(auth(a)).set(idem()).send({ ...base, catalogId: await catalog(a) })).body.code).toBe('b2b_plan_required');
      expect((await http.post('/api/v1/live/sessions').set(auth(biz)).set(idem()).send({ ...base, aiLabelEnabled: false })).body.code).toBe('ai_label_required');
      expect((await http.post('/api/v1/live/sessions').set(auth(biz)).set(idem()).send({ ...base, merchantOptIn: false })).body.code).toBe('merchant_opt_in_required');
      expect((await http.post('/api/v1/live/sessions').set(auth(biz)).set(idem()).send({ ...base, avatar: { source: 'custom' } })).body.code).toBe('consent_required');
      expect((await http.post('/api/v1/live/sessions').set(auth(biz)).set(idem()).send({ ...base, catalogId: await catalog(a) })).status).toBe(404); // catálogo de outra empresa
      await resetRate(biz); // 5 criações/h por usuário: as recusas acima também contam
      const c = await http.post('/api/v1/live/consent').set(auth(biz)); expect(c.status).toBe(201); expect(c.body.type).toBe('avatar_live');
      expect((await http.post('/api/v1/live/sessions').set(auth(biz)).set(idem()).send({ ...base, avatar: { source: 'custom' } })).status).toBe(201);
      const r = await http.post('/api/v1/live/sessions').set(auth(biz)).set(idem()).send(base); expect(r.status, JSON.stringify(r.body)).toBe(201); sid = r.body.sessionId;
      expect(r.body.aiLabel).toMatchObject({ enabled: true, visible: true, text: 'IA' }); expect(r.body.disclosure).toMatch(/avatar de inteligência artificial \(IA\)/);
      expect((await asSystem((db) => db.query('UPDATE live_sessions SET ai_label_enabled=false WHERE id=$1', [sid]).then(() => 'ok', (e) => e.code)))).toBe('23514'); // CHECK no banco
    });
    it('startLive grava o AVISO de IA antes de entrar no ar; feed público mostra o rótulo e registra cada exibição', async () => {
      const s = await http.post(`/api/v1/live/sessions/${sid}/start`).set(auth(biz)).set(idem()); expect(s.status, JSON.stringify(s.body)).toBe(200); expect(s.body).toMatchObject({ status: 'live', disclosureShown: true });
      const ev = (await http.get(`/api/v1/live/sessions/${sid}`).set(auth(biz))).body.events.map((e: any) => e.type); expect(ev).toEqual(['created', 'ai_disclosure_shown', 'started']);
      for (let i = 0; i < 3; i++) { const w = await http.get(`/api/v1/live/${sid}/watch`); expect(w.status).toBe(200);
        expect(w.body.aiLabel).toMatchObject({ visible: true, text: 'IA' }); expect(w.body.disclosure).toMatchObject({ shownAtStart: true }); expect(w.body.avatar).toMatchObject({ synthetic: true, provider: 'mock' });
        expect(w.body.now.name).toMatch(/^Bike/); expect(w.body.now.line).toMatch(/R\$/); expect(w.body.products).toHaveLength(3); expect(JSON.stringify(w.body)).not.toContain(biz.email); }
      expect((await http.get(`/api/v1/live/sessions/${sid}`).set(auth(biz))).body.aiLabel.impressions).toBe(3);
      expect((await asSystem((db) => db.query('SELECT label_impressions FROM live_sessions WHERE id=$1', [sid]))).rows[0].label_impressions).toBe(3);
      expect((await asSystem((db) => db.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='avatar_live_script'`, [biz.id]))).rows[0].n).toBe(1);
      expect((await http.get(`/api/v1/live/sessions/${sid}`).set(auth(a))).status).toBe(404);
    });
    it('stopLive encerra: feed público some; revogar o consentimento encerra lives com avatar próprio', async () => {
      expect((await http.post(`/api/v1/live/sessions/${sid}/stop`).set(auth(biz)).set(idem())).body.status).toBe('ended');
      expect((await http.get(`/api/v1/live/${sid}/watch`)).status).toBe(404);
      expect((await http.post(`/api/v1/live/sessions/${sid}/start`).set(auth(biz)).set(idem())).status).toBe(409);
      expect((await http.delete('/api/v1/live/consent').set(auth(biz))).status).toBe(204);
      const l = await http.get('/api/v1/live/sessions').set(auth(biz)); expect(l.body.consent.avatarLive).toBe(false); expect(l.body.items.filter((x: any) => x.avatar.source === 'custom').every((x: any) => x.status === 'ended')).toBe(true);
    });
  });

  describe('rate limit (429)', () => {
    it('scoreEngagement: 60/h por usuário → 61ª = 429', async () => {
      expect(SCORE_LIMIT).toMatchObject({ limit: 60, windowSec: 3600, by: 'user' }); const s = await signup({ plan: 'pro' }); const codes: number[] = [];
      for (let i = 0; i < 61; i++) codes.push((await http.post(`/api/v1/projects/${randomUUID()}/insights`).set(auth(s))).status);
      expect(codes.slice(0, 60).every((c) => c === 404)).toBe(true); expect(codes[60]).toBe(429);
    });
    it('createLiveSession: 5/h por usuário → 6ª = 429', async () => {
      expect(LIVE_CREATE_LIMIT).toMatchObject({ limit: 5, windowSec: 3600, by: 'user' }); const s = await signup({ plan: 'business' }); const codes: number[] = [];
      for (let i = 0; i < 6; i++) codes.push((await http.post('/api/v1/live/sessions').set(auth(s)).set(idem()).send({ catalogId: randomUUID(), title: 'x', avatar: { source: 'preset' }, aiLabelEnabled: true, merchantOptIn: true })).status);
      expect(codes.slice(0, 5).every((c) => c === 404)).toBe(true); expect(codes[5]).toBe(429);
    });
  });

  describe('LGPD', () => {
    it('exportação traz estimativas, séries, selos e lives; exclusão da conta apaga tudo', async () => {
      await resetRate(biz);
      const exId = (await asSystem((db) => db.query(`INSERT INTO data_export_requests (user_id) VALUES ($1) RETURNING id`, [a.id]))).rows[0].id as string;
      await complianceService.buildExport(exId, a.id);
      const key = (await asSystem((db) => db.query('SELECT storage_key FROM data_export_requests WHERE id=$1', [exId]))).rows[0].storage_key as string;
      const exp = JSON.parse((await storage.get('exports', key)).toString());
      expect(exp.predictions.length).toBeGreaterThan(0); expect(exp.series.length).toBe(1); expect(exp.seriesEpisodes.length).toBe(3); expect(exp.authenticity.length).toBeGreaterThan(0);
      await complianceService.hardDelete(biz.id);
      for (const t of ['live_sessions', 'live_session_events']) expect((await asSystem((db) => db.query(`SELECT count(*)::int n FROM ${t} WHERE owner_id=$1`, [biz.id]))).rows[0].n).toBe(0);
    });
  });
});
