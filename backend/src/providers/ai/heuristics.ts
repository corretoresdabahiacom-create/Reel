import type { RefMode, SceneDraft, StoryboardContext } from './types.js';
/** Storyboard heurístico (determinístico). TODO: trocar por LLM (Gemini/OpenAI) mantendo a assinatura; ver docs/ARCHITECTURE.md. */
const BEATS = ['Gancho', 'Problema', 'Apresentação', 'Detalhe', 'Prova', 'Benefício', 'Oferta', 'Chamada'];
export function heuristicStoryboard(script: string, photoCount: number, ctx: StoryboardContext = {}): SceneDraft[] {
  const sentences = script.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  const n = Math.min(8, Math.max(6, sentences.length || 6));
  const total = 60; const base = Math.floor(total / n); let extra = total - base * n;
  const person = /pessoa|selfie|eu |depoimento|review|tutorial/i.test(`${ctx.goal ?? ''} ${script}`);
  return Array.from({ length: n }, (_, i) => {
    const d = Math.min(10, Math.max(5, base + (extra-- > 0 ? 1 : 0)));
    const mode: RefMode = photoCount === 0 ? 'product' : person ? (i % 3 === 0 ? 'person' : 'both') : i === n - 1 ? 'both' : 'product';
    const text = sentences[i] ?? `${BEATS[i % BEATS.length]}: ${(sentences[0] ?? script).slice(0, 80)}`;
    return { index: i, text, durationSec: d, referenceMode: mode, prompt: `${BEATS[i % BEATS.length]} · ${ctx.category ?? 'produto'} · tom ${ctx.tone ?? 'natural'} · ${text}`.slice(0, 400) };
  });
}
/** WebVTT a partir de textos e durações. */
export function toVtt(scenes: { text: string; durationSec: number }[]): string {
  const f = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = (s % 60).toFixed(3).padStart(6, '0'); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${x}`; };
  let t = 0; const out = ['WEBVTT', ''];
  scenes.forEach((s, i) => { out.push(String(i + 1), `${f(t)} --> ${f(t + s.durationSec)}`, s.text, ''); t += s.durationSec; });
  return out.join('\n');
}
/** Legenda sincronizada com a fala: quebra o texto em trechos curtos (≤ 42 caracteres, em palavras) e distribui a duração
 *  REAL da narração entre eles, proporcional ao tamanho de cada trecho. */
export interface Cue { start: number; end: number; text: string }
export function speechCues(text: string, start: number, speechSec: number, max = 42): Cue[] {
  const chunks: string[] = []; let cur = '';
  for (const w of text.split(/\s+/).filter(Boolean)) { const next = cur ? `${cur} ${w}` : w; if (next.length > max && cur) { chunks.push(cur); cur = w; } else cur = next; }
  if (cur) chunks.push(cur);
  const total = chunks.reduce((a, c) => a + c.length, 0) || 1; let t = start;
  return chunks.map((c) => { const d = (speechSec * c.length) / total; const cue = { start: t, end: t + d, text: c }; t += d; return cue; });
}
export function cuesToVtt(cues: Cue[]): string {
  const f = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = (s % 60).toFixed(3).padStart(6, '0'); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${x}`; };
  return ['WEBVTT', '', ...cues.flatMap((c, i) => [String(i + 1), `${f(c.start)} --> ${f(c.end)}`, c.text, ''])].join('\n');
}
/** Dicionário mínimo de legendas p/ mock. TODO: tradução real via LLM. */
export const mockTranslate = (text: string, locale: string) => (locale === 'pt-BR' ? text : `[${locale}] ${text}`);
