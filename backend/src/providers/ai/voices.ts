import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '../../config/env.js';

/**
 * Catálogo das vozes ABERTAS (gratuitas, rodam no próprio servidor). Uma voz só aparece como disponível se o modelo
 * estiver instalado (imagem Docker ou pasta configurada). Licenças conferidas no MODEL_CARD de cada voz (out/2026):
 * - `ok`: pode ser usada em produto comercial (domínio público, CC0 treinada do zero, Apache-2.0);
 * - `review`: dados CC0, mas o modelo foi ajustado a partir da voz "lessac" (Blizzard 2013, licença de pesquisa) —
 *   revisão jurídica antes de cobrar por vídeos com estas vozes.
 * Vozes com licença NÃO comercial (en_US-ryan, hfc_*, lessac) ficaram de fora de propósito.
 * Gênero: medido no áudio gerado (tom fundamental F0 e 2º formante, Praat), não pelo nome.
 */
export type VoiceGender = 'female' | 'male';
export type VoiceEngine = 'piper' | 'kokoro' | 'edge';
export type VoiceLocale = 'pt-BR' | 'en' | 'es';
export interface OpenVoice { id: string; engine: VoiceEngine; locale: VoiceLocale; gender: VoiceGender; label: string; model: string; license: string; commercial: 'ok' | 'review'; lang: string }

const LESSAC = 'Dados CC0; modelo ajustado a partir da voz lessac (licença de pesquisa) — revisar antes de uso comercial';
const KOKORO = 'Apache-2.0 (Kokoro-82M)';
const EDGE = 'Voz neural online da Microsoft (Edge TTS, serviço não oficial e gratuito); sem garantia de uso comercial — revisar antes de cobrar';
export const OPEN_VOICES: OpenVoice[] = [
  // Vozes neurais online (opcionais: EDGE_TTS=1). Ficam primeiro no catálogo: quando ligadas, são as padrão; se o serviço cair, cai para Kokoro/Piper.
  { id: 'edge:pt-BR-FranciscaNeural', engine: 'edge', locale: 'pt-BR', gender: 'female', label: 'Francisca (natural)', model: 'pt-BR-FranciscaNeural', license: EDGE, commercial: 'review', lang: 'pt-br' },
  { id: 'edge:pt-BR-AntonioNeural', engine: 'edge', locale: 'pt-BR', gender: 'male', label: 'Antônio (natural)', model: 'pt-BR-AntonioNeural', license: EDGE, commercial: 'review', lang: 'pt-br' },
  { id: 'edge:pt-BR-ThalitaMultilingualNeural', engine: 'edge', locale: 'pt-BR', gender: 'female', label: 'Thalita (natural)', model: 'pt-BR-ThalitaMultilingualNeural', license: EDGE, commercial: 'review', lang: 'pt-br' },
  { id: 'edge:en-US-AriaNeural', engine: 'edge', locale: 'en', gender: 'female', label: 'Aria (natural)', model: 'en-US-AriaNeural', license: EDGE, commercial: 'review', lang: 'en-us' },
  { id: 'edge:en-US-GuyNeural', engine: 'edge', locale: 'en', gender: 'male', label: 'Guy (natural)', model: 'en-US-GuyNeural', license: EDGE, commercial: 'review', lang: 'en-us' },
  { id: 'edge:es-MX-DaliaNeural', engine: 'edge', locale: 'es', gender: 'female', label: 'Dalia (natural)', model: 'es-MX-DaliaNeural', license: EDGE, commercial: 'review', lang: 'es' },
  { id: 'edge:es-MX-JorgeNeural', engine: 'edge', locale: 'es', gender: 'male', label: 'Jorge (natural)', model: 'es-MX-JorgeNeural', license: EDGE, commercial: 'review', lang: 'es' },
  { id: 'kokoro:pf_dora', engine: 'kokoro', locale: 'pt-BR', gender: 'female', label: 'Dora', model: 'pf_dora', license: KOKORO, commercial: 'ok', lang: 'pt-br' },
  { id: 'piper:pt_BR-faber-medium', engine: 'piper', locale: 'pt-BR', gender: 'female', label: 'Faber', model: 'pt_BR-faber-medium', license: LESSAC, commercial: 'review', lang: 'pt-br' },
  { id: 'kokoro:pm_alex', engine: 'kokoro', locale: 'pt-BR', gender: 'male', label: 'Alex', model: 'pm_alex', license: KOKORO, commercial: 'ok', lang: 'pt-br' },
  { id: 'piper:pt_BR-cadu-medium', engine: 'piper', locale: 'pt-BR', gender: 'male', label: 'Cadu', model: 'pt_BR-cadu-medium', license: LESSAC, commercial: 'review', lang: 'pt-br' },
  { id: 'piper:pt_BR-jeff-medium', engine: 'piper', locale: 'pt-BR', gender: 'male', label: 'Jeff', model: 'pt_BR-jeff-medium', license: LESSAC, commercial: 'review', lang: 'pt-br' },
  { id: 'piper:en_US-ljspeech-medium', engine: 'piper', locale: 'en', gender: 'female', label: 'Linda', model: 'en_US-ljspeech-medium', license: 'Domínio público (LJ Speech)', commercial: 'ok', lang: 'en-us' },
  { id: 'kokoro:af_heart', engine: 'kokoro', locale: 'en', gender: 'female', label: 'Heart', model: 'af_heart', license: KOKORO, commercial: 'ok', lang: 'en-us' },
  { id: 'piper:en_US-kristin-medium', engine: 'piper', locale: 'en', gender: 'female', label: 'Kristin', model: 'en_US-kristin-medium', license: 'Domínio público (LibriVox)', commercial: 'ok', lang: 'en-us' },
  { id: 'piper:en_US-norman-medium', engine: 'piper', locale: 'en', gender: 'male', label: 'Norman', model: 'en_US-norman-medium', license: 'Domínio público (LibriVox)', commercial: 'ok', lang: 'en-us' },
  { id: 'kokoro:am_michael', engine: 'kokoro', locale: 'en', gender: 'male', label: 'Michael', model: 'am_michael', license: KOKORO, commercial: 'ok', lang: 'en-us' },
  { id: 'piper:es_MX-claude-high', engine: 'piper', locale: 'es', gender: 'female', label: 'Clara', model: 'es_MX-claude-high', license: 'Apache-2.0 (HirCoir/Piper-TTS-Spanish)', commercial: 'ok', lang: 'es-419' },
  { id: 'kokoro:ef_dora', engine: 'kokoro', locale: 'es', gender: 'female', label: 'Dora (es)', model: 'ef_dora', license: KOKORO, commercial: 'ok', lang: 'es' },
  { id: 'kokoro:em_alex', engine: 'kokoro', locale: 'es', gender: 'male', label: 'Alex (es)', model: 'em_alex', license: KOKORO, commercial: 'ok', lang: 'es' },
  { id: 'piper:es_ES-davefx-medium', engine: 'piper', locale: 'es', gender: 'male', label: 'Davi', model: 'es_ES-davefx-medium', license: LESSAC, commercial: 'review', lang: 'es' },
  { id: 'piper:es_MX-ald-medium', engine: 'piper', locale: 'es', gender: 'male', label: 'Aldo', model: 'es_MX-ald-medium', license: 'Dados Unlicense; ajustado a partir de davefx (lessac) — revisar antes de uso comercial', commercial: 'review', lang: 'es-419' },
];

export const voiceLocale = (locale: string): VoiceLocale => (locale.startsWith('pt') ? 'pt-BR' : locale.startsWith('es') ? 'es' : 'en');
export const piperModelPath = (model: string) => join(env.PIPER_VOICES_DIR, `${model}.onnx`);
/** Modelo completo (fp32, melhor qualidade) se estiver ao lado do reduzido (int8); senão o configurado. */
export const kokoroModel = () => { const full = env.KOKORO_MODEL.replace('.int8', ''); return full !== env.KOKORO_MODEL && existsSync(full) ? full : env.KOKORO_MODEL; };
export const kokoroInstalled = () => existsSync(kokoroModel()) && existsSync(env.KOKORO_VOICES);
export const edgeEnabled = () => env.EDGE_TTS === '1';
export function voiceAvailable(v: OpenVoice): boolean {
  if (v.engine === 'edge') return edgeEnabled();
  return v.engine === 'piper' ? existsSync(piperModelPath(v.model)) : kokoroInstalled();
}
export const voiceById = (id: string): OpenVoice | undefined => OPEN_VOICES.find((v) => v.id === id);

/**
 * Melhor voz instalada para o idioma/gênero: a pedida (se existir e estiver instalada), senão a primeira do catálogo
 * com o mesmo idioma e gênero (ordem do catálogo = preferência: licença `ok` primeiro), senão qualquer uma do idioma.
 * `undefined` = nenhuma voz aberta instalada (o roteador cai para a voz reserva, espeak-ng).
 */
export function resolveVoice(locale: string, gender: 'male' | 'female' | 'neutral', voiceId?: string): OpenVoice | undefined {
  const lang = voiceLocale(locale);
  const wanted = voiceId ? voiceById(voiceId) : undefined;
  if (wanted && voiceAvailable(wanted)) return wanted;
  const g: VoiceGender = gender === 'male' ? 'male' : 'female';
  const pool = OPEN_VOICES.filter((v) => v.locale === lang && voiceAvailable(v));
  return pool.find((v) => v.gender === (wanted?.gender ?? g)) ?? pool[0];
}
