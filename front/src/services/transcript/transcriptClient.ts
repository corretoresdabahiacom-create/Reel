/**
 * Módulo 9 — cliente de transcrição e do agente (atrás de `ff_transcript` / `ff_agent`). Fala com:
 * `POST/GET /projects/:id/transcript`, `…/transcript/edits[/:editId[/apply]]`, `…/agent/plan`, `…/agent/runs/:runId/{execute,apply}`.
 * Regras do cliente (o servidor confere tudo de novo):
 * - todo POST leva Idempotency-Key; numa nova tentativa por falha de rede a MESMA chave é reenviada (sem duplicar job);
 * - 429 vira `RateLimited` com `retryAfterSec` (transcrever 20/h, executar agente 10/h);
 * - `applyRun` NUNCA chama o servidor sem `confirm === true` (o agente não aplica sozinho);
 * - o texto da transcrição nunca é registrado em log pelo cliente (só ids e contagens).
 */
export interface Word { i: number; w: string; start: number; end: number; scene: number }
export type WordOp = { type: 'delete'; fromWord: number; toWord: number } | { type: 'replace'; fromWord: number; toWord: number; text: string };
export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; headers: { get(n: string): string | null }; json(): Promise<any> }>;
export class ApiError extends Error { constructor(public status: number, public code: string, public body: unknown) { super(code); } }
export class RateLimited extends ApiError { constructor(public retryAfterSec: number, body: unknown) { super(429, 'rate_limited', body); } }
export class ConfirmationRequired extends Error { constructor() { super('confirmation_required'); } }
export interface ClientOptions { baseUrl: string; token: () => string; fetch: Fetch; newKey?: () => string; sleep?: (ms: number) => Promise<void>; retries?: number }

const rnd = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
export class TranscriptClient {
  constructor(private o: ClientOptions) {}
  private async call(method: string, path: string, body?: unknown, idem = method === 'POST'): Promise<any> {
    const key = idem ? 'tr-' + (this.o.newKey ?? rnd)() : undefined; const tries = (this.o.retries ?? 2) + 1; let last: unknown;
    for (let t = 0; t < tries; t++) {
      try {
        const r = await this.o.fetch(this.o.baseUrl + path, { method, headers: { authorization: `Bearer ${this.o.token()}`, 'content-type': 'application/json', ...(key ? { 'idempotency-key': key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
        if (r.status === 204) return null;
        const j = await r.json().catch(() => ({}));
        if (r.status === 429) throw new RateLimited(Number(r.headers.get('retry-after') ?? 60), j);
        if (r.status >= 400) throw new ApiError(r.status, j?.code ?? 'error', j);
        return j;
      } catch (e) { if (e instanceof ApiError) throw e; last = e; if (t < tries - 1) await (this.o.sleep ?? ((ms) => new Promise((ok) => setTimeout(ok, ms))))(300 * 2 ** t); } // só falha de rede tenta de novo (mesma chave)
    }
    throw last;
  }
  private async poll(path: string, done: (b: any) => boolean, maxMs = 180_000): Promise<any> {
    const t0 = Date.now(); let wait = 500;
    for (;;) { const b = await this.call('GET', path); if (done(b)) return b; if (Date.now() - t0 > maxMs) throw new ApiError(504, 'timeout', b); await (this.o.sleep ?? ((ms) => new Promise((ok) => setTimeout(ok, ms))))(wait); wait = Math.min(3000, wait * 1.5); }
  }
  transcribe(projectId: string) { return this.call('POST', `/projects/${projectId}/transcript`); }
  get(projectId: string) { return this.call('GET', `/projects/${projectId}/transcript`); }
  waitTranscript(projectId: string) { return this.poll(`/projects/${projectId}/transcript`, (b) => b.status === 'done' || b.status === 'failed'); }
  edit(projectId: string, transcriptId: string, ops: WordOp[]) { return this.call('POST', `/projects/${projectId}/transcript/edits`, { transcriptId, ops: normalizeWordOps(ops) }); }
  waitEdit(projectId: string, editId: string) { return this.poll(`/projects/${projectId}/transcript/edits/${editId}`, (b) => ['previewed', 'failed', 'applied', 'discarded'].includes(b.status)); }
  applyEdit(projectId: string, editId: string) { return this.call('POST', `/projects/${projectId}/transcript/edits/${editId}/apply`); }
  discardEdit(projectId: string, editId: string) { return this.call('DELETE', `/projects/${projectId}/transcript/edits/${editId}`); }
  plan(projectId: string, command: string) { return this.call('POST', `/projects/${projectId}/agent/plan`, { command: command.trim().slice(0, 500) }); }
  execute(projectId: string, runId: string) { return this.call('POST', `/projects/${projectId}/agent/runs/${runId}/execute`); }
  waitRun(projectId: string, runId: string) { return this.poll(`/projects/${projectId}/agent/runs/${runId}`, (b) => ['previewed', 'failed', 'applied', 'discarded'].includes(b.status)); }
  /** Só envia com confirmação explícita do usuário. */
  applyRun(projectId: string, runId: string, confirm: boolean) { if (confirm !== true) return Promise.reject(new ConfirmationRequired()); return this.call('POST', `/projects/${projectId}/agent/runs/${runId}/apply`, { confirm: true }); }
  runs(projectId: string) { return this.call('GET', `/projects/${projectId}/agent/runs`); }
}

/** Ordena, junta apagamentos encostados/sobrepostos e recusa substituição sobreposta a outra operação. */
export function normalizeWordOps(ops: WordOp[]): WordOp[] {
  for (const o of ops) if (o.fromWord < 0 || o.toWord < o.fromWord) throw new Error('invalid_range');
  const dels = ops.filter((o) => o.type === 'delete').sort((a, b) => a.fromWord - b.fromWord); const merged: WordOp[] = [];
  for (const d of dels) { const l = merged[merged.length - 1]; if (l && d.fromWord <= l.toWord + 1) l.toWord = Math.max(l.toWord, d.toWord); else merged.push({ ...d }); }
  const reps = ops.filter((o): o is Extract<WordOp, { type: 'replace' }> => o.type === 'replace').map((r) => ({ ...r, text: r.text.trim().slice(0, 200) })).filter((r) => r.text);
  const all = [...merged, ...reps].sort((a, b) => a.fromWord - b.fromWord);
  for (let i = 1; i < all.length; i++) if (all[i]!.fromWord <= all[i - 1]!.toWord) throw new Error('overlapping_edits');
  return all;
}
/** Como o texto fica depois das operações (para a prévia na tela): cada palavra com o estado dela. */
export function previewWords(words: Word[], ops: WordOp[]): Array<Word & { state: 'keep' | 'cut' | 'replaced'; replacement?: string }> {
  const n = normalizeWordOps(ops);
  return words.map((w) => { const o = n.find((x) => w.i >= x.fromWord && w.i <= x.toWord); if (!o) return { ...w, state: 'keep' as const };
    return o.type === 'delete' ? { ...w, state: 'cut' as const } : { ...w, state: 'replaced' as const, replacement: w.i === o.fromWord ? o.text : undefined }; });
}
/** Tempo removido (ms) por apagamentos, no ponto médio entre palavras vizinhas (igual ao servidor). */
export function removedMs(words: Word[], ops: WordOp[]): number {
  return normalizeWordOps(ops).filter((o) => o.type === 'delete').reduce((acc, o) => {
    const a = words[o.fromWord]!, z = words[o.toWord]!, prev = words[o.fromWord - 1], next = words[o.toWord + 1];
    const s = prev ? (prev.end + a.start) / 2 : Math.max(0, a.start - 60), e = next ? (z.end + next.start) / 2 : z.end + 60; return acc + (e - s);
  }, 0);
}
