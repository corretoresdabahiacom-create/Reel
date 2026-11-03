/**
 * Movimento humano real na foto (corpo, rosto, olhos, boca, roupa pelo texto) com modelo ABERTO de imagem→vídeo
 * (Wan 2.x) rodando num Hugging Face Space gratuito (ZeroGPU). O backend só chama; falha/fila/cota → null e o
 * chamador mantém o movimento de câmera. A API do Space é descoberta em tempo de execução (view_api), então
 * trocar de Space é só mudar HF_VIDEO_SPACE.
 */
import { Client, handle_file } from '@gradio/client';
import { env } from '../../config/env.js';

type Param = { parameter_name?: string; label?: string; type?: { type?: string }; python_type?: { type?: string }; component?: string; parameter_has_default?: boolean; parameter_default?: unknown };
export const humanPrompt = (action: string, speech: string): string => {
  const a = action.trim(); const base = 'natural realistic human motion: blinking, subtle facial expressions, head and eye movement, mouth speaking, arms and body moving, walking or jumping if the scene asks; same person, same face, same clothes unless asked; stable camera';
  return (a ? `${a}. ` : '') + (speech ? `The person says: "${speech.slice(0, 160)}". ` : '') + base;
};
const kind = (p: Param) => `${p.component ?? ''} ${p.python_type?.type ?? ''} ${p.type?.type ?? ''}`.toLowerCase();
const name = (p: Param) => `${p.parameter_name ?? ''} ${p.label ?? ''}`.toLowerCase();

/** Monta os argumentos pelos tipos/nomes dos parâmetros do endpoint; devolve null se não achar imagem+texto. */
export function mapArgs(params: Param[], img: unknown, prompt: string, seconds: number, extra: { audio?: unknown; overrides?: Record<string, unknown> } = {}): unknown[] | null {
  if (!params.some((p) => /image/.test(kind(p)))) return null;
  let usedImg = false, usedTxt = false, usedAud = false; const out: unknown[] = [];
  for (const p of params) {
    const k = kind(p), n = name(p); const ov = Object.entries(extra.overrides ?? {}).find(([key]) => (p.parameter_name ?? '') === key);
    if (ov) out.push(ov[1]);
    else if (/audio/.test(k) && extra.audio && !usedAud) { out.push(extra.audio); usedAud = true; }
    else if (/image/.test(k) && !usedImg && !/last|end|tail/.test(n)) { out.push(img); usedImg = true; }
    else if (/textbox|string/.test(k) && !usedTxt && !/negative/.test(n)) { out.push(prompt); usedTxt = true; }
    else if (/negative/.test(n)) out.push(p.parameter_default ?? '');
    else if (/duration|second|length/.test(n) && /number|slider|float|int/.test(k)) out.push(Math.max(1, Math.min(5, seconds)));
    else if (p.parameter_has_default || p.parameter_default !== undefined) out.push(p.parameter_default); else out.push(null);
  }
  return usedImg && (usedTxt || usedAud) ? out : null;
}

async function callSpace(space: string, build: (params: Param[]) => unknown[] | null): Promise<Buffer | null> {
  if (!space) return null;
  try {
    const client = await Client.connect(space, env.HF_TOKEN ? { token: env.HF_TOKEN as `hf_${string}` } : {});
    const api = (await client.view_api()) as { named_endpoints?: Record<string, { parameters?: Param[] }> };
    const eps = Object.entries(api.named_endpoints ?? {}); const want = env.HF_VIDEO_API;
    const pick = (want && space === env.HF_VIDEO_SPACE ? eps.filter(([k]) => k === want) : eps).map(([k, v]) => ({ k, args: build(v.parameters ?? []) })).find((x) => x.args);
    if (!pick) return null;
    const res = await Promise.race([client.predict(pick.k, pick.args as unknown[]), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), env.HF_VIDEO_TIMEOUT_MS))]);
    const data = (res as { data?: unknown[] }).data ?? [];
    const f = data.map((d) => (d && typeof d === 'object' ? (d as { video?: { url?: string }; url?: string }) : null)).map((d) => d?.video?.url ?? d?.url).find((u) => !!u);
    if (!f) return null;
    const r = await fetch(f, { headers: env.HF_TOKEN ? { authorization: `Bearer ${env.HF_TOKEN}` } : {} }); if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}
const blob = (b: Buffer, type: string) => handle_file(new Blob([new Uint8Array(b)], { type }));
/** Corpo/ações (Wan 2.x): a pessoa anda, pula, acena; o texto da ação e da fala guia o movimento. */
export const humanMotionClip = (photo: Buffer, action: string, speech: string, seconds: number) =>
  callSpace(env.HF_VIDEO_SPACE, (ps) => mapArgs(ps, blob(photo, 'image/jpeg'), humanPrompt(action, speech), seconds));
/** Rosto falando (SadTalker): boca sincronizada com a narração da seção, piscar e movimento de cabeça. */
export const talkingClip = (photo: Buffer, wav: Buffer) =>
  callSpace(env.HF_TALK_SPACE, (ps) => mapArgs(ps, blob(photo, 'image/jpeg'), '', 0, { audio: blob(wav, 'audio/wav'), overrides: { preprocess: 'full', still_mode: false, expression_scale: 1.3, resolution: 256 } }));
