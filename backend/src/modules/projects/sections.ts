import { z } from 'zod';
import { asSystem, asUser } from '../../db/pool.js';
import { isEnabled } from '../flags.service.js';
import { usersRepo } from '../users/users.repository.js';
import { projectsRepo, sceneDto } from './projects.repository.js';
import { conflict, notFound, unprocessable } from '../../utils/errors.js';

/**
 * Edição por seções (ff_sections, desligada por padrão → 404). Cada seção tem até 15 s de fala, uma foto, o que a
 * imagem faz (texto livre + um movimento real de câmera aplicado na montagem) e o que falar. Se o texto passa de
 * 15 s, ele continua sozinho numa nova seção logo depois (mesma foto), como pedido pelo produto.
 */
export const SECTIONS_FLAG = 'ff_sections';
export const SECTION_MAX_SEC = 15;
export const SECTION_MAX_COUNT = 20; // 20 × 15 s = 300 s (5 min), o teto do vídeo final
export const MOTIONS = ['zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'still', 'human', 'talk'] as const;
export type Motion = (typeof MOTIONS)[number];
/** O movimento viaja no começo do `prompt` da cena ("[mov:zoom_in] texto livre"): sem coluna nova, sem mudar o contrato da API. */
const TOKEN = /^\[mov:([a-z_]+)\]\s*/;
export const withMotion = (motion: Motion, action: string): string => `[mov:${motion}] ${action}`.trim().slice(0, 800);
export function parseMotion(prompt: string): { motion: Motion | null; action: string } {
  const m = TOKEN.exec(prompt ?? ''); const mv = m?.[1] as Motion | undefined;
  return { motion: mv && (MOTIONS as readonly string[]).includes(mv) ? mv : null, action: (prompt ?? '').replace(TOKEN, '') };
}
/** Fala em português/inglês/espanhol: ~2,6 palavras por segundo na voz neutra (Kokoro/Piper a 1,0×). */
const WPS = 2.6;
export const words = (t: string): string[] => t.trim().split(/\s+/).filter(Boolean);
export const speechSec = (t: string): number => words(t).length / WPS;
export const durationFor = (t: string): number => Math.max(3, Math.min(SECTION_MAX_SEC, Math.ceil(speechSec(t) + 0.5)));

/** Divide o texto em pedaços de até `maxSec` de fala, preferindo o fim de frase; sem frase que caiba, corta por palavras. */
export function splitSpeech(text: string, maxSec = SECTION_MAX_SEC): string[] {
  const cap = Math.floor(maxSec * WPS); const out: string[] = [];
  const sentences = text.trim().split(/(?<=[.!?…])\s+/).filter(Boolean); let cur: string[] = [];
  const flush = () => { if (cur.length) { out.push(cur.join(' ')); cur = []; } };
  for (const s of sentences) {
    const w = words(s);
    if (w.length > cap) { flush(); for (let i = 0; i < w.length; i += cap) out.push(w.slice(i, i + cap).join(' ')); continue; }
    if (words(cur.join(' ')).length + w.length > cap) flush();
    cur.push(s);
  }
  flush(); return out.length ? out : [''];
}

export const sectionsBody = z.object({
  sections: z.array(z.object({
    text: z.string().max(2400).default(''),
    action: z.string().max(600).default(''),
    photoIndex: z.number().int().min(0).max(19).default(0),
    motion: z.enum(MOTIONS).default('zoom_in'),
  }).strict()).min(1).max(SECTION_MAX_COUNT),
}).strict();
export type SectionsBody = z.infer<typeof sectionsBody>;

export const sectionsService = {
  async save(userId: string, projectId: string, body: SectionsBody) {
    const u = await asSystem((db) => usersRepo.byId(db, userId)); if (!u) throw notFound();
    if (!(await isEnabled(SECTIONS_FLAG, { userId, region: u.region, plan: u.plan }))) throw notFound();
    const p = await asUser(userId, (db) => projectsRepo.byId(db, projectId)); if (!p) throw notFound();
    if (p.status === 'generating') throw conflict('O vídeo está sendo gerado. Espere terminar para editar as seções.', 'project_generating');
    const refs = p.photo_refs; // sem foto no servidor (fotos de exemplo): a seção usa o fundo padrão em vez de recusar
    // divisão automática: cada seção passa dos 15 s → o excedente vira novas seções logo depois, com a mesma foto/movimento
    const rows: { text: string; prompt: string; photo: string | undefined; dur: number }[] = []; let split = 0;
    for (const s of body.sections) {
      if (refs.length && s.photoIndex >= refs.length) throw unprocessable(`A foto ${s.photoIndex + 1} não existe neste projeto.`);
      const parts = splitSpeech(s.text); split += parts.length - 1;
      parts.forEach((t) => rows.push({ text: t, prompt: withMotion(s.motion, s.action), photo: refs[s.photoIndex], dur: durationFor(t) }));
    }
    if (rows.length > SECTION_MAX_COUNT) throw unprocessable(`O vídeo ficou com ${rows.length} seções; o máximo é ${SECTION_MAX_COUNT}. Encurte os textos.`);
    return asSystem(async (db) => {
      await db.query('UPDATE projects SET storyboard_id=NULL, status=\'draft\', final_video_url=NULL WHERE id=$1', [p.id]);
      await db.query('DELETE FROM storyboards WHERE project_id=$1', [p.id]); await db.query('DELETE FROM scenes WHERE project_id=$1', [p.id]);
      const sb = (await db.query<{ id: string }>(`INSERT INTO storyboards (project_id, voice_id, track_id, caption_style) VALUES ($1,'voice-1','track-1','bold') RETURNING id`, [p.id])).rows[0]!;
      for (const [i, r] of rows.entries()) await db.query(`INSERT INTO scenes (project_id,index,text,duration_sec,prompt,reference_mode,reference_images) VALUES ($1,$2,$3,$4,$5,'product',$6)`, [p.id, i, r.text, r.dur, r.prompt, r.photo ? [r.photo] : []]);
      await db.query('UPDATE projects SET storyboard_id=$2 WHERE id=$1', [p.id, sb.id]);
      await projectsRepo.log(db, p.id, null, 'storyboard', `${rows.length} seções salvas${split ? ` (${split} criada${split > 1 ? 's' : ''} pela divisão automática)` : ''}`);
      return { sections: (await projectsRepo.scenes(db, p.id)).map(sceneDto), split };
    });
  },
};
