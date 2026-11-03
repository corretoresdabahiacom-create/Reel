import type { Cue } from './heuristics.js';

/**
 * Narração gravada pelo usuário: onde cada cena começa na fala (pela transcrição local com tempo por palavra) e
 * legendas cronometradas pelas palavras de verdade. Sem transcrição, cai para a divisão proporcional ao texto.
 */
export interface TimedWord { w: string; start: number; end: number } // segundos
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

/** Início (s) de cada cena na gravação. Monotônico; cena 0 começa em 0. */
export function alignScenes(words: TimedWord[], sceneTexts: string[], totalSec: number): number[] {
  const n = sceneTexts.length; if (!n) return [];
  const proportional = () => { const len = sceneTexts.map((t) => Math.max(1, t.length)); const sum = len.reduce((a, b) => a + b, 0); let acc = 0; return len.map((l) => { const s = (acc / sum) * totalSec; acc += l; return Math.round(s * 100) / 100; }); };
  if (words.length < 2) return proportional();
  const toks = words.map((w) => norm(w.w)[0] ?? '');
  const starts = [0]; let from = 0;
  for (let i = 1; i < n; i++) {
    const head = norm(sceneTexts[i]!).slice(0, 3); let best = -1, bestScore = 0;
    for (let k = from + 1; k < toks.length; k++) {
      const score = head.reduce((a, h, j) => a + (toks[k + j] === h ? 1 : 0), 0);
      if (score > bestScore) { bestScore = score; best = k; if (score === head.length) break; }
    }
    const need = Math.min(2, head.length);
    if (best < 0 || bestScore < need) return proportional(); // não achou com segurança: não arrisca legenda fora de lugar
    starts.push(Math.max(starts[i - 1]! + 0.5, words[best]!.start)); from = best;
  }
  return starts.map((s) => Math.round(Math.min(s, totalSec) * 100) / 100);
}

/** Legendas a partir das palavras: até `max` caracteres, quebra em pausa (> 0,6 s) ou fim de frase. */
export function wordsToCues(words: TimedWord[], max = 42): Cue[] {
  const cues: Cue[] = []; let cur: TimedWord[] = [];
  const flush = () => { if (cur.length) cues.push({ start: cur[0]!.start, end: cur[cur.length - 1]!.end, text: cur.map((w) => w.w).join(' ').trim() }); cur = []; };
  for (const w of words) {
    const prev = cur[cur.length - 1];
    const text = [...cur, w].map((x) => x.w).join(' ');
    if (prev && (text.length > max || w.start - prev.end > 0.6 || /[.!?]$/.test(prev.w))) flush();
    cur.push(w);
  }
  flush();
  for (let i = 0; i < cues.length - 1; i++) cues[i]!.end = Math.min(Math.max(cues[i]!.end, cues[i]!.start + 0.4), cues[i + 1]!.start);
  return cues;
}
