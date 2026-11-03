/**
 * Módulo 6 — perfis de multimídia automotiva (vídeo por pendrive USB).
 * TODOS usam o denominador comum que as centrais aceitam: MP4 + H.264 **Baseline** (sem B-frames, CAVLC, 4:2:0 8 bits),
 * AAC-LC estéreo, nível e bitrate conservadores, `faststart`. Nível 3.1 em todos: 800×480@30 já passa do limite de macroblocos/s do nível 3.0. O teste confere com ffprobe que o codec sai Baseline.
 *
 * Honestidade: resolução/nível/bitrate por marca são valores CONSERVADORES escolhidos para caber nas telas mais comuns
 * de cada linha; NÃO foram confirmados em manual oficial de cada fabricante (`verified: false`). Ajuste aqui quando houver
 * o manual — o resto do pipeline não muda.
 */
export interface CarProfile {
  id: string; brand: string; label: string; width: number; height: number; fps: number;
  h264Level: '3.1' | '3.1' | '4.0'; videoKbps: number; audioKbps: number; sampleRate: 44100 | 48000; maxSec: number; verified: false; note: string;
}
const base = { fps: 30, audioKbps: 128, sampleRate: 44100 as const, maxSec: 130, verified: false as const };
export const CAR_PROFILES: CarProfile[] = [
  { ...base, id: 'generic_usb', brand: 'Genérico', label: 'Central genérica USB (720p)', width: 1280, height: 720, h264Level: '3.1', videoKbps: 2500, note: 'Funciona na maioria das centrais com leitor de vídeo USB' },
  { ...base, id: 'volkswagen', brand: 'Volkswagen', label: 'Volkswagen (Composition / MIB)', width: 1280, height: 720, h264Level: '3.1', videoKbps: 2500, note: 'Menu Mídia → USB → Vídeos (com o carro parado)' },
  { ...base, id: 'toyota', brand: 'Toyota', label: 'Toyota (multimídia 800×480)', width: 800, height: 480, h264Level: '3.1', videoKbps: 1500, note: 'Fonte USB → Vídeo (com o carro parado)' },
  { ...base, id: 'chevrolet', brand: 'Chevrolet', label: 'Chevrolet (MyLink 800×480)', width: 800, height: 480, h264Level: '3.1', videoKbps: 1500, note: 'Mídia → USB → Vídeos (com o carro parado)' },
  { ...base, id: 'hyundai', brand: 'Hyundai', label: 'Hyundai / Kia (720p)', width: 1280, height: 720, h264Level: '3.1', videoKbps: 2500, note: 'Mídia → USB → Vídeo (com o carro parado)' },
  { ...base, id: 'fiat', brand: 'Fiat', label: 'Fiat (Uconnect 1024×600)', width: 1024, height: 600, h264Level: '3.1', videoKbps: 2000, note: 'Mídia → USB → Vídeos (com o carro parado)' },
];
export const carProfile = (id: string) => CAR_PROFILES.find((p) => p.id === id);
