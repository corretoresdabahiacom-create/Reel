import { createHash } from 'node:crypto';

/**
 * Áudio sintético de demonstração (FFmpeg `aevalsrc`): trilhas da biblioteca inicial, SFX e a "voz" do provedor mock.
 * Não usa obra de terceiros, então pode ser distribuído sem licença. O catálogo licenciado real substitui as trilhas
 * `builtin:*` por importação administrativa, sem mudar nada no mixer.
 */
export interface MusicPreset { root: number; bpm: number; chord: [number, number, number]; prog: [number, number, number, number]; bass: number; bright: number }
// prog: multiplicadores de frequência da fundamental a cada 2 compassos (I–V–vi–IV etc.)
export const MUSIC_PRESETS: Record<string, MusicPreset> = {
  upbeat:    { root: 261.63, bpm: 120, chord: [1, 1.26, 1.5],  prog: [1, 1.5, 1.68, 1.33], bass: 0.30, bright: 0.5 },
  corporate: { root: 293.66, bpm: 110, chord: [1, 1.26, 1.5],  prog: [1, 1.33, 1.5, 1.33], bass: 0.22, bright: 0.4 },
  energetic: { root: 220.0,  bpm: 128, chord: [1, 1.19, 1.5],  prog: [1, 1.19, 1.33, 1.5], bass: 0.38, bright: 0.6 },
  calm:      { root: 196.0,  bpm: 72,  chord: [1, 1.26, 1.5],  prog: [1, 1.33, 1.26, 1.12], bass: 0.15, bright: 0.25 },
  emotional: { root: 220.0,  bpm: 80,  chord: [1, 1.19, 1.5],  prog: [1, 1.33, 1.5, 1.12], bass: 0.18, bright: 0.3 },
  fun:       { root: 329.63, bpm: 100, chord: [1, 1.26, 1.5],  prog: [1, 1.12, 1.33, 1.5], bass: 0.26, bright: 0.55 },
  lofi:      { root: 174.61, bpm: 85,  chord: [1, 1.19, 1.5],  prog: [1, 1.12, 1.26, 1.33], bass: 0.24, bright: 0.2 },
  epic:      { root: 146.83, bpm: 90,  chord: [1, 1.19, 1.5],  prog: [1, 1.33, 1.19, 1.5], bass: 0.40, bright: 0.45 },
};
export const MOODS = Object.keys(MUSIC_PRESETS);

/** Expressão `aevalsrc` de uma trilha: acorde com pulsação no tempo + baixo percussivo, progressão a cada 2 compassos. */
export function musicExpr(p: MusicPreset): string {
  const bps = p.bpm / 60; const bar = (8 / bps).toFixed(4); // 2 compassos de 4 tempos
  const step = `mod(floor(t/${bar})\\,4)`;
  const mult = `if(lt(${step}\\,1)\\,${p.prog[0]}\\,if(lt(${step}\\,2)\\,${p.prog[1]}\\,if(lt(${step}\\,3)\\,${p.prog[2]}\\,${p.prog[3]})))`;
  const f = `(${p.root}*${mult})`;
  const chord = p.chord.map((c, i) => `${[0.16, 0.11, 0.08][i]}*sin(2*PI*${f}*${c}*t)`).join('+');
  const shimmer = `${(0.04 * p.bright).toFixed(3)}*sin(2*PI*${f}*4*t)*(0.5+0.5*cos(2*PI*${(bps * 2).toFixed(4)}*t))`;
  const pulse = `(0.62+0.38*cos(2*PI*${bps.toFixed(4)}*t))`;
  const bass = `${p.bass}*sin(2*PI*${f}/2*t)*exp(-6*mod(t\\,${(1 / bps).toFixed(4)}))`;
  return `(${chord})*${pulse}+${shimmer}+${bass}`;
}
/** Preset derivado de um prompt (provedor mock de geração de música): humor por palavra-chave, variação pelo hash. */
export function presetFromPrompt(prompt: string): { mood: string; preset: MusicPreset } {
  const t = prompt.toLowerCase();
  const kw: Array<[string, RegExp]> = [['energetic', /energ|intens|treino|academia|rápid|festa|dance|eletr/], ['calm', /calm|relax|suave|tranq|spa|natureza/],
    ['emotional', /emoc|triste|saudade|piano|delicad/], ['epic', /épic|epic|grandios|cinema|trailer/], ['fun', /divert|alegr|infantil|brincad|engraç/],
    ['corporate', /corporat|empresa|profission|negóc|tecnolog/], ['lofi', /lo-?fi|estud|café|chill/]];
  const mood = MUSIC_PRESETS[t.trim()] ? t.trim() : kw.find(([, r]) => r.test(t))?.[0] ?? 'upbeat'; // nome exato do humor (estúdio) ou palavra-chave
  const h = parseInt(createHash('sha256').update(prompt).digest('hex').slice(0, 6), 16);
  const base = MUSIC_PRESETS[mood]!; const semis = (h % 5) - 2; // ±2 semitons
  return { mood, preset: { ...base, root: +(base.root * 2 ** (semis / 12)).toFixed(2), bpm: base.bpm + ((h >> 4) % 9) - 4 } };
}

/** Efeitos sonoros embutidos. Cada um vira um arquivo curto na primeira vez que é usado. */
export const SFX: Record<string, { label: string; dur: number; expr: string }> = {
  whoosh:  { label: 'Whoosh (transição)', dur: 0.6, expr: '0.6*(random(0)*2-1)*sin(PI*t/0.6)*sin(PI*t/0.6)' },
  pop:     { label: 'Pop', dur: 0.15, expr: '0.8*sin(2*PI*(900-3000*t)*t)*exp(-30*t)' },
  riser:   { label: 'Riser', dur: 1.2, expr: '0.35*sin(2*PI*(200+500*t*t)*t)*(t/1.2)' },
  impact:  { label: 'Impacto', dur: 0.8, expr: '0.9*sin(2*PI*55*t)*exp(-5*t)+0.3*(random(0)*2-1)*exp(-18*t)' },
  click:   { label: 'Clique', dur: 0.05, expr: '0.7*(random(0)*2-1)*exp(-120*t)' },
  sparkle: { label: 'Brilho', dur: 0.7, expr: '0.25*(sin(2*PI*2093*t)+sin(2*PI*2637*t)+sin(2*PI*3136*t))*exp(-5*t)' },
};
export const SFX_IDS = Object.keys(SFX);

/**
 * "Fala" sintética do provedor mock de voz: vogais com pitch da voz (derivado do ID do modelo) e pausas entre sílabas.
 * Serve para exercitar o pipeline (VAD, ducking, stems) sem provedor real.
 */
export function speechExpr(voiceId: string, start: number, seconds: number): string {
  const h = parseInt(createHash('sha256').update(voiceId).digest('hex').slice(0, 4), 16);
  const pitch = 140 + (h % 90); const syl = (2.4 + (h % 7) / 10).toFixed(2);
  const local = `(t-${start.toFixed(2)})`;
  return `between(t\\,${start.toFixed(2)}\\,${(start + seconds).toFixed(2)})*0.5*sin(2*PI*(${pitch}+20*sin(2*PI*0.7*${local}))*t)*gt(sin(2*PI*${syl}*${local})+0.3*sin(2*PI*0.9*${local})\\,0.1)*(0.6+0.4*sin(2*PI*5*${local}))`;
}
