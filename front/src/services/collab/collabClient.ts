/**
 * Módulo 8 — cliente de tempo real (atrás de `ff_collaboration`). Fala com `/api/v1/collab/ws`:
 * 1. pede um ticket (`POST /collab/ws-ticket`, JWT de 60 s, uso único) e o manda na PRIMEIRA MENSAGEM — nunca na URL;
 * 2. cada operação de timeline leva `baseVersion`; a resposta é `ack` (aplicada, talvez com `conflict: 'lww'`) ou
 *    `rejected` (403 de papel, 409 de conflito crítico com `forkable`, …) — a promessa resolve/rejeita com isso;
 * 3. reconecta sozinho com backoff (1 s → 30 s) e um ticket NOVO a cada tentativa; 4401/4403/4404 não reconectam.
 */
export type ServerEvent = { type: string; [k: string]: unknown };
export interface WsLike { readyState: number; send(d: string): void; close(code?: number, reason?: string): void;
  onopen: ((e?: unknown) => void) | null; onmessage: ((e: { data: string }) => void) | null; onclose: ((e: { code: number; reason?: string }) => void) | null; onerror: ((e?: unknown) => void) | null }
export interface CollabOptions {
  url: string; getTicket: () => Promise<string>; open: (url: string) => WsLike;
  onEvent?: (e: ServerEvent) => void; onState?: (s: 'connecting' | 'ready' | 'reconnecting' | 'closed', info?: { code?: number }) => void;
  setTimer?: (fn: () => void, ms: number) => unknown; clearTimer?: (t: unknown) => void;
}
export class OpRejected extends Error { constructor(public status: number, public code: string, public details: unknown) { super(code); } get forkable() { return this.status === 409 && !!(this.details as { forkable?: boolean } | null)?.forkable; } }
const FINAL = new Set([4401, 4403, 4404]);

export class CollabClient {
  private ws: WsLike | null = null; private seq = 0; private attempt = 0; private stopped = false; private timer: unknown;
  private pending = new Map<string, { ok: (v: ServerEvent) => void; ko: (e: Error) => void }>();
  role: string | null = null;
  constructor(private o: CollabOptions) {}
  async connect(): Promise<void> {
    this.stopped = false; this.o.onState?.(this.attempt ? 'reconnecting' : 'connecting');
    const ticket = await this.o.getTicket(); const ws = this.o.open(this.o.url); this.ws = ws; // URL sem token
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: ticket }));
    ws.onmessage = (e) => this.onMessage(JSON.parse(e.data) as ServerEvent);
    ws.onerror = () => undefined;
    ws.onclose = (e) => {
      for (const p of this.pending.values()) p.ko(new OpRejected(0, 'disconnected', null)); this.pending.clear(); this.ws = null;
      if (this.stopped || FINAL.has(e.code)) { this.o.onState?.('closed', { code: e.code }); return; }
      const wait = Math.min(30_000, 1000 * 2 ** this.attempt++); this.o.onState?.('reconnecting', { code: e.code });
      this.timer = (this.o.setTimer ?? setTimeout)(() => { void this.connect(); }, wait);
    };
  }
  private onMessage(m: ServerEvent) {
    if (m.type === 'ready') { this.attempt = 0; this.role = String(m.role); this.o.onState?.('ready'); }
    if ((m.type === 'ack' || m.type === 'rejected') && typeof m.id === 'string' && this.pending.has(m.id)) {
      const p = this.pending.get(m.id)!; this.pending.delete(m.id);
      if (m.type === 'ack') p.ok(m); else p.ko(new OpRejected(Number(m.status), String(m.code), m.details ?? null));
      return;
    }
    this.o.onEvent?.(m);
  }
  private request(msg: Record<string, unknown>): Promise<ServerEvent> {
    if (!this.ws || this.ws.readyState !== 1) return Promise.reject(new OpRejected(0, 'not_connected', null));
    const id = `c${++this.seq}`; const p = new Promise<ServerEvent>((ok, ko) => this.pending.set(id, { ok, ko }));
    this.ws.send(JSON.stringify({ ...msg, id })); return p;
  }
  /** Operação de timeline. Viewer recebe OpRejected(403) do servidor — a UI só esconde o botão, quem bloqueia é o servidor. */
  sendOp(op: Record<string, unknown>) { return this.request({ type: 'op', op }); }
  comment(timeMs: number, body: string, clipId?: string) { return this.request({ type: 'comment', timeMs, body, clipId }); }
  private lastCursor = 0;
  /** Cursor é efêmero e limitado a ~10/s (o servidor derruba acima de 40 mensagens/s). */
  cursor(timeMs: number, now = Date.now()) { if (now - this.lastCursor < 100 || !this.ws || this.ws.readyState !== 1) return false; this.lastCursor = now; this.ws.send(JSON.stringify({ type: 'cursor', timeMs })); return true; }
  close() { this.stopped = true; (this.o.clearTimer ?? clearTimeout)(this.timer as never); this.ws?.close(1000, 'bye'); }
}
