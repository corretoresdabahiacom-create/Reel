import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { boot, shutdown, http, signup, auth, waitFor, redis, type Session } from './helpers.js';
import { asSystem } from '../src/db/pool.js';
import { invalidateFlags } from '../src/modules/flags.service.js';
import { storage, refLocation } from '../src/providers/storage.js';
import { ffmpeg, ffprobeDuration, withTmp } from '../src/utils/ffmpeg.js';
import { logger } from '../src/observability/logger.js';
import { plan, findPhrase } from '../src/modules/agent/planner.js';
import { normalizeOps } from '../src/modules/transcript/edits.js';
import { transcriptService } from '../src/modules/transcript/transcriptService.js';
import { complianceService } from '../src/modules/compliance/compliance.service.js';
import { TRANSCRIBE_LIMIT, AGENT_EXECUTE_LIMIT } from '../src/modules/transcript/transcript.routes.js';
import type { Word } from '../src/modules/transcript/stt.js';

/**
 * Módulo 9 — Transcrição + edição pelo texto + agente (FFmpeg local, STT/TTS mock, Postgres/Redis reais).
 * Checkpoint 9: a transcrição não aparece em nenhum log (spy em todos os níveis + dump para grep) e o rate limit (429)
 * está ativo em transcrever (20/h) e executar agente (10/h).
 */
let a: Session; let b: Session;
// Palavras-marcador: se aparecerem em qualquer log, o teste falha (e o grep do checkpoint também).
const SCENES = ['Zorbaflux pessoal bem vindos ao canal', 'hoje vamos falar de bicicletas Quixandria vinte nove', 'Wumpelstad curtir e compartilhar agora'];
const MARKERS = ['Zorbaflux', 'Quixandria', 'Wumpelstad', 'Trombetilda'];
const logs: string[] = [];
const setFlags = async (on: boolean) => { await asSystem((db) => db.query(`UPDATE feature_flags SET enabled=$1, rollout_percent=$2 WHERE key IN ('ff_transcript','ff_agent')`, [on, on ? 100 : 0])); await invalidateFlags(); };
const idem = () => ({ 'idempotency-key': `tr-${randomUUID()}` });
const resetRate = async (s: Session) => { for (const sc of ['transcribe', 'agent_execute', 'transcript_edit', 'agent_plan']) { const k = await redis.keys(`rl:${sc}*:${s.id}:*`); if (k.length) await redis.del(...k); } };
async function source(): Promise<Buffer> {
  return withTmp(async (d) => {
    const o = join(d, 'v.mp4'); // 3 cenas de 4 s: "fala" (tom) entre 0,5 s e 3,5 s de cada cena, silêncio nas bordas
    await ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=30:d=12', '-f', 'lavfi', '-i', 'sine=frequency=330:d=12', '-filter:a', "volume='if(lt(mod(t,4),0.5)+gt(mod(t,4),3.5),0,1)':eval=frame",
      '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', o], 120_000);
    return readFile(o);
  });
}
async function project(s: Session, buf: Buffer) {
  const id = (await asSystem((db) => db.query(`INSERT INTO projects (user_id, title, script, status, duration_sec) VALUES ($1,'Transcrição','Roteiro.','ready',12) RETURNING id`, [s.id]))).rows[0].id as string;
  for (const [i, t] of SCENES.entries()) await asSystem((db) => db.query(`INSERT INTO scenes (project_id, index, text, status, duration_sec, selected) VALUES ($1,$2,$3,'done',4,true)`, [id, i, t]));
  const key = `projects/${id}/final.mp4`; await storage.put('videos', key, buf, 'video/mp4'); await asSystem((db) => db.query('UPDATE projects SET final_video_url=$2 WHERE id=$1', [id, key]));
  return id;
}
const durOf = (key: string) => withTmp(async (d) => { const f = join(d, 'x.mp4'); const l = refLocation(key); await writeFile(f, await storage.get(l.bucket, l.key)); return ffprobeDuration(f); });
const finalKey = async (pid: string) => (await asSystem((db) => db.query('SELECT final_video_url FROM projects WHERE id=$1', [pid]))).rows[0].final_video_url as string;
async function transcribe(s: Session, pid: string) {
  const r = await http.post(`/api/v1/projects/${pid}/transcript`).set(auth(s)).set(idem()); expect(r.status, JSON.stringify(r.body)).toBe(202);
  return waitFor(async () => { const x = await http.get(`/api/v1/projects/${pid}/transcript`).set(auth(s)); return x.body.status === 'done' || x.body.status === 'failed' ? x.body : undefined; }, 120_000, 150);
}
async function waitEdit(s: Session, pid: string, editId: string) { return waitFor(async () => { const x = await http.get(`/api/v1/projects/${pid}/transcript/edits/${editId}`).set(auth(s)); return ['previewed', 'failed'].includes(x.body.status) ? x.body : undefined; }, 180_000, 150); }
async function waitRun(s: Session, pid: string, runId: string) { return waitFor(async () => { const x = await http.get(`/api/v1/projects/${pid}/agent/runs/${runId}`).set(auth(s)); return ['previewed', 'failed'].includes(x.body.status) ? x.body : undefined; }, 180_000, 150); }
const idxOf = (words: Array<{ w: string }>, w: string) => words.findIndex((x) => x.w === w);

beforeAll(async () => {
  for (const lvl of ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const) { const orig = logger[lvl].bind(logger); vi.spyOn(logger, lvl).mockImplementation(((...args: unknown[]) => { logs.push(JSON.stringify(args)); return (orig as (...x: unknown[]) => void)(...args); }) as never); }
  const origChild = logger.child.bind(logger); vi.spyOn(logger, 'child').mockImplementation(((...args: unknown[]) => { const c = (origChild as unknown as (...x: unknown[]) => any)(...args); for (const lvl of ['debug', 'info', 'warn', 'error'] as const) { const o = c[lvl].bind(c); (c as any)[lvl] = (...x: unknown[]) => { logs.push(JSON.stringify(x)); return (o as (...y: unknown[]) => void)(...x); }; } return c; }) as never);
  await boot(); a = await signup({ plan: 'pro', credits: 100 }); b = await signup({ plan: 'pro', credits: 100 });
}, 120_000);
afterAll(async () => {
  if (process.env.TRANSCRIPT_LOG_EVIDENCE) await writeFile(process.env.TRANSCRIPT_LOG_EVIDENCE, logs.join('\n') + '\n'); // evidência do checkpoint: todas as linhas de log da suíte
  await setFlags(false); await shutdown();
});

describe('Módulo 9 — unidade', () => {
  const words: Word[] = 'eu gosto muito de café com leite'.split(' ').map((w, i) => ({ w, start: i * 500, end: i * 500 + 400, conf: 1, scene: 0 }));
  it('planner entende pt/en/es e nunca devolve mais de 20 passos', () => {
    const ctx = { durationMs: 12000, scenes: [{ index: 0, startMs: 0, endMs: 4000, text: '' }, { index: 1, startMs: 4000, endMs: 8000, text: '' }], words };
    expect(plan('corte os primeiros 2 segundos', ctx).steps[0]!.op).toMatchObject({ type: 'cut', startMs: 0, endMs: 2000 });
    expect(plan('cut the last 3 seconds', ctx).steps[0]!.op).toMatchObject({ type: 'cut', startMs: 9000, endMs: 12000 });
    expect(plan('elimina la escena 2', ctx).steps[0]!.op).toMatchObject({ startMs: 4000, endMs: 8000 });
    expect(plan('deixe com 10 segundos', ctx).steps[0]!.op).toMatchObject({ startMs: 10000, endMs: 12000 });
    expect(plan('troque "café" por chá', ctx).steps[0]!.op).toMatchObject({ type: 'replace', text: 'chá', startMs: 2000 });
    expect(plan('remova "muito"', ctx).steps).toHaveLength(1);
    expect(plan('faça um bolo de chocolate', ctx)).toMatchObject({ understood: false, message: 'not_understood' });
    expect(plan('remova "muito"', { ...ctx, words: null })).toMatchObject({ understood: false, message: 'needs_transcript' });
    const many: Word[] = Array.from({ length: 60 }, (_, i) => ({ w: 'x', start: i * 1000, end: i * 1000 + 200, conf: 1, scene: 0 }));
    expect(plan('remover pausas', { ...ctx, durationMs: 61000, words: many }).steps.length).toBe(20);
  });
  it('busca de frase ignora acento/caixa/pontuação; cortes encostados se juntam; sobreposição é recusada', () => {
    expect(findPhrase(words, 'CAFE, com')).toEqual([[4, 5]]);
    expect(normalizeOps([{ type: 'cut', startMs: 0, endMs: 1000 }, { type: 'cut', startMs: 1000, endMs: 2000 }], 12000)).toHaveLength(1);
    expect(() => normalizeOps([{ type: 'cut', startMs: 0, endMs: 3000 }, { type: 'replace', startMs: 2000, endMs: 2500, text: 'x' }], 12000)).toThrow();
    expect(() => normalizeOps([{ type: 'cut', startMs: 0, endMs: 11500 }], 12000)).toThrow();
  });
});

describe('Módulo 9 — flags desligadas = app idêntico', () => {
  it('todas as rotas respondem 404 e o projeto não muda', async () => {
    await setFlags(false); const pid = await project(a, await source()); const before = await finalKey(pid); const rid = randomUUID();
    for (const [m, u] of [['get', '/api/v1/transcript/config'], ['post', `/api/v1/projects/${pid}/transcript`], ['get', `/api/v1/projects/${pid}/transcript`], ['post', `/api/v1/projects/${pid}/transcript/edits`],
      ['post', `/api/v1/projects/${pid}/agent/plan`], ['get', `/api/v1/projects/${pid}/agent/runs`], ['post', `/api/v1/projects/${pid}/agent/runs/${rid}/execute`], ['post', `/api/v1/projects/${pid}/agent/runs/${rid}/apply`]] as const) {
      const r = await (http as any)[m](u).set(auth(a)).set(idem()).send(m === 'post' ? { command: 'corte os primeiros 2 segundos', transcriptId: rid, ops: [] } : undefined);
      expect(r.status, `${m} ${u}`).toBe(404);
    }
    expect(await finalKey(pid)).toBe(before); expect((await http.get(`/api/v1/projects/${pid}`).set(auth(a))).status).toBe(200);
    expect((await asSystem((db) => db.query('SELECT count(*)::int n FROM transcripts WHERE project_id=$1', [pid]))).rows[0].n).toBe(0);
  });
});

describe('Módulo 9 — transcrição e edição pelo texto (flags ligadas)', () => {
  let pid: string; let tr: any;
  beforeAll(async () => { await setFlags(true); await resetRate(a); pid = await project(a, await source()); }, 120_000);

  it('transcreve com tempo por palavra; texto cifrado no banco; ai_usage stt', async () => {
    tr = await transcribe(a, pid); expect(tr.status).toBe('done'); expect(tr.outdated).toBe(false);
    expect(tr.words.length).toBe(SCENES.join(' ').split(' ').length);
    for (const w of tr.words) { expect(w.end).toBeGreaterThan(w.start); expect(typeof w.scene).toBe('number'); }
    for (let i = 1; i < tr.words.length; i++) expect(tr.words[i].start).toBeGreaterThanOrEqual(tr.words[i - 1].end);
    expect(tr.words[0].start).toBeGreaterThanOrEqual(400); // a "fala" só começa em 0,5 s (alinhamento por energia)
    const raw = (await asSystem((db) => db.query('SELECT segments_json::text t, expires_at, created_at FROM transcripts WHERE id=$1', [tr.transcriptId]))).rows[0];
    for (const m of MARKERS.slice(0, 3)) expect(raw.t).not.toContain(m); expect(raw.t).toContain('"enc"');
    expect(Math.round((+new Date(raw.expires_at) - +new Date(raw.created_at)) / 86_400_000)).toBe(90);
    expect((await asSystem((db) => db.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='stt' AND status='ok'`, [a.id]))).rows[0].n).toBeGreaterThanOrEqual(1);
    const cfg = await http.get('/api/v1/transcript/config').set(auth(a)); expect(cfg.body).toMatchObject({ retentionDays: 90, trainingOptOut: true });
  }, 180_000);

  it('outro usuário não vê nem edita a transcrição (RLS + dono)', async () => {
    expect((await http.get(`/api/v1/projects/${pid}/transcript`).set(auth(b))).status).toBe(404);
    expect((await http.post(`/api/v1/projects/${pid}/transcript/edits`).set(auth(b)).set(idem()).send({ transcriptId: tr.transcriptId, ops: [{ type: 'delete', fromWord: 0, toWord: 0 }] })).status).toBe(404);
    expect((await asSystem((db) => db.query('SELECT count(*)::int n FROM transcripts WHERE project_id=$1', [pid]))).rows[0].n).toBe(1);
  });

  it('apagar uma frase → prévia mais curta; nada muda até aplicar; aplicar cria versão nova (derived_from_scene_id)', async () => {
    const before = await finalKey(pid); const d0 = await durOf(before);
    const from = idxOf(tr.words, 'hoje'), to = idxOf(tr.words, 'bicicletas'); expect(from).toBeGreaterThan(0);
    const e = await http.post(`/api/v1/projects/${pid}/transcript/edits`).set(auth(a)).set(idem()).send({ transcriptId: tr.transcriptId, ops: [{ type: 'delete', fromWord: from, toWord: to }] });
    expect(e.status, JSON.stringify(e.body)).toBe(202);
    const st = await waitEdit(a, pid, e.body.editId); expect(st.status, JSON.stringify(st)).toBe('previewed'); expect(st.previewUrl).toMatch(/sig=|signature|exp=/);
    expect(await finalKey(pid)).toBe(before); // staging: o projeto não mudou
    const cutMs = e.body.ops[0].endMs - e.body.ops[0].startMs; expect(st.removedMs).toBeGreaterThan(cutMs - 200);
    const ap = await http.post(`/api/v1/projects/${pid}/transcript/edits/${e.body.editId}/apply`).set(auth(a)).set(idem()); expect(ap.status, JSON.stringify(ap.body)).toBe(200);
    expect(ap.body).toMatchObject({ status: 'applied', previousVideoKept: true }); expect(ap.body.derivedSceneIds.length).toBeGreaterThanOrEqual(1);
    const after = await finalKey(pid); expect(after).not.toBe(before);
    expect(await durOf(after)).toBeLessThan(d0 - (cutMs / 1000) + 0.3);
    const l = refLocation(before); expect((await storage.get(l.bucket, l.key)).length).toBeGreaterThan(0); // original preservado (R1)
    const der = (await asSystem((db) => db.query('SELECT s.derived_from_scene_id, s.version, s.selected, o.index FROM scenes s JOIN scenes o ON o.id = s.derived_from_scene_id WHERE s.id = ANY($1)', [ap.body.derivedSceneIds]))).rows;
    expect(der.length).toBe(ap.body.derivedSceneIds.length); for (const r of der) expect(r.version).toBeGreaterThanOrEqual(2); // versão mais alta sem `selected` = atual (mesma regra dos Módulos 2/3)
    // a transcrição acompanha o vídeo novo, sem as palavras apagadas e sem chamar o provedor de novo
    const t2 = (await http.get(`/api/v1/projects/${pid}/transcript`).set(auth(a))).body; expect(t2.provider).toBe('derived'); expect(t2.outdated).toBe(false);
    expect(t2.words.map((w: any) => w.w)).not.toContain('bicicletas'); expect(t2.words.length).toBe(tr.words.length - (to - from + 1)); tr = t2;
    expect((await http.post(`/api/v1/projects/${pid}/transcript/edits/${e.body.editId}/apply`).set(auth(a)).set(idem())).status).toBe(409);
  }, 300_000);

  it('substituir uma palavra → TTS no ponto (ai_usage tts_inline) e versão nova', async () => {
    const before = await finalKey(pid); const n0 = (await asSystem((db) => db.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='tts_inline'`, [a.id]))).rows[0].n;
    const i = idxOf(tr.words, 'curtir'); expect(i).toBeGreaterThan(0);
    const e = await http.post(`/api/v1/projects/${pid}/transcript/edits`).set(auth(a)).set(idem()).send({ transcriptId: tr.transcriptId, ops: [{ type: 'replace', fromWord: i, toWord: i, text: 'Trombetilda' }] });
    expect(e.status, JSON.stringify(e.body)).toBe(202); const st = await waitEdit(a, pid, e.body.editId); expect(st.status, JSON.stringify(st)).toBe('previewed');
    expect((await asSystem((db) => db.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='tts_inline'`, [a.id]))).rows[0].n).toBe(n0 + 1);
    const ap = await http.post(`/api/v1/projects/${pid}/transcript/edits/${e.body.editId}/apply`).set(auth(a)).set(idem()); expect(ap.status).toBe(200);
    const after = await finalKey(pid); expect(after).not.toBe(before); expect(Math.abs((await durOf(after)) - (await durOf(before)))).toBeLessThan(0.3); // substituir não muda a duração
    const t3 = (await http.get(`/api/v1/projects/${pid}/transcript`).set(auth(a))).body; expect(t3.words.map((w: any) => w.w)).toContain('Trombetilda'); tr = t3;
    const sc = (await asSystem((db) => db.query(`SELECT DISTINCT ON (index) text FROM scenes WHERE project_id=$1 ORDER BY index, selected DESC, version DESC`, [pid]))).rows.map((r) => r.text).join(' ');
    expect(sc).toContain('Trombetilda');
  }, 300_000);

  it('validações: intervalo inválido 422, transcrição desatualizada 409, Idempotency-Key obrigatório', async () => {
    expect((await http.post(`/api/v1/projects/${pid}/transcript/edits`).set(auth(a)).set(idem()).send({ transcriptId: tr.transcriptId, ops: [{ type: 'delete', fromWord: 3, toWord: 999 }] })).status).toBe(422);
    expect((await http.post(`/api/v1/projects/${pid}/transcript/edits`).set(auth(a)).send({ transcriptId: tr.transcriptId, ops: [{ type: 'delete', fromWord: 1, toWord: 1 }] })).status).toBe(400);
    expect((await http.post(`/api/v1/projects/${pid}/transcript`).set(auth(a))).status).toBe(400);
    // o vídeo mudou por fora (ex.: nova montagem): a transcrição fica desatualizada e a edição pelo texto é recusada
    const cur = await finalKey(pid); const l = refLocation(cur); const other = `projects/${pid}/final-outro.mp4`;
    await storage.put('videos', other, await storage.get(l.bucket, l.key), 'video/mp4'); await asSystem((db) => db.query('UPDATE projects SET final_video_url=$2 WHERE id=$1', [pid, other]));
    expect((await http.get(`/api/v1/projects/${pid}/transcript`).set(auth(a))).body.outdated).toBe(true);
    const o = await http.post(`/api/v1/projects/${pid}/transcript/edits`).set(auth(a)).set(idem()).send({ transcriptId: tr.transcriptId, ops: [{ type: 'delete', fromWord: 1, toWord: 1 }] });
    expect(o.status).toBe(409); expect(o.body.code).toBe('transcript_outdated');
    await asSystem((db) => db.query('UPDATE projects SET final_video_url=$2 WHERE id=$1', [pid, cur]));
  });

  describe('agente', () => {
    let runId: string;
    it('comando → plano em staging (agent_runs) → prévia → aplicar só com confirmação → versão nova', async () => {
      await resetRate(a); const before = await finalKey(pid);
      const p = await http.post(`/api/v1/projects/${pid}/agent/plan`).set(auth(a)).set(idem()).send({ command: 'corte os primeiros 2 segundos' });
      expect(p.status, JSON.stringify(p.body)).toBe(201); expect(p.body.plan.understood).toBe(true); expect(p.body.plan.steps[0]).toMatchObject({ type: 'cut', startMs: 0, endMs: 2000 }); expect(p.body.status).toBe('planned');
      runId = p.body.runId; expect(await finalKey(pid)).toBe(before);
      const x = await http.post(`/api/v1/projects/${pid}/agent/runs/${runId}/execute`).set(auth(a)).set(idem()); expect(x.status, JSON.stringify(x.body)).toBe(202);
      const st = await waitRun(a, pid, runId); expect(st.status, JSON.stringify(st)).toBe('previewed'); expect(st.preview.url).toBeTruthy(); expect(await finalKey(pid)).toBe(before);
      // sem confirmação: recusado e nada muda
      for (const body of [{}, { confirm: false }]) { const r = await http.post(`/api/v1/projects/${pid}/agent/runs/${runId}/apply`).set(auth(a)).set(idem()).send(body); expect(r.status).toBe(422); expect(r.body.code).toBe('confirmation_required'); }
      expect(await finalKey(pid)).toBe(before);
      const ap = await http.post(`/api/v1/projects/${pid}/agent/runs/${runId}/apply`).set(auth(a)).set(idem()).send({ confirm: true }); expect(ap.status, JSON.stringify(ap.body)).toBe(200);
      expect(ap.body).toMatchObject({ applied: true, appliedBy: a.id, status: 'applied' }); expect(ap.body.derivedSceneIds.length).toBeGreaterThanOrEqual(1);
      const after = await finalKey(pid); expect(after).not.toBe(before); expect(await durOf(after)).toBeLessThan((await durOf(before)) - 1.7);
      expect((await http.post(`/api/v1/projects/${pid}/agent/runs/${runId}/apply`).set(auth(a)).set(idem()).send({ confirm: true })).status).toBe(409);
    }, 300_000);
    it('agent_runs mostra o plano e a aplicação; ai_usage agent_plan', async () => {
      const row = (await asSystem((db) => db.query('SELECT command, plan_json, applied, applied_by, applied_at FROM agent_runs WHERE id=$1', [runId]))).rows[0];
      expect(row).toMatchObject({ command: 'corte os primeiros 2 segundos', applied: true, applied_by: a.id }); expect(row.plan_json.steps).toHaveLength(1); expect(row.applied_at).toBeTruthy();
      const list = await http.get(`/api/v1/projects/${pid}/agent/runs`).set(auth(a)); expect(list.body.items[0]).toMatchObject({ runId, applied: true });
      expect((await http.get(`/api/v1/projects/${pid}/agent/runs`).set(auth(b))).body.items).toHaveLength(0); // RLS
      expect((await asSystem((db) => db.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='agent_plan'`, [a.id]))).rows[0].n).toBeGreaterThanOrEqual(1);
    });
    it('comando não entendido → plano vazio; executar dá 422 plan_empty', async () => {
      const p = await http.post(`/api/v1/projects/${pid}/agent/plan`).set(auth(a)).set(idem()).send({ command: 'faça um bolo de chocolate' });
      expect(p.status).toBe(201); expect(p.body.plan).toMatchObject({ understood: false, message: 'not_understood' });
      const x = await http.post(`/api/v1/projects/${pid}/agent/runs/${p.body.runId}/execute`).set(auth(a)).set(idem()); expect(x.status).toBe(422); expect(x.body.code).toBe('plan_empty');
    });
    it('comando que usa a transcrição: trocar palavra (TTS) com prévia e descarte', async () => {
      // a transcrição do vídeo atual é refeita (o agente aplicou um corte, então a anterior ficou desatualizada)
      await resetRate(a); const t = await transcribe(a, pid); expect(t.status).toBe('done');
      const p = await http.post(`/api/v1/projects/${pid}/agent/plan`).set(auth(a)).set(idem()).send({ command: 'troque "compartilhar" por "salvar"' });
      expect(p.body.plan.understood, JSON.stringify(p.body)).toBe(true); expect(p.body.plan.steps[0].type).toBe('replace');
      await http.post(`/api/v1/projects/${pid}/agent/runs/${p.body.runId}/execute`).set(auth(a)).set(idem()); const st = await waitRun(a, pid, p.body.runId); expect(st.status).toBe('previewed');
      expect((await http.delete(`/api/v1/projects/${pid}/agent/runs/${p.body.runId}`).set(auth(a))).status).toBe(204);
      expect((await http.get(`/api/v1/projects/${pid}/agent/runs/${p.body.runId}`).set(auth(a))).body).toMatchObject({ status: 'discarded', applied: false });
    }, 300_000);
  });
});

describe('Módulo 9 — rate limit (429) nas duas rotas', () => {
  it('transcrever: 20/h por usuário → 21ª = 429', async () => {
    expect(TRANSCRIBE_LIMIT).toMatchObject({ limit: 20, windowSec: 3600, by: 'user' });
    const s = await signup({ plan: 'pro' }); const codes: number[] = [];
    for (let i = 0; i < 21; i++) codes.push((await http.post(`/api/v1/projects/${randomUUID()}/transcript`).set(auth(s)).set(idem())).status);
    expect(codes.slice(0, 20).every((c) => c === 404)).toBe(true); expect(codes[20]).toBe(429);
  });
  it('executar agente: 10/h por usuário → 11ª = 429', async () => {
    expect(AGENT_EXECUTE_LIMIT).toMatchObject({ limit: 10, windowSec: 3600, by: 'user' });
    const s = await signup({ plan: 'pro' }); const codes: number[] = []; const pid = randomUUID();
    for (let i = 0; i < 11; i++) codes.push((await http.post(`/api/v1/projects/${pid}/agent/runs/${randomUUID()}/execute`).set(auth(s)).set(idem())).status);
    expect(codes.slice(0, 10).every((c) => c === 404)).toBe(true); const r = codes[10]; expect(r).toBe(429);
  });
});

describe('Módulo 9 — LGPD, retenção e logs', () => {
  it('exportação devolve a transcrição ao titular; exclusão do projeto apaga a transcrição', async () => {
    const pid = (await asSystem((db) => db.query(`SELECT project_id FROM transcripts WHERE user_id=$1 LIMIT 1`, [a.id]))).rows[0].project_id as string;
    const exId = (await asSystem((db) => db.query(`INSERT INTO data_export_requests (user_id) VALUES ($1) RETURNING id`, [a.id]))).rows[0].id as string;
    await complianceService.buildExport(exId, a.id);
    const key = (await asSystem((db) => db.query('SELECT storage_key FROM data_export_requests WHERE id=$1', [exId]))).rows[0].storage_key as string;
    const exp = JSON.parse((await storage.get('exports', key)).toString()); expect(exp.transcripts.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(exp.transcripts)).toContain('Wumpelstad'); expect(exp.agentRuns.length).toBeGreaterThanOrEqual(1); expect(JSON.stringify(exp.transcripts)).not.toContain('"enc"');
    expect((await http.delete(`/api/v1/projects/${pid}`).set(auth(a))).status).toBeLessThan(300);
    expect((await asSystem((db) => db.query('SELECT count(*)::int n FROM transcripts WHERE project_id=$1', [pid]))).rows[0].n).toBe(0);
  });
  it('retenção: transcrição vencida é apagada pelo job diário', async () => {
    await setFlags(true); await resetRate(b); const pid = await project(b, await source()); const t = await transcribe(b, pid); expect(t.status).toBe('done');
    await asSystem((db) => db.query(`UPDATE transcripts SET expires_at = now() - interval '1 minute' WHERE id=$1`, [t.transcriptId]));
    const r = await transcriptService.purgeExpired(); expect(r.deleted).toBeGreaterThanOrEqual(1);
    expect((await asSystem((db) => db.query('SELECT count(*)::int n FROM transcripts WHERE id=$1', [t.transcriptId]))).rows[0].n).toBe(0);
  }, 180_000);
  it('nenhuma palavra da transcrição (nem o texto substituído) aparece em log, auditoria ou jobs da fila', async () => {
    const all = logs.join('\n'); expect(logs.length).toBeGreaterThan(5); for (const m of MARKERS) expect(all).not.toContain(m);
    const auditTxt = (await asSystem((db) => db.query(`SELECT coalesce(string_agg(metadata::text, ' '), '') t FROM audit_logs WHERE action LIKE 'transcript.%' OR action LIKE 'agent.%'`))).rows[0].t as string;
    expect(auditTxt.length).toBeGreaterThan(0); for (const m of MARKERS) expect(auditTxt).not.toContain(m); expect(auditTxt).not.toContain('primeiros 2 segundos');
    const jobKeys = [...(await redis.keys(`${process.env.QUEUE_PREFIX ?? 'bull'}:transcript-generate:*`)), ...(await redis.keys(`${process.env.QUEUE_PREFIX ?? 'bull'}:agent-execute:*`))]; let dump = '';
    for (const k of jobKeys) { if ((await redis.type(k)) === 'hash') dump += JSON.stringify(await redis.hgetall(k)); }
    for (const m of MARKERS) expect(dump).not.toContain(m);
  });
});
