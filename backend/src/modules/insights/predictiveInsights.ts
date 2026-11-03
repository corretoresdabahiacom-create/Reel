import { asSystem, asUser, tx } from '../../db/pool.js';
import { recordUsage } from '../../providers/ai/router.js';
import { env } from '../../config/env.js';
import { m10Error, requireM10 } from '../m10/common.js';

/**
 * Módulo 10 — Inteligência preditiva (`ff_insights`). `scoreEngagement` estima retenção, CTR e conversão de 0 a 100 e
 * sugere ajustes. Regras de compliance:
 * - é SEMPRE uma estimativa (AI Act, transparência): `label: 'estimativa'` é fixo no banco (CHECK) e na resposta, com aviso;
 * - usa só features AGREGADAS do vídeo (números e booleanos: duração, cenas, ritmo, presença de pergunta/CTA, histórico
 *   agregado de publicações) — nenhum texto, nome, e-mail ou dado pessoal é guardado em `predictions.features_json`;
 * - modelo `heuristic-v1` (regras auditáveis, local). Um modelo treinado entra no lugar com a mesma saída.
 * Limite: 60/h por usuário (na rota). `ai_usage`: `insights_score`.
 */
export const LABEL = 'estimativa' as const;
export const DISCLAIMER = {
  'pt-BR': 'Estimativa gerada por IA a partir de padrões gerais de vídeos curtos. Não é garantia de resultado.',
  en: 'AI-generated estimate based on general short-video patterns. Not a guarantee of results.',
  es: 'Estimación generada por IA a partir de patrones generales de videos cortos. No es garantía de resultados.',
} as const;
type L = { 'pt-BR': string; en: string; es: string };
/** Sugestões com texto nos 3 idiomas ({{x}} = parâmetro) e o efeito estimado em pontos. */
export const SUGGESTIONS = {
  shorten_video: { metric: 'retention', 'pt-BR': 'Deixe o vídeo com 20 a 35 segundos (hoje tem {{sec}} s)', en: 'Make the video 20 to 35 seconds long (it is {{sec}} s now)', es: 'Deja el video entre 20 y 35 segundos (ahora tiene {{sec}} s)' },
  lengthen_video: { metric: 'retention', 'pt-BR': 'Vídeos com menos de 10 s explicam pouco: tente 15 a 30 s', en: 'Videos under 10 s explain little: try 15 to 30 s', es: 'Videos de menos de 10 s explican poco: prueba 15 a 30 s' },
  shorter_hook: { metric: 'retention', 'pt-BR': 'Encurte a primeira frase para até 12 palavras (hoje tem {{words}})', en: 'Shorten the first sentence to 12 words or fewer (it has {{words}} now)', es: 'Acorta la primera frase a 12 palabras o menos (ahora tiene {{words}})' },
  hook_question: { metric: 'ctr', 'pt-BR': 'Abra com uma pergunta ou um número ("Sabia que…?", "3 motivos…")', en: 'Open with a question or a number ("Did you know…?", "3 reasons…")', es: 'Empieza con una pregunta o un número ("¿Sabías que…?", "3 razones…")' },
  faster_cuts: { metric: 'retention', 'pt-BR': 'Troque de cena a cada 3 a 4 s (hoje a média é {{avg}} s)', en: 'Change scenes every 3 to 4 s (the average is {{avg}} s now)', es: 'Cambia de escena cada 3 a 4 s (ahora el promedio es {{avg}} s)' },
  slower_speech: { metric: 'retention', 'pt-BR': 'A narração está rápida ({{wps}} palavras/s): corte texto ou alongue as cenas', en: 'The narration is fast ({{wps}} words/s): cut text or lengthen scenes', es: 'La narración es rápida ({{wps}} palabras/s): recorta texto o alarga las escenas' },
  add_cta: { metric: 'conversion', 'pt-BR': 'Termine com uma chamada clara ("Toque no link e garanta o seu")', en: 'End with a clear call to action ("Tap the link and get yours")', es: 'Termina con un llamado claro ("Toca el enlace y consigue el tuyo")' },
  add_music: { metric: 'retention', 'pt-BR': 'Adicione trilha sonora (aumenta o tempo assistido)', en: 'Add a soundtrack (it raises watch time)', es: 'Añade banda sonora (aumenta el tiempo de visualización)' },
  translate: { metric: 'ctr', 'pt-BR': 'Crie versões em outros idiomas para alcançar mais pessoas', en: 'Create versions in other languages to reach more people', es: 'Crea versiones en otros idiomas para llegar a más personas' },
  title_length: { metric: 'ctr', 'pt-BR': 'Use um título de 20 a 60 caracteres (hoje tem {{chars}})', en: 'Use a title of 20 to 60 characters (it has {{chars}} now)', es: 'Usa un título de 20 a 60 caracteres (ahora tiene {{chars}})' },
} satisfies Record<string, L & { metric: string }>;
export type SuggestionCode = keyof typeof SUGGESTIONS;
const CTA = /\b(compre|comprar|garanta|aproveite|clique|toque|link|confira|peça|buy|shop|order|tap|click|get yours|compra|consigue|haz clic|toca|pide)\b/i;
export interface Features {
  durationSec: number; sceneCount: number; avgSceneSec: number; hookWords: number; hookQuestion: boolean; hookNumber: boolean; ctaPresent: boolean;
  wordsPerSec: number; hasMusic: boolean; localizedCount: number; titleChars: number; pastPublications: number; pastSuccessRate: number;
}
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const r1 = (n: number) => Math.round(n * 10) / 10;
/** Extrai as features agregadas (o texto é lido, contado e descartado — não sai desta função). */
export async function extractFeatures(userId: string, projectId: string): Promise<Features> {
  const p = await asUser(userId, async (db) => (await db.query<{ title: string; duration_sec: number | null; status: string; final_video_url: string | null; active_audio_version_id: string | null }>(
    'SELECT title, duration_sec, status, final_video_url, active_audio_version_id FROM projects WHERE id=$1 AND deleted_at IS NULL', [projectId])).rows[0]);
  if (!p) throw m10Error(404, 'project_not_found', undefined, 'not_found');
  const scenes = await asSystem(async (db) => (await db.query<{ text: string; duration_sec: number }>(`SELECT DISTINCT ON (index) text, duration_sec FROM scenes WHERE project_id=$1 ORDER BY index, selected DESC, version DESC`, [projectId])).rows);
  const agg = await asSystem(async (db) => (await db.query<{ total: number; ok: number; loc: number }>(`SELECT (SELECT count(*)::int FROM publications WHERE user_id=$1) total, (SELECT count(*)::int FROM publications WHERE user_id=$1 AND status='published') ok,
    (SELECT count(*)::int FROM localized_versions WHERE project_id=$2) loc`, [userId, projectId])).rows[0]!);
  const dur = p.duration_sec ?? scenes.reduce((a, s) => a + s.duration_sec, 0); const first = scenes[0]?.text ?? '', last = scenes[scenes.length - 1]?.text ?? '';
  const totalWords = scenes.reduce((a, s) => a + words(s.text), 0);
  return { durationSec: dur, sceneCount: scenes.length, avgSceneSec: scenes.length ? r1(dur / scenes.length) : 0, hookWords: words(first), hookQuestion: /\?|¿/.test(first), hookNumber: /\d/.test(first),
    ctaPresent: CTA.test(last), wordsPerSec: dur ? r1(totalWords / dur) : 0, hasMusic: !!p.active_audio_version_id, localizedCount: agg.loc, titleChars: p.title.length,
    pastPublications: agg.total >= 10 ? 10 : agg.total, pastSuccessRate: agg.total ? Math.round((agg.ok / agg.total) * 100) / 100 : 0 }; // histórico só agregado e em faixa
}
const clamp = (n: number) => Math.max(5, Math.min(95, Math.round(n)));
/** Modelo `heuristic-v1`: regras simples e auditáveis sobre as features. Devolve notas e sugestões ordenadas por efeito. */
export function score(f: Features): { retention: number; ctr: number; conversion: number; suggestions: Array<{ code: SuggestionCode; metric: string; impact: number; params: Record<string, number> }> } {
  const s: Array<{ code: SuggestionCode; metric: string; impact: number; params: Record<string, number> }> = []; const add = (code: SuggestionCode, impact: number, params: Record<string, number> = {}) => s.push({ code, metric: SUGGESTIONS[code].metric, impact, params });
  let ret = 50, ctr = 40, conv = 30;
  if (f.durationSec >= 15 && f.durationSec <= 35) ret += 15; else if (f.durationSec > 60) { ret -= 15; add('shorten_video', 15, { sec: f.durationSec }); } else if (f.durationSec > 35) { ret += 3; add('shorten_video', 8, { sec: f.durationSec }); } else if (f.durationSec < 10) { ret -= 5; add('lengthen_video', 6); } else ret += 8;
  if (f.hookWords <= 12) ret += 10; else { ret -= 5; add('shorter_hook', 10, { words: f.hookWords }); }
  if (f.hookQuestion || f.hookNumber) { ret += 6; ctr += 12; } else add('hook_question', 12);
  if (f.avgSceneSec && f.avgSceneSec <= 4) ret += 7; else if (f.avgSceneSec > 6) { ret -= 7; add('faster_cuts', 7, { avg: f.avgSceneSec }); }
  if (f.wordsPerSec > 3.5) { ret -= 8; add('slower_speech', 8, { wps: f.wordsPerSec }); } else if (f.wordsPerSec >= 1.8) ret += 5;
  if (f.hasMusic) ret += 5; else add('add_music', 5);
  if (f.titleChars >= 20 && f.titleChars <= 60) ctr += 6; else add('title_length', 6, { chars: f.titleChars });
  if (f.localizedCount > 0) ctr += 5; else add('translate', 4);
  ctr += Math.round(f.pastSuccessRate * 6);
  if (f.ctaPresent) conv += 25; else add('add_cta', 20);
  conv += Math.round((ret - 50) / 4) + Math.round((ctr - 40) / 6);
  return { retention: clamp(ret), ctr: clamp(ctr), conversion: clamp(conv), suggestions: s.sort((a, b) => b.impact - a.impact).slice(0, 6) };
}
const fill = (t: string, p: Record<string, number>) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => String(p[k] ?? '').replace('.', ','));
interface PRow { id: string; project_id: string; score_retention: number; score_ctr: number; score_conversion: number; suggestions_json: ReturnType<typeof score>['suggestions']; features_json: Features; model_version: string; label: string; created_at: string }
function dto(r: PRow, locale: string) {
  const loc = (['pt-BR', 'en', 'es'].includes(locale) ? locale : 'pt-BR') as keyof L;
  return { predictionId: r.id, projectId: r.project_id, label: r.label, isEstimate: true, disclaimer: DISCLAIMER[loc], modelVersion: r.model_version, createdAt: r.created_at,
    scores: { retention: r.score_retention, ctr: r.score_ctr, conversion: r.score_conversion },
    suggestions: r.suggestions_json.map((x) => ({ code: x.code, metric: x.metric, impact: x.impact, params: x.params, text: fill(SUGGESTIONS[x.code][loc], x.params) })), features: r.features_json };
}
export const predictiveInsights = {
  /** POST /projects/:projectId/insights — calcula e guarda uma estimativa (60/h por usuário na rota). */
  async scoreEngagement(userId: string, projectId: string, locale = 'pt-BR') {
    await requireM10('ff_insights', userId); const t0 = Date.now();
    const f = await extractFeatures(userId, projectId); const sc = score(f);
    const row = await tx({ userId }, async (db) => (await db.query<PRow>(`INSERT INTO predictions (project_id, user_id, score_retention, score_ctr, score_conversion, suggestions_json, features_json, model_version)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [projectId, userId, sc.retention, sc.ctr, sc.conversion, JSON.stringify(sc.suggestions), f, env.INSIGHTS_MODEL])).rows[0]!);
    await recordUsage({ provider: env.INSIGHTS_MODEL, operation: 'insights_score', costCents: 0, latencyMs: Date.now() - t0, userId, projectId, status: 'ok' });
    return dto(row, locale);
  },
  async list(userId: string, projectId: string, locale = 'pt-BR') {
    await requireM10('ff_insights', userId);
    const rows = await asUser(userId, async (db) => (await db.query<PRow>('SELECT * FROM predictions WHERE project_id=$1 ORDER BY created_at DESC LIMIT 20', [projectId])).rows);
    return { items: rows.map((r) => dto(r, locale)) };
  },
};
