import type { EditOp } from '../transcript/edits.js';
import type { Word } from '../transcript/stt.js';
import type { SceneSpan } from '../transcript/stt.js';

/**
 * Módulo 9 — planejador do agente (provedor `mock`, determinístico, pt/en/es). Transforma o comando em PASSOS de edição
 * (staging) — nunca aplica nada. Um provedor LLM entra no lugar desta função com a mesma saída (`Plan`); a validação dos
 * passos (limites de tempo, sobreposição) continua no motor de edição.
 * Entende: cortar os N primeiros/últimos segundos, remover a cena N, deixar com N segundos, remover pausas, remover uma
 * palavra/frase e trocar X por Y (estes três precisam da transcrição).
 */
export interface PlanStep { op: EditOp; label: string }
export interface Plan { understood: boolean; steps: PlanStep[]; summary: string; requiresTranscript: boolean; estimatedDurationMs: number; message?: string }
const fold = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const num = (s: string) => Number(s.replace(',', '.'));
const REMOVE = '(?:corta|corte|cortar|remove|remova|remover|tira|tire|tirar|apaga|apague|apagar|cut|delete|drop|quita|quitar|elimina|eliminar|borra|borrar)';
const SEC = '(?:s|seg|segs|segundo|segundos|second|seconds|sec|secs)\\b';
const quoted = (s: string) => s.replace(/^["'“”‘’]+|["'“”‘’.!?]+$/g, '').trim();
/** Palavras consecutivas da transcrição que formam `phrase` (comparação sem acento/caixa/pontuação). */
export function findPhrase(words: Word[], phrase: string): Array<[number, number]> {
  const clean = (w: string) => fold(w).replace(/[^\p{L}\p{N}]+/gu, '');
  const target = phrase.split(/\s+/).map(clean).filter(Boolean); if (!target.length) return [];
  const out: Array<[number, number]> = [];
  for (let i = 0; i + target.length <= words.length; i++) if (target.every((t, k) => clean(words[i + k]!.w) === t)) { out.push([i, i + target.length - 1]); i += target.length - 1; }
  return out;
}
const fmt = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
export function plan(command: string, ctx: { durationMs: number; scenes: SceneSpan[]; words: Word[] | null }): Plan {
  const c = fold(command); const D = ctx.durationMs; const W = ctx.words; const steps: PlanStep[] = []; let needsT = false;
  const cutWords = (a: number, b: number) => { const prev = W![a - 1], next = W![b + 1]; return { type: 'cut' as const, startMs: prev ? Math.round((prev.end + W![a]!.start) / 2) : Math.max(0, W![a]!.start - 60), endMs: next ? Math.round((W![b]!.end + next.start) / 2) : Math.min(D, W![b]!.end + 60) }; };
  let m: RegExpMatchArray | null;
  if ((m = c.match(new RegExp(`${REMOVE}.*?(?:primeir[oa]s?|first|primer[oa]s?|inicio|comeco|start)\\D*?(\\d+(?:[.,]\\d+)?)\\s*${SEC}`))) || (m = c.match(new RegExp(`${REMOVE}.*?(\\d+(?:[.,]\\d+)?)\\s*${SEC}.*?(?:inicio|comeco|start|beginning|principio)`)))) {
    const n = Math.min(D - 1000, num(m[1]!) * 1000); if (n > 0) steps.push({ op: { type: 'cut', startMs: 0, endMs: n, reason: 'start' }, label: `Cortar os primeiros ${fmt(n)}` });
  } else if ((m = c.match(new RegExp(`${REMOVE}.*?(?:ultim[oa]s?|last|final)\\D*?(\\d+(?:[.,]\\d+)?)\\s*${SEC}`))) || (m = c.match(new RegExp(`${REMOVE}.*?(\\d+(?:[.,]\\d+)?)\\s*${SEC}.*?(?:final|fim|end)`)))) {
    const n = Math.min(D - 1000, num(m[1]!) * 1000); if (n > 0) steps.push({ op: { type: 'cut', startMs: D - n, endMs: D, reason: 'end' }, label: `Cortar os últimos ${fmt(n)}` });
  } else if ((m = c.match(/(?:encurt\w*|deix\w*|reduz\w*|shorten|trim|make it|acorta\w*|deja\w*|reduce\w*)\D*?(\d+(?:[.,]\d+)?)\s*(?:s|seg|segundos?|seconds?|secs?)\b/))) {
    const n = Math.max(1000, num(m[1]!) * 1000); if (n < D) steps.push({ op: { type: 'cut', startMs: n, endMs: D, reason: 'trim' }, label: `Deixar com ${fmt(n)} (corta o final)` });
  } else if ((m = c.match(new RegExp(`${REMOVE}.*?(?:cena|scene|escena)\\s*(\\d+)`)))) {
    const s = ctx.scenes.find((x) => x.index === Number(m![1]) - 1);
    if (s) steps.push({ op: { type: 'cut', startMs: s.startMs, endMs: s.endMs, reason: 'scene' }, label: `Remover a cena ${s.index + 1} (${fmt(s.endMs - s.startMs)})` });
  } else if (new RegExp(`${REMOVE}.*?(?:pausa|pausas|silencio|silencios|silence|silences|pause|pauses|respiro)`).test(c)) {
    needsT = true;
    if (W) for (let i = 1; i < W.length; i++) { const gap = W[i]!.start - W[i - 1]!.end; if (gap > 600) steps.push({ op: { type: 'cut', startMs: W[i - 1]!.end + 120, endMs: W[i]!.start - 120, reason: 'pause' }, label: `Tirar pausa de ${fmt(gap - 240)}` }); }
  } else if ((m = command.match(/(?:tro[cq]\w*|substitu\w*|replace|swap|cambi\w*|reemplaz\w*)\s+(?:a palavra |a frase |the word |the phrase |la palabra |la frase )?["'“‘]?(.+?)["'”’]?\s+(?:por|with|by)\s+["'“‘]?(.+?)["'”’.!?]*$/i))) {
    needsT = true; const from = quoted(m[1]!), to = quoted(m[2]!);
    if (W && to) for (const [a, b] of findPhrase(W, from)) steps.push({ op: { type: 'replace', startMs: W[a]!.start, endMs: Math.max(W[b]!.end, W[a]!.start + 250), text: to.slice(0, 200), reason: 'replace' }, label: `Trocar "${from}" por "${to}" em ${fmt(W[a]!.start)}` });
  } else if ((m = command.match(new RegExp(`${REMOVE}\\s+(?:a palavra |a frase |o trecho |the word |the phrase |la palabra |la frase |el tramo )?["'“‘]?(.+?)["'”’.!?]*$`, 'i')))) {
    needsT = true; const phrase = quoted(m[1]!);
    if (W) for (const [a, b] of findPhrase(W, phrase)) steps.push({ op: cutWords(a, b), label: `Cortar "${phrase}" em ${fmt(W[a]!.start)}` });
  }
  const capped = steps.slice(0, 20); const removed = capped.reduce((a, s) => a + (s.op.type === 'cut' ? s.op.endMs - s.op.startMs : 0), 0);
  const understood = capped.length > 0;
  return { understood, steps: capped, requiresTranscript: needsT, estimatedDurationMs: Math.max(0, D - removed),
    summary: understood ? `${capped.length} alteração(ões); o vídeo fica com cerca de ${fmt(Math.max(0, D - removed))}` : '',
    message: understood ? undefined : needsT && !W ? 'needs_transcript' : 'not_understood' };
}
