import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { env } from '../../config/env.js';
import { ffmpeg, withTmp } from '../../utils/ffmpeg.js';

/**
 * Compositor de trilhas (gratuito, original, sem direitos de terceiros): escreve uma peça em MIDI — progressão de
 * acordes por humor, baixo, bateria, melodia com motivo e variação, introdução e final — e a toca com instrumentos
 * reais amostrados (FluidSynth + soundfont FluidR3_GM, licença MIT). Mesma semente → mesma música (cache seguro).
 * Não usa rede nem modelo de IA: roda em CPU modesta em poucos segundos.
 */
export type Mood = 'upbeat' | 'corporate' | 'energetic' | 'calm' | 'emotional' | 'fun' | 'lofi' | 'epic';
type Drums = 'pop' | 'four' | 'lofi' | 'epic' | 'fun' | 'none';
type ChordPattern = 'stab' | 'arp' | 'pad' | 'block' | 'ostinato';
interface Part { program: number; octave: number; pattern: ChordPattern; vel: number }
interface Style {
  bpm: number; minor: boolean; key: number; prog: number[]; sevenths: boolean; swing: number;
  chords: Part; pad?: Part; bass: { program: number; pattern: 'root' | 'octave' | 'long' | 'walk'; vel: number };
  melody?: { program: number; octave: number; density: number; vel: number }; drums: Drums; reverb: number;
}
// Programas General MIDI (0 = piano). Tom (key) em número MIDI da tônica.
const STYLES: Record<Mood, Style> = {
  upbeat:    { bpm: 118, minor: false, key: 60, prog: [0, 4, 5, 3], sevenths: false, swing: 0, reverb: 0.4,
    chords: { program: 0, octave: 0, pattern: 'stab', vel: 78 }, pad: { program: 48, octave: 0, pattern: 'pad', vel: 46 },
    bass: { program: 33, pattern: 'octave', vel: 92 }, melody: { program: 11, octave: 1, density: 0.6, vel: 84 }, drums: 'pop' },
  corporate: { bpm: 108, minor: false, key: 62, prog: [0, 5, 3, 4], sevenths: true, swing: 0, reverb: 0.5,
    chords: { program: 0, octave: 0, pattern: 'arp', vel: 72 }, pad: { program: 48, octave: 0, pattern: 'pad', vel: 50 },
    bass: { program: 32, pattern: 'root', vel: 84 }, drums: 'pop' },
  energetic: { bpm: 126, minor: true, key: 57, prog: [0, 5, 2, 6], sevenths: false, swing: 0, reverb: 0.3,
    chords: { program: 90, octave: 0, pattern: 'stab', vel: 80 }, pad: { program: 89, octave: 0, pattern: 'pad', vel: 44 },
    bass: { program: 38, pattern: 'octave', vel: 100 }, melody: { program: 80, octave: 1, density: 0.7, vel: 80 }, drums: 'four' },
  calm:      { bpm: 72, minor: false, key: 55, prog: [0, 3, 5, 4], sevenths: true, swing: 0, reverb: 0.7,
    chords: { program: 0, octave: 0, pattern: 'arp', vel: 62 }, pad: { program: 89, octave: 0, pattern: 'pad', vel: 48 },
    bass: { program: 32, pattern: 'long', vel: 70 }, melody: { program: 73, octave: 1, density: 0.3, vel: 66 }, drums: 'none' },
  emotional: { bpm: 76, minor: true, key: 57, prog: [0, 5, 2, 6], sevenths: false, swing: 0, reverb: 0.75,
    chords: { program: 0, octave: 0, pattern: 'arp', vel: 66 }, pad: { program: 48, octave: 0, pattern: 'pad', vel: 56 },
    bass: { program: 42, pattern: 'long', vel: 74 }, melody: { program: 40, octave: 1, density: 0.35, vel: 72 }, drums: 'none' },
  fun:       { bpm: 104, minor: false, key: 64, prog: [0, 3, 4, 3], sevenths: false, swing: 0.12, reverb: 0.35,
    chords: { program: 45, octave: 0, pattern: 'stab', vel: 84 }, bass: { program: 58, pattern: 'walk', vel: 82 },
    melody: { program: 12, octave: 1, density: 0.7, vel: 86 }, drums: 'fun' },
  lofi:      { bpm: 84, minor: false, key: 53, prog: [1, 4, 0, 5], sevenths: true, swing: 0.22, reverb: 0.55,
    chords: { program: 4, octave: 0, pattern: 'block', vel: 64 }, bass: { program: 33, pattern: 'root', vel: 80 },
    melody: { program: 11, octave: 1, density: 0.35, vel: 64 }, drums: 'lofi' },
  epic:      { bpm: 92, minor: true, key: 50, prog: [0, 5, 6, 0], sevenths: false, swing: 0, reverb: 0.8,
    chords: { program: 48, octave: 0, pattern: 'ostinato', vel: 82 }, pad: { program: 52, octave: 0, pattern: 'pad', vel: 58 },
    bass: { program: 43, pattern: 'long', vel: 92 }, melody: { program: 61, octave: 0, density: 0.4, vel: 92 }, drums: 'epic' },
};
export const COMPOSER_MOODS = Object.keys(STYLES) as Mood[];

/** Gerador pseudoaleatório com semente (mulberry32): mesma semente → mesma peça. */
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const MAJOR = [0, 2, 4, 5, 7, 9, 11], MINOR = [0, 2, 3, 5, 7, 8, 10];

interface Note { t: number; d: number; p: number; v: number } // ticks
const PPQ = 480;
const vlq = (n: number) => { const b = [n & 0x7f]; while ((n >>= 7)) b.unshift((n & 0x7f) | 0x80); return b; };
function trackChunk(events: { t: number; data: number[] }[]): Buffer {
  events.sort((a, b) => a.t - b.t || (a.data[0]! & 0xf0) - (b.data[0]! & 0xf0)); // no mesmo instante, note-off (0x80) antes de note-on (0x90)
  const out: number[] = []; let last = 0;
  for (const e of events) { out.push(...vlq(Math.max(0, e.t - last)), ...e.data); last = Math.max(last, e.t); }
  out.push(0, 0xff, 0x2f, 0);
  const h = Buffer.alloc(8); h.write('MTrk', 0); h.writeUInt32BE(out.length, 4); return Buffer.concat([h, Buffer.from(out)]);
}

/** Composição (MIDI) de `durationSec` segundos. Exportada para teste: notas por canal, sem tocar nada. */
export function compose(mood: Mood, durationSec: number, seed: number, transpose = 0): { midi: Buffer; channels: Record<string, Note[]>; bars: number; barSec: number; bpm: number } {
  const st = STYLES[mood]; const r = rng(seed); const bpm = st.bpm; const beat = PPQ; const bar = 4 * beat;
  const barSec = (60 / bpm) * 4; const bars = Math.max(4, Math.ceil(durationSec / barSec) + 1);
  const scale = st.minor ? MINOR : MAJOR; const key = st.key + transpose;
  const deg = (d: number, oct = 0) => key + scale[((d % 7) + 7) % 7]! + 12 * (Math.floor(d / 7) + oct);
  const chordOf = (d: number) => [deg(d), deg(d + 2), deg(d + 4), ...(st.sevenths ? [deg(d + 6)] : [])];
  const hum = (v: number) => Math.max(20, Math.min(127, Math.round(v + (r() - 0.5) * 14)));
  const swing = (t: number) => (t % beat === beat / 2 ? t + Math.round(st.swing * beat / 2) : t);
  const ch: Record<string, Note[]> = { chords: [], pad: [], bass: [], melody: [], drums: [] };
  const lastBar = bars - 1;
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar; const d = b === lastBar ? 0 : st.prog[b % st.prog.length]!; const chord = chordOf(d);
    const intro = b < 2; const fill = b % 8 === 7 && b !== lastBar;
    // acordes
    const cp = st.chords; const co = 12 * cp.octave;
    if (b === lastBar) chord.forEach((p) => ch.chords!.push({ t: t0, d: bar * 2, p: p + co, v: hum(cp.vel) }));
    else if (cp.pattern === 'stab') for (const off of [0, 1.5, 2.5, 3.5]) chord.forEach((p) => ch.chords!.push({ t: swing(t0 + off * beat), d: beat * 0.45, p: p + co, v: hum(cp.vel - (off % 1 ? 8 : 0)) }));
    else if (cp.pattern === 'arp') { const seq = [chord[0]!, chord[1]!, chord[2]!, chord[0]! + 12, chord[2]!, chord[1]!, chord[3] ?? chord[0]! + 12, chord[2]!]; seq.forEach((p, i) => ch.chords!.push({ t: swing(t0 + i * beat / 2), d: beat * 0.9, p: p + co, v: hum(cp.vel - (i % 2 ? 6 : 0)) })); }
    else if (cp.pattern === 'block') for (const off of [0, 2.5]) chord.forEach((p) => ch.chords!.push({ t: swing(t0 + off * beat), d: beat * 1.4, p: p + co - 12 * (p > key + 14 ? 1 : 0), v: hum(cp.vel) }));
    else if (cp.pattern === 'ostinato') for (let i = 0; i < 8; i++) ch.chords!.push({ t: t0 + i * beat / 2, d: beat * 0.42, p: (i % 2 ? chord[2]! : chord[0]!) + co, v: hum(cp.vel - (i % 2 ? 10 : 0)) });
    else chord.forEach((p) => ch.chords!.push({ t: t0, d: bar, p: p + co, v: hum(cp.vel) }));
    // pad (cordas/sintetizador longos)
    if (st.pad) chord.slice(0, 3).forEach((p) => ch.pad!.push({ t: t0, d: b === lastBar ? bar * 2 : bar, p: p + 12 * st.pad!.octave, v: hum(st.pad!.vel) }));
    // baixo
    const root = deg(d, -2); const bp = st.bass;
    if (b === lastBar || bp.pattern === 'long') ch.bass!.push({ t: t0, d: b === lastBar ? bar * 2 : bar * 0.95, p: root, v: hum(bp.vel) });
    else if (bp.pattern === 'root') for (const off of [0, 2, 3.5]) ch.bass!.push({ t: swing(t0 + off * beat), d: beat * 0.9, p: root, v: hum(bp.vel - (off ? 10 : 0)) });
    else if (bp.pattern === 'octave') for (let i = 0; i < 8; i++) ch.bass!.push({ t: t0 + i * beat / 2, d: beat * 0.4, p: root + (i % 2 ? 12 : 0), v: hum(bp.vel - (i % 2 ? 12 : 0)) });
    else { const walk = [root, deg(d + 2, -2), deg(d + 4, -2), deg(d + 5, -2)]; walk.forEach((p, i) => ch.bass!.push({ t: swing(t0 + i * beat), d: beat * 0.85, p, v: hum(bp.vel) })); }
    // bateria (canal 10): introdução sem bateria; virada a cada 8 compassos; prato nas entradas
    if (!intro && b !== lastBar && st.drums !== 'none') {
      const K = 36, S = 38, CL = 39, HH = 42, OH = 46, CR = 49, SH = 70, TL = 45, TM = 47, TH = 50;
      const hit = (off: number, p: number, v: number) => ch.drums!.push({ t: swing(t0 + Math.round(off * beat)), d: beat / 4, p, v: hum(v) });
      if (b === 2 || b % 8 === 0) hit(0, CR, 92);
      if (st.drums === 'pop') { [0, 2, 2.5].forEach((o) => hit(o, K, 104)); [1, 3].forEach((o) => hit(o, S, 96)); for (let i = 0; i < 8; i++) hit(i / 2, HH, i % 2 ? 58 : 72); }
      if (st.drums === 'four') { [0, 1, 2, 3].forEach((o) => hit(o, K, 112)); [1, 3].forEach((o) => hit(o, CL, 98)); [0.5, 1.5, 2.5, 3.5].forEach((o) => hit(o, OH, 70)); for (let i = 0; i < 16; i++) if (i % 2) hit(i / 4, HH, 52); }
      if (st.drums === 'lofi') { [0, 1.75, 2.5].forEach((o) => hit(o, K, 84)); [1, 3].forEach((o) => hit(o, S, 70)); for (let i = 0; i < 8; i++) hit(i / 2, HH, i % 2 ? 40 : 54); }
      if (st.drums === 'fun') { [0, 2].forEach((o) => hit(o, K, 88)); [1, 3].forEach((o) => hit(o, CL, 80)); for (let i = 0; i < 8; i++) hit(i / 2, SH, i % 2 ? 50 : 64); }
      if (st.drums === 'epic') { [0, 1.5, 2].forEach((o) => hit(o, K, 108)); hit(3, TL, 100); hit(3.5, TM, 96); }
      if (fill) [3, 3.25, 3.5, 3.75].forEach((o, i) => hit(o, [TH, TM, TL, S][i]!, 90 + i * 4));
    }
    if (st.drums === 'epic' && b === lastBar) ch.drums!.push({ t: t0, d: beat, p: 49, v: 110 }, { t: t0, d: beat, p: 36, v: 120 });
  }
  // melodia: motivo de 2 compassos (A), repetido com variação (A'), resposta (B) — notas do acorde + passagem
  if (st.melody) {
    const m = st.melody; const RHY = [[0, 1, 1.5, 2, 3], [0, 0.5, 1, 2, 2.5, 3], [0, 1.5, 2, 3.5], [0, 1, 2, 2.5, 3, 3.5], [0, 2, 3]];
    const motif = (len: number) => Array.from({ length: len }, () => { const rh = RHY[Math.floor(r() * RHY.length)]!; return rh.filter(() => r() < 0.45 + m.density * 0.55).map((o) => ({ o, step: Math.floor(r() * 5) - 1 })); });
    const A = motif(2), B = motif(2);
    for (let b = 2; b < bars - 1; b++) {
      const phrase = Math.floor((b - 2) / 2) % 4; const part = (phrase === 2 ? B : A)[(b - 2) % 2]!; const d = st.prog[b % st.prog.length]!; const tones = chordOf(d);
      part.forEach((n, i) => {
        const varied = phrase === 1 && i === part.length - 1 ? n.step + 1 : n.step;
        const base = tones[(Math.abs(varied) + i) % 3]! + 12 * m.octave + (varied < 0 ? -12 : 0);
        const pass = (i % 2 === 1 && r() < 0.25) ? deg(d + 1, m.octave) : base; // nota de passagem ocasional
        const next = part[i + 1]?.o ?? 4; ch.melody!.push({ t: swing(b * bar + Math.round(n.o * beat)), d: Math.max(beat / 3, Math.round((next - n.o) * beat * 0.9)), p: pass, v: hum(m.vel) });
      });
    }
    const end = bars - 1; ch.melody!.push({ t: end * bar, d: bar, p: chordOf(0)[0]! + 12 * m.octave, v: hum(m.vel - 6) });
  }
  // MIDI tipo 1: trilha 0 = andamento; uma trilha por parte, canal próprio (bateria no 9 = canal 10)
  const tempo = Math.round(60_000_000 / bpm);
  const meta = trackChunk([{ t: 0, data: [0xff, 0x51, 3, (tempo >> 16) & 0xff, (tempo >> 8) & 0xff, tempo & 0xff] }, { t: 0, data: [0xff, 0x58, 4, 4, 2, 24, 8] }]);
  const parts: Array<[string, number, number]> = [['chords', 0, st.chords.program], ['pad', 1, st.pad?.program ?? 0], ['bass', 2, st.bass.program], ['melody', 3, st.melody?.program ?? 0], ['drums', 9, 0]];
  const chunks = parts.filter(([n]) => ch[n]!.length).map(([n, c, prog]) => {
    const ev: { t: number; data: number[] }[] = [{ t: 0, data: [0xb0 | c, 91, Math.round(st.reverb * 127)] }, { t: 0, data: [0xb0 | c, 7, n === 'pad' ? 90 : 110] }];
    if (c !== 9) ev.push({ t: 0, data: [0xc0 | c, prog] });
    for (const x of ch[n]!) { const p = Math.max(0, Math.min(127, x.p)); ev.push({ t: x.t, data: [0x90 | c, p, x.v] }, { t: x.t + Math.max(10, Math.round(x.d)), data: [0x80 | c, p, 0] }); }
    return trackChunk(ev);
  });
  const head = Buffer.alloc(14); head.write('MThd', 0); head.writeUInt32BE(6, 4); head.writeUInt16BE(1, 8); head.writeUInt16BE(chunks.length + 1, 10); head.writeUInt16BE(PPQ, 12);
  return { midi: Buffer.concat([head, meta, ...chunks]), channels: ch, bars, barSec, bpm };
}

export const composerAvailable = () => existsSync(env.MUSIC_SOUNDFONT);
function fluidsynth(args: string[], timeoutMs = 120_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(env.FLUIDSYNTH_BIN, args, { stdio: ['ignore', 'ignore', 'pipe'] }); let err = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('fluidsynth: tempo esgotado')); }, timeoutMs);
    p.stderr.on('data', (d) => { err = (err + d).slice(-400); });
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (c) => { clearTimeout(t); if (c === 0) resolve(); else reject(new Error(`fluidsynth saiu com ${c}: ${err.trim()}`)); });
  });
}
/** Toca a composição com instrumentos reais e entrega AAC estéreo, com fade de entrada/saída e volume padronizado (-16 LUFS). */
export async function renderMusic(mood: Mood, durationSec: number, seed: number, transpose = 0): Promise<Buffer> {
  if (!composerAvailable()) throw new Error(`compositor: soundfont ausente (${env.MUSIC_SOUNDFONT})`);
  const { midi } = compose(mood, durationSec, seed, transpose);
  return withTmp(async (dir) => {
    const mid = join(dir, 'm.mid'), wav = join(dir, 'm.wav'), out = join(dir, 'm.m4a'); await writeFile(mid, midi);
    await fluidsynth(['-ni', '-q', '-g', '0.5', '-r', '44100', '-F', wav, env.MUSIC_SOUNDFONT, mid]);
    const D = Math.max(3, durationSec);
    await ffmpeg(['-i', wav, '-af', `atrim=0:${D},afade=t=in:d=0.25,afade=t=out:st=${Math.max(0, D - 2.5).toFixed(2)}:d=2.5,loudnorm=I=-16:TP=-1.5:LRA=11`, '-ar', '44100', '-ac', '2', '-c:a', 'aac', '-b:a', '160k', out]);
    return readFile(out);
  });
}
