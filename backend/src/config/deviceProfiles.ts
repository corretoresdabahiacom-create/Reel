/**
 * Módulo 6 — perfis de aparelho para assets derivados (wallpapers e screensavers). Tudo é gerado localmente (FFmpeg).
 * Dimensões sempre pares (exigência do H.264 4:2:0). `fill`: `cover` corta para preencher; `blur` encaixa o vídeo inteiro
 * sobre uma versão desfocada dele mesmo (vídeo vertical numa tela horizontal, sem barras pretas).
 */
export type WallpaperKind = 'phone_live_ios' | 'phone_live_android' | 'pc';
export interface DeviceProfile {
  id: string; label: string; kind: WallpaperKind | 'screensaver'; platform: 'ios' | 'android' | 'windows' | 'macos' | 'any';
  width: number; height: number; fps: number; fill: 'cover' | 'blur'; formats: Array<'mp4' | 'webm' | 'live_zip' | 'frames_zip'>;
  defaultSec: number; maxSec: number; loop: boolean; note: string;
}
export const DEVICE_PROFILES: DeviceProfile[] = [
  // iOS Live Photo: par MOV (H.264, com com.apple.quicktime.content.identifier) + JPEG do quadro-chave; Live Photos têm ~3 s.
  { id: 'iphone_live', label: 'iPhone (Live Photo)', kind: 'phone_live_ios', platform: 'ios', width: 1080, height: 1920, fps: 30, fill: 'cover', formats: ['live_zip'], defaultSec: 3, maxSec: 3, loop: false,
    note: 'Ajustes → Papel de Parede → adicionar → Fotos → escolher a Live Photo salva pelo app' },
  // Android: o app de wallpaper animado toca um MP4 em loop (sem áudio).
  { id: 'android_fhd', label: 'Android Full HD+', kind: 'phone_live_android', platform: 'android', width: 1080, height: 2400, fps: 30, fill: 'cover', formats: ['mp4'], defaultSec: 10, maxSec: 15, loop: true,
    note: 'Toque e segure a tela inicial → Papéis de parede → vídeo (ou o app NexusReel como papel de parede animado)' },
  { id: 'android_qhd', label: 'Android QHD+', kind: 'phone_live_android', platform: 'android', width: 1440, height: 3200, fps: 30, fill: 'cover', formats: ['mp4'], defaultSec: 10, maxSec: 15, loop: true,
    note: 'Toque e segure a tela inicial → Papéis de parede → vídeo' },
  { id: 'pc_1080', label: 'PC 1080p', kind: 'pc', platform: 'any', width: 1920, height: 1080, fps: 30, fill: 'blur', formats: ['mp4', 'webm'], defaultSec: 15, maxSec: 30, loop: true, note: 'Use em apps de papel de parede animado (ex.: Lively, Wallpaper Engine, Plash)' },
  { id: 'pc_1440', label: 'PC 1440p', kind: 'pc', platform: 'any', width: 2560, height: 1440, fps: 30, fill: 'blur', formats: ['mp4', 'webm'], defaultSec: 15, maxSec: 30, loop: true, note: 'Use em apps de papel de parede animado' },
  { id: 'pc_4k', label: 'PC 4K', kind: 'pc', platform: 'any', width: 3840, height: 2160, fps: 30, fill: 'blur', formats: ['mp4', 'webm'], defaultSec: 15, maxSec: 30, loop: true, note: 'Use em apps de papel de parede animado' },
  // Screensaver: pacote que abre no protetor de tela NATIVO de fotos (sem executável .scr/.saver) + o vídeo em loop.
  { id: 'windows', label: 'Windows (protetor de tela Fotos)', kind: 'screensaver', platform: 'windows', width: 1920, height: 1080, fps: 30, fill: 'blur', formats: ['frames_zip'], defaultSec: 15, maxSec: 30, loop: true,
    note: 'Extraia a pasta → Configurações → Personalização → Tela de bloqueio → Proteção de tela → Fotos → Configurações → Procurar a pasta' },
  { id: 'macos', label: 'macOS (protetor de tela de fotos)', kind: 'screensaver', platform: 'macos', width: 2560, height: 1600, fps: 30, fill: 'blur', formats: ['frames_zip'], defaultSec: 15, maxSec: 30, loop: true,
    note: 'Extraia a pasta → Ajustes do Sistema → Protetor de Tela → um protetor de fotos → Origem → Escolher pasta' },
];
export const deviceProfile = (id: string) => DEVICE_PROFILES.find((p) => p.id === id);
