import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { boot, shutdown, http, signup, auth, waitFor, type Session } from './helpers.js';
import { asSystem } from '../src/db/pool.js';
import { env } from '../src/config/env.js';
import { invalidateFlags } from '../src/modules/flags.service.js';
import { storage } from '../src/providers/storage.js';
import { ffmpeg, withTmp } from '../src/utils/ffmpeg.js';
import { logger } from '../src/observability/logger.js';
import { contrast, cues, resolveStyle, signExport, toAss, toSrt, toVtt, verifyExport, STYLE_PRESETS } from '../src/modules/accessibility/captions.js';
import { sanitize } from '../src/modules/accessibility/describe.js';
import { accessibilityService } from '../src/modules/accessibility/accessibilityService.js';
import { complianceService } from '../src/modules/compliance/compliance.service.js';

/**
 * Módulo 11 — Acessibilidade + Teleprompter (Postgres/Redis reais, FFmpeg/libass reais).
 * Aceite: legendas animadas pt-BR e en; audiodescrição revisável; SRT/VTT assinados; teleprompter só recebe a gravação com
 * opt-in explícito (sem ele nenhum byte é lido nem guardado); flags desligadas = app idêntico; nada de texto em log.
 */
let a: Session; let b: Session; let video: Buffer; const logs: string[] = [];
const setFlags = async (on: boolean) => { await asSystem((db) => db.query(`UPDATE feature_flags SET enabled=$1, rollout_percent=$2 WHERE key IN ('ff_accessibility','ff_teleprompter')`, [on, on ? 100 : 0])); await invalidateFlags(); };
const idem = () => ({ 'idempotency-key': `a11y-${randomUUID()}` });
const sha = (x: Buffer) => createHash('sha256').update(x).digest('hex');
const pathOf = (url: string) => url.replace(env.PUBLIC_API_URL, '');
const download = async (url: string) => (await http.get(pathOf(url)).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); })).body as Buffer;
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from('webm-recording-' + 'x'.repeat(2000))]);
const MARKERS = ['Zorbaflux', 'Quixandria', 'mariana@exemplo.com', 'Teleprontix'];
async function project(s: Session) {
  const id = (await asSystem((db) => db.query(`INSERT INTO projects (user_id, title, script, status, duration_sec) VALUES ($1,'A11y','Roteiro.','ready',8) RETURNING id`, [s.id]))).rows[0].id as string;
  const sc = [['Zorbaflux chegou para mudar seu treino.', 'Mulher grávida segurando a bike Zorbaflux; contato mariana@exemplo.com'], ['Garanta a sua Quixandria hoje.', 'Close na bicicleta Quixandria azul em uma rua ao entardecer']];
  for (const [i, [t, pr]] of sc.entries()) await asSystem((db) => db.query(`INSERT INTO scenes (project_id, index, text, prompt, reference_mode, status, duration_sec, selected) VALUES ($1,$2,$3,$4,$5,'done',4,true)`, [id, i, t, pr, i === 0 ? 'person' : 'product']));
  await storage.put('videos', `projects/${id}/final.mp4`, video, 'video/mp4'); await asSystem((db) => db.query('UPDATE projects SET final_video_url=$2 WHERE id=$1', [id, `projects/${id}/final.mp4`]));
  return id;
}
const waitAsset = (s: Session, id: string, want: string[]) => waitFor(async () => { const x = await http.get(`/api/v1/accessibility/assets/${id}`).set(auth(s)); return want.includes(x.body.status) || x.body.status === 'failed' ? x.body : undefined; }, 240_000, 200);

beforeAll(async () => {
  for (const lvl of ['debug', 'info', 'warn', 'error'] as const) { const orig = logger[lvl].bind(logger); vi.spyOn(logger, lvl).mockImplementation(((...x: unknown[]) => { logs.push(JSON.stringify(x)); return (orig as (...y: unknown[]) => void)(...x); }) as never); }
  await boot(); a = await signup({ plan: 'pro', credits: 50 }); b = await signup({ plan: 'pro', credits: 50 });
  video = await withTmp(async (d) => { const o = join(d, 'v.mp4'); await ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x1e3a8a:s=360x640:r=25:d=8', '-f', 'lavfi', '-i', 'sine=frequency=330:d=8', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', o], 120_000); return readFile(o); });
}, 180_000);
afterAll(async () => { await setFlags(false); await shutdown(); });

describe('Módulo 11 — unidade', () => {
  it('todos os estilos de legenda passam de 4,5:1 (texto e destaque), mesmo com fundo claro atrás da caixa', () => {
    expect(contrast('#FFFFFF', '#000000')).toBe(21); expect(contrast('#777777', '#FFFFFF')).toBeLessThan(4.5);
    for (const k of Object.keys(STYLE_PRESETS)) { const s = resolveStyle({ preset: k as never }); expect(s.contrast.text, k).toBeGreaterThanOrEqual(4.5); expect(s.contrast.highlight, k).toBeGreaterThanOrEqual(4.5); }
  });
  it('falas legíveis (≤6 palavras, ≤32 caracteres) e karaokê com \\kf em cada palavra; SRT/VTT válidos', () => {
    const w = 'um dois três quatro cinco seis sete oito nove dez'.split(' ').map((x, i) => ({ w: x, start: i * 300, end: i * 300 + 250, scene: 0 }));
    const c = cues(w); expect(c.every((q) => q.words.length <= 6 && q.words.map((x) => x.w).join(' ').length <= 32)).toBe(true);
    const ass = toAss(c, resolveStyle({ preset: 'alto_contraste' }), { width: 360, height: 640 });
    expect((ass.match(/\\kf\d+/g) ?? []).length).toBe(10); expect(ass).toMatch(/Style: A11y,DejaVu Sans,\d+,&H0000FFFF,&H00FFFFFF/); expect(ass).toMatch(/,3,\d+,0,2,/); // caixa opaca, embaixo
    expect(toSrt(c)).toMatch(/^1\n00:00:00,000 --> 00:00:01,750\num dois três quatro cinco seis\n/); expect(toVtt(c)).toMatch(/^WEBVTT\n\n1\n00:00:00\.000 --> /);
  });
  it('assinatura da exportação: confere o conteúdo exato; 1 caractere mudado invalida', () => {
    const s = signExport('1\n00:00:00,000 --> 00:00:01,000\nOi\n'); expect(verifyExport('1\n00:00:00,000 --> 00:00:01,000\nOi\n', s)).toBe(true);
    expect(verifyExport('1\n00:00:00,000 --> 00:00:01,000\nOi!\n', s)).toBe(false); expect(verifyExport('x', 'v1.abc')).toBe(false);
  });
  it('audiodescrição não revela dado sensível: contatos, documentos e atributos pessoais saem', () => {
    const x = sanitize('Mulher grávida e cadeirante, católica, mostra a bike; contato ana@x.com, (11) 98765-4321, CPF 123.456.789-09, @ana.fit');
    for (const bad of ['grávida', 'cadeirante', 'católica', 'ana@x.com', '98765', '123.456', '@ana']) expect(x.text).not.toContain(bad);
    expect(x.text).toMatch(/mostra a bike/); expect(x.redactions).toBeGreaterThanOrEqual(7);
  });
});

describe('Módulo 11 — flags desligadas = app idêntico', () => {
  it('todas as rotas respondem 404 (inclusive o envio da gravação com opt-in)', async () => {
    await setFlags(false); const pid = await project(a); const x = randomUUID();
    for (const [m, u] of [['get', '/api/v1/accessibility/config'], ['post', `/api/v1/projects/${pid}/accessibility/captions`], ['post', `/api/v1/projects/${pid}/accessibility/audio-description`], ['post', `/api/v1/projects/${pid}/accessibility/transcript`],
      ['get', '/api/v1/teleprompter/sessions'], ['post', '/api/v1/teleprompter/sessions']] as const) expect((await (http as any)[m](u).set(auth(a)).set(idem()).send(m === 'post' ? { format: 'srt', locales: ['pt-BR'], script: 'x' } : undefined)).status, `${m} ${u}`).toBe(404);
    expect((await http.post(`/api/v1/teleprompter/sessions/${x}/recording`).set(auth(a)).set(idem()).set('x-upload-opt-in', 'true').set('content-type', 'video/webm').send(WEBM)).status).toBe(404);
    expect((await http.get(`/api/v1/projects/${pid}`).set(auth(a))).status).toBe(200);
  });
});

describe('Módulo 11 — acessibilidade (flags ligadas)', () => {
  let pid: string;
  beforeAll(async () => { await setFlags(true); pid = await project(a); }, 60_000);
  it('legendas animadas pt-BR e en: karaokê por palavra gravado num vídeo NOVO; destaque visível no quadro; ai_usage', async () => {
    const before = sha(await storage.get('videos', `projects/${pid}/final.mp4`));
    const r = await http.post(`/api/v1/projects/${pid}/accessibility/captions`).set(auth(a)).set(idem()).send({ locales: ['pt-BR', 'en'], style: { preset: 'padrao' } });
    expect(r.status, JSON.stringify(r.body)).toBe(202); expect(r.body.items).toHaveLength(2);
    const done = await Promise.all(r.body.items.map((x: any) => waitAsset(a, x.assetId, ['ready'])));
    for (const d of done) { expect(d.status, JSON.stringify(d)).toBe('ready'); expect(d.fileUrl).toMatch(/sig|signature|exp/); expect(d.style.contrast.text).toBeGreaterThanOrEqual(4.5); }
    const pt = done.find((x: any) => x.locale === 'pt-BR'), en = done.find((x: any) => x.locale === 'en');
    expect(pt.words.map((w: any) => w.w)).toContain('Zorbaflux'); expect(en.words.length).toBeGreaterThan(0);
    const ass = (await download(pt.extraFileUrl)).toString(); expect((ass.match(/\\kf\d+/g) ?? []).length).toBe(pt.words.length); expect(ass).toContain('Zorbaflux');
    const mp4 = await download(pt.fileUrl); expect(sha(mp4)).not.toBe(before); expect(sha(await storage.get('videos', `projects/${pid}/final.mp4`))).toBe(before); // original intacto
    // quadro no meio da 1ª fala: tem pixels da cor de destaque (#FFD60A) — a palavra falada está "acesa"
    const w0 = pt.words[2]; const yellow = await withTmp(async (d) => { const f = join(d, 'c.mp4'); await import('node:fs/promises').then((fs) => fs.writeFile(f, mp4));
      const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', ((w0.end + 50) / 1000).toFixed(2), '-i', f, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']); let n = 0; for (let i = 0; i < raw.length; i += 3) if (raw[i]! > 200 && raw[i + 1]! > 170 && raw[i + 2]! < 90) n++; return n; });
    expect(yellow).toBeGreaterThan(30);
    expect((await asSystem((db) => db.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='captions_animated'`, [a.id]))).rows[0].n).toBe(2);
    expect((await asSystem((db) => db.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='caption_translate'`, [a.id]))).rows[0].n).toBe(1);
    const raw = (await asSystem((db) => db.query('SELECT content_json::text t FROM accessibility_assets WHERE id=$1', [pt.assetId]))).rows[0].t as string; expect(raw).not.toContain('Zorbaflux'); expect(raw).toContain('"enc"'); // cifrado
  }, 300_000);
  it('audiodescrição: filtrada, PARADA em revisão; sem aprovação não exporta; aprovada gera faixa narrada + VTT descriptions', async () => {
    const r = await http.post(`/api/v1/projects/${pid}/accessibility/audio-description`).set(auth(a)).set(idem()).send({}); expect(r.status, JSON.stringify(r.body)).toBe(202);
    const st = await waitAsset(a, r.body.assetId, ['pending_review']); expect(st.status).toBe('pending_review'); expect(st.fileUrl).toBeNull(); expect(st.reviewed).toBe(false);
    expect(st.descriptions).toHaveLength(2); const all = st.descriptions.map((d: any) => d.text).join(' ');
    expect(all).not.toMatch(/grávida|mariana@exemplo\.com/); expect(all).toMatch(/Quixandria azul/); expect(st.descriptions[0].redactions).toBeGreaterThanOrEqual(2);
    expect((await asSystem((db) => db.query(`UPDATE accessibility_assets SET status='ready' WHERE id=$1`, [st.assetId]).then(() => 'ok', (e) => e.code)))).toBe('23514'); // CHECK: pronto exige revisão
    expect((await http.post(`/api/v1/accessibility/assets/${st.assetId}/review`).set(auth(a)).set(idem()).send({ approve: false })).status).toBe(400);
    expect((await http.post(`/api/v1/accessibility/assets/${st.assetId}/review`).set(auth(b)).set(idem()).send({ approve: true })).status).toBe(404);
    const rv = await http.post(`/api/v1/accessibility/assets/${st.assetId}/review`).set(auth(a)).set(idem()).send({ approve: true, descriptions: [{ scene: 0, text: 'Pessoa pedalando a bike na ciclovia; CPF 123.456.789-09' }] });
    expect(rv.status, JSON.stringify(rv.body)).toBe(200); expect(rv.body.reviewed).toBe(true); expect(rv.body.descriptions[0].text).not.toContain('123.456');
    const done = await waitAsset(a, st.assetId, ['ready']); expect(done.status, JSON.stringify(done)).toBe('ready');
    const vtt = (await download(done.extraFileUrl)).toString(); expect(vtt).toMatch(/^WEBVTT - descriptions/); expect(vtt).toContain('Pessoa pedalando a bike');
    const mp4 = await download(done.fileUrl); const probe = await withTmp(async (d) => { const f = join(d, 'ad.mp4'); await import('node:fs/promises').then((fs) => fs.writeFile(f, mp4)); return execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', f]).toString(); });
    expect(JSON.parse(probe).streams.map((s: any) => s.codec_type)).toEqual(['video', 'audio']); expect(Math.abs(Number(JSON.parse(probe).format.duration) - 8)).toBeLessThan(0.5);
    expect((await asSystem((db) => db.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='audio_description'`, [a.id]))).rows[0].n).toBe(1);
    expect((await asSystem((db) => db.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='tts_inline'`, [a.id]))).rows[0].n).toBe(2);
    expect((await http.post(`/api/v1/accessibility/assets/${st.assetId}/review`).set(auth(a)).set(idem()).send({ approve: true })).status).toBe(409);
  }, 300_000);
  it('transcrição SRT e VTT assinadas, URL assinada, retenção de 90 dias; adulterada = 422', async () => {
    for (const f of ['srt', 'vtt'] as const) {
      const r = await http.post(`/api/v1/projects/${pid}/accessibility/transcript`).set(auth(a)).set(idem()).send({ format: f }); expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body).toMatchObject({ format: f, signatureAlgorithm: 'HMAC-SHA256', status: 'ready' }); expect(r.body.signature).toMatch(/^v1\./); expect(r.body.fileUrl).toMatch(/sig|signature|exp/);
      expect(Math.round((+new Date(r.body.expiresAt) - Date.now()) / 86_400_000)).toBe(90);
      const body = (await download(r.body.fileUrl)).toString(); expect(body).toMatch(f === 'srt' ? /^1\n00:00:0\d,\d{3} --> / : /^WEBVTT\n/); expect(body).toContain('Zorbaflux');
      expect(createHash('sha256').update(body).digest('hex')).toBe(r.body.sha256);
      expect((await http.post('/api/v1/accessibility/transcripts/verify').set(auth(a)).send({ content: body, signature: r.body.signature })).body.valid).toBe(true);
      expect((await http.post('/api/v1/accessibility/transcripts/verify').set(auth(a)).send({ content: body.replace('Zorbaflux', 'Zorbaflix'), signature: r.body.signature })).body.code).toBe('invalid_signature');
    }
    await asSystem((db) => db.query(`UPDATE accessibility_assets SET expires_at = now() - interval '1 minute' WHERE project_id=$1 AND type LIKE 'transcript_%'`, [pid]));
    expect((await accessibilityService.purgeExpired()).deleted).toBe(2);
    expect((await asSystem((db) => db.query(`SELECT count(*)::int n FROM accessibility_assets WHERE project_id=$1 AND type LIKE 'transcript_%'`, [pid]))).rows[0].n).toBe(0);
  }, 120_000);
});

describe('Módulo 11 — teleprompter', () => {
  let sid: string;
  it('startSession: roteiro + ajustes normalizados e tempo estimado', async () => {
    const r = await http.post('/api/v1/teleprompter/sessions').set(auth(a)).set(idem()).send({ script: 'Teleprontix ' + 'palavra '.repeat(129), settings: { wpm: 130, mirror: true } });
    expect(r.status, JSON.stringify(r.body)).toBe(201); sid = r.body.sessionId;
    expect(r.body.settings).toEqual({ wpm: 130, fontScale: 1.6, mirror: true, countdownSec: 3, guide: true }); expect(r.body.words).toBe(130); expect(r.body.estimatedSec).toBe(63);
    expect(r.body.recording).toEqual({ uploaded: false, storedOn: 'device' });
    expect((await http.post('/api/v1/teleprompter/sessions').set(auth(a)).set(idem()).send({ script: 'x', settings: { wpm: 999 } })).status).toBe(400);
  });
  it('SEM opt-in explícito a gravação não chega ao servidor (422, nada guardado); com opt-in: só WebM/MP4, uma vez', async () => {
    for (const h of [{}, { 'x-upload-opt-in': 'false' }, { 'x-upload-opt-in': '1' }]) {
      const r = await http.post(`/api/v1/teleprompter/sessions/${sid}/recording`).set(auth(a)).set(idem()).set(h).set('content-type', 'video/webm').send(WEBM);
      expect(r.status).toBe(422); expect(r.body.code).toBe('upload_opt_in_required');
    }
    expect((await asSystem((db) => db.query('SELECT recorded_video_url FROM teleprompter_sessions WHERE id=$1', [sid]))).rows[0].recorded_video_url).toBeNull();
    expect(await storage.get('videos', `teleprompter/${a.id}/${sid}.webm`).then(() => 'existe', () => 'não existe')).toBe('não existe');
    expect((await http.post(`/api/v1/teleprompter/sessions/${sid}/recording`).set(auth(a)).set('x-upload-opt-in', 'true').set('content-type', 'video/webm').send(WEBM)).status).toBe(400); // sem Idempotency-Key
    expect((await http.post(`/api/v1/teleprompter/sessions/${sid}/recording`).set(auth(a)).set(idem()).set('x-upload-opt-in', 'true').set('content-type', 'application/octet-stream').send(Buffer.from('nao e video'))).status).toBe(415);
    expect((await http.post(`/api/v1/teleprompter/sessions/${sid}/recording`).set(auth(b)).set(idem()).set('x-upload-opt-in', 'true').set('content-type', 'video/webm').send(WEBM)).status).toBe(404);
    const ok = await http.post(`/api/v1/teleprompter/sessions/${sid}/recording`).set(auth(a)).set(idem()).set('x-upload-opt-in', 'true').set('content-type', 'video/webm').send(WEBM);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201); expect(ok.body.recording).toMatchObject({ uploaded: true, mime: 'video/webm', bytes: WEBM.length }); expect(ok.body.recording.uploadOptInAt).toBeTruthy();
    expect(sha(await download(ok.body.recording.url))).toBe(sha(WEBM));
    expect((await http.post(`/api/v1/teleprompter/sessions/${sid}/recording`).set(auth(a)).set(idem()).set('x-upload-opt-in', 'true').set('content-type', 'video/webm').send(WEBM)).status).toBe(409);
    expect((await asSystem((db) => db.query(`UPDATE teleprompter_sessions SET upload_opt_in_at=NULL WHERE id=$1`, [sid]).then(() => 'ok', (e) => e.code)))).toBe('23514'); // CHECK: gravação no servidor exige opt-in
  });
  it('apagar a sessão apaga a gravação enviada', async () => {
    expect((await http.delete(`/api/v1/teleprompter/sessions/${sid}`).set(auth(a))).status).toBe(204);
    expect(await storage.get('videos', `teleprompter/${a.id}/${sid}.webm`).then(() => 'existe', () => 'não existe')).toBe('não existe');
  });
});

describe('Módulo 11 — LGPD e logs', () => {
  it('exportação traz arquivos de acessibilidade e sessões; nenhum texto (roteiro, legenda, descrição, e-mail) em log', async () => {
    const exId = (await asSystem((db) => db.query(`INSERT INTO data_export_requests (user_id) VALUES ($1) RETURNING id`, [a.id]))).rows[0].id as string;
    await complianceService.buildExport(exId, a.id);
    const key = (await asSystem((db) => db.query('SELECT storage_key FROM data_export_requests WHERE id=$1', [exId]))).rows[0].storage_key as string;
    const exp = JSON.parse((await storage.get('exports', key)).toString()); expect(exp.accessibility.length).toBeGreaterThanOrEqual(3); expect(exp.teleprompterSessions).toBeDefined();
    const all = logs.join('\n'); expect(logs.length).toBeGreaterThan(3); for (const m of MARKERS) expect(all).not.toContain(m);
    const auditTxt = (await asSystem((db) => db.query(`SELECT coalesce(string_agg(metadata::text,' '),'') t FROM audit_logs WHERE action LIKE 'a11y.%' OR action LIKE 'teleprompter.%'`))).rows[0].t as string;
    expect(auditTxt.length).toBeGreaterThan(0); for (const m of MARKERS) expect(auditTxt).not.toContain(m);
  });
});
