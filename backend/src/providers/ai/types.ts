import type { PlatformId } from '../../utils/validate.js';
export type RefMode = 'product' | 'person' | 'both';
export interface SceneDraft { index: number; text: string; durationSec: number; prompt: string; referenceMode: RefMode }
export interface SceneInput extends SceneDraft { id: string; projectId: string; referenceKeys: string[]; retried?: boolean }
export interface Usage { provider: string; operation: string; costCents: number; latencyMs: number }
export interface SceneResult { videoKey: string; lastFrameKey: string; consistency: number; usage: Usage }
export interface StoryboardContext { category?: string; goal?: string; tone?: string; locale?: string }

/** Capacidades plugáveis — cada provedor implementa só o que faz. O `AIProvider` (router.ts) compõe tudo com fallback. */
export interface VideoProvider { name: string; generateScene(scene: SceneInput, previous: { lastFrameKey?: string } | undefined, ctx: { userId: string }): Promise<SceneResult> }
export interface TtsProvider { name: string; synthesize(text: string, locale: string, voice: { gender: 'male' | 'female' | 'neutral'; voiceId?: string }): Promise<{ audio: Buffer; ext: 'mp3' | 'wav'; voice: string; usage: Usage }> }
export interface ModerationProvider { name: string; moderate(text: string, imageUrls: string[]): Promise<{ allowed: boolean; categories: string[]; usage: Usage }> }

/** Estúdio de voz (ff_voice_studio): narração escolhida/gravada e música, aplicadas na montagem. */
export interface AssemblyAudio { narration: { mode: 'tts' | 'recorded' | 'none'; voiceId?: string; recordingRef?: string }; musicRef?: string | null; musicVolume?: number; captions?: boolean }
export interface AIProvider {
  generateStoryboard(script: string, photoKeys: string[], ctx: StoryboardContext): Promise<SceneDraft[]>;
  generateScene(scene: SceneInput, previous: { lastFrameKey?: string } | undefined, ctx: { userId: string; plan: string }): Promise<SceneResult>;
  assembleVideo(scenes: { videoKey: string; text: string; durationSec: number; photoKey?: string; motion?: string; action?: string }[], opts: { projectId: string; captionStyle?: string; trackId?: string; locale?: string; voiceGender?: 'male' | 'female' | 'neutral'; disclosure?: { visible: boolean; label: string }; audio?: AssemblyAudio }): Promise<{ videoKey: string; durationSec: number; subtitlesKey: string }>;
  dubVideo(video: { videoKey: string; projectId: string; scenes: { text: string; durationSec: number }[] }, targetLocales: string[], voice: { gender: 'male' | 'female' | 'neutral' }): Promise<{ locale: string; videoKey: string; audioKey: string; subtitlesKey: string; voice: string }[]>;
  generateSubtitles(scenes: { text: string; durationSec: number }[], locale: string): string;
  moderateContent(text: string, imageUrls: string[]): Promise<{ allowed: boolean; categories: string[] }>;
}
export type { PlatformId };
