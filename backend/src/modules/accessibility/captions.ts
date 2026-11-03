import { createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Módulo 11 — legendas animadas por palavra (karaokê, ASS com `\kf`), estilos acessíveis com contraste medido (WCAG 1.4.3,
 * mínimo 4,5:1 entre texto e caixa) e exportação de transcrição SRT/VTT/TXT ASSINADA (HMAC-SHA256 do conteúdo).
 */
export interface W { w: string; start: number; end: number; scene: number }
export interface Cue { start: number; end: number; words: W[] }
export const STYLE_PRESETS = {
  padrao: { text: '#FFFFFF', highlight: '#FFD60A', box: '#000000', boxAlpha: 0.75, scale: 1, spacing: 0, bold: true },
  alto_contraste: { text: '#FFFFFF', highlight: '#FFFF00', box: '#000000', boxAlpha: 1, scale: 1.15, spacing: 0, bold: true },
  grande: { text: '#FFFFFF', highlight: '#FFD60A', box: '#000000', boxAlpha: 0.85, scale: 1.4, spacing: 0, bold: true },
  dislexia: { text: '#FFF8E7', highlight: '#7DD3FC', box: '#1B1B1B', boxAlpha: 0.9, scale: 1.15, spacing: 2, bold: false },
} as const;
export type StylePreset = keyof typeof STYLE_PRESETS;
const lum = (hex: string) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!; };
/** Contraste WCAG entre duas cores (caixa opaca; com transparência, consideramos o pior caso de fundo branco atrás). */
export function contrast(fg: string, bg: string, alpha = 1): number {
  const mix = (b: string) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(bg.slice(i, i + 2), 16) * alpha + parseInt(b.slice(i, i + 2), 16) * (1 - alpha)).toString(16).padStart(2, '0')).join('');
  const eff = alpha >= 1 ? bg : mix('#FFFFFF'); const a = lum(fg), b = lum(eff); return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 100) / 100;
}
export function resolveStyle(o: { preset?: StylePreset; position?: 'bottom' | 'top'; fontScale?: number }) {
  const p = STYLE_PRESETS[o.preset ?? 'padrao']; const scale = Math.min(2, Math.max(1, o.fontScale ?? p.scale));
  return { preset: o.preset ?? 'padrao', position: o.position ?? 'bottom', fontScale: scale, colors: { text: p.text, highlight: p.highlight, box: p.box, boxAlpha: p.boxAlpha },
    contrast: { text: contrast(p.text, p.box, p.boxAlpha), highlight: contrast(p.highlight, p.box, p.boxAlpha) }, spacing: p.spacing, bold: p.bold };
}
export type Style = ReturnType<typeof resolveStyle>;
/** Agrupa palavras em falas legíveis: até 6 palavras, 32 caracteres e 3,5 s (padrões de legendagem para vídeo curto). */
export function cues(words: W[], o: { maxWords?: number; maxChars?: number; maxMs?: number } = {}): Cue[] {
  const mw = o.maxWords ?? 6, mc = o.maxChars ?? 32, mm = o.maxMs ?? 3500; const out: Cue[] = []; let cur: W[] = [];
  const flush = () => { if (cur.length) out.push({ start: cur[0]!.start, end: cur[cur.length - 1]!.end, words: cur }); cur = []; };
  for (const w of words) {
    const len = cur.reduce((a, x) => a + x.w.length + 1, 0) + w.w.length;
    if (cur.length && (cur.length >= mw || len > mc || w.end - cur[0]!.start > mm || w.scene !== cur[0]!.scene)) flush();
    cur.push(w); if (/[.!?…]$/.test(w.w)) flush();
  }
  flush(); return out;
}
const assColor = (hex: string, alpha = 1) => `&H${Math.round((1 - alpha) * 255).toString(16).padStart(2, '0').toUpperCase()}${hex.slice(5, 7)}${hex.slice(3, 5)}${hex.slice(1, 3)}`.toUpperCase();
const assTime = (ms: number) => { const cs = Math.max(0, Math.round(ms / 10)); const h = Math.floor(cs / 360000), m = Math.floor((cs % 360000) / 6000), s = Math.floor((cs % 6000) / 100), c = cs % 100; return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`; };
const assEsc = (t: string) => t.replace(/[{}\\]/g, '').replace(/\n/g, ' ');
/** ASS com karaokê por palavra: `\kf` preenche cada palavra com a cor de destaque no tempo exato em que ela é falada. */
export function toAss(c: Cue[], st: Style, video: { width: number; height: number }): string {
  const size = Math.round((video.height / 22) * st.fontScale);
  // PrimaryColour = cor depois do preenchimento (destaque); SecondaryColour = antes (texto); BackColour = caixa (BorderStyle 3 = caixa opaca)
  const style = `Style: A11y,DejaVu Sans,${size},${assColor(st.colors.highlight)},${assColor(st.colors.text)},${assColor(st.colors.box)},${assColor(st.colors.box, st.colors.boxAlpha)},${st.bold ? -1 : 0},0,0,0,100,100,${st.spacing},0,3,${Math.round(size / 5)},0,${st.position === 'top' ? 8 : 2},${Math.round(video.width / 18)},${Math.round(video.width / 18)},${Math.round(video.height / 14)},1`;
  const lines = c.map((q) => { let at = q.start; const parts = q.words.map((w, i) => { const gap = Math.max(0, w.start - at); const dur = Math.max(1, (q.words[i + 1]?.start ?? w.end) - w.start); at = w.start + dur; return `${gap > 30 ? `{\\k${Math.round(gap / 10)}}` : ''}{\\kf${Math.round(dur / 10)}}${assEsc(w.w)}`; }).join(' ');
    return `Dialogue: 0,${assTime(q.start)},${assTime(Math.max(q.end, q.start + 300))},A11y,,0,0,0,,${parts}`; });
  return ['[Script Info]', 'Title: NexusReel — legendas acessíveis', 'ScriptType: v4.00+', `PlayResX: ${video.width}`, `PlayResY: ${video.height}`, 'WrapStyle: 0', 'ScaledBorderAndShadow: yes', '',
    '[V4+ Styles]', 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding', style, '',
    '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text', ...lines, ''].join('\n');
}
const ts = (ms: number, sep: ',' | '.') => { const t = Math.max(0, Math.round(ms)); const h = Math.floor(t / 3600000), m = Math.floor((t % 3600000) / 60000), s = Math.floor((t % 60000) / 1000), x = t % 1000; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(x).padStart(3, '0')}`; };
const txt = (q: Cue) => q.words.map((w) => w.w).join(' ');
export const toSrt = (c: Cue[]) => c.map((q, i) => `${i + 1}\n${ts(q.start, ',')} --> ${ts(Math.max(q.end, q.start + 500), ',')}\n${txt(q)}\n`).join('\n');
export const toVtt = (c: Cue[], kind?: 'descriptions') => ['WEBVTT' + (kind ? ' - descriptions' : ''), '', ...c.map((q, i) => `${i + 1}\n${ts(q.start, '.')} --> ${ts(Math.max(q.end, q.start + 500), '.')}\n${txt(q)}\n`)].join('\n');
export const toTxt = (c: Cue[]) => c.map(txt).join('\n') + '\n';
const key = () => createHash('sha256').update(String(env.DATA_ENCRYPTION_KEY) + ':nexusreel-transcript-export:v1').digest();
/** Assinatura da exportação: HMAC-SHA256 do conteúdo exato do arquivo (qualquer byte alterado invalida). */
export const signExport = (content: string | Buffer) => 'v1.' + createHmac('sha256', key()).update(content).digest('base64url');
export function verifyExport(content: string | Buffer, signature: string): boolean {
  const exp = Buffer.from(signExport(content)); const got = Buffer.from(String(signature)); return exp.length === got.length && timingSafeEqual(exp, got);
}
