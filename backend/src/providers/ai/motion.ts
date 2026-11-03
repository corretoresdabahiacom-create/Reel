/**
 * Movimento real da foto (câmera lenta de cinema, "Ken Burns") renderizado com FFmpeg: grátis e sem provedor de IA.
 * Parte de UMA imagem (sem -loop): o zoompan gera `frames` quadros. Entrada ampliada (720×1280) para não pixelar no zoom.
 */
export const MOTION_FPS = 12;
export function motionFilter(motion: string, durSec: number): string | null {
  const F = Math.max(2, Math.round(durSec * MOTION_FPS)); const base = 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280';
  const cx = "x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'";
  const z: Record<string, string> = {
    zoom_in: `zoompan=z='1+0.25*on/${F}':${cx}`,
    zoom_out: `zoompan=z='1.25-0.25*on/${F}':${cx}`,
    pan_left: `zoompan=z='1.2':x='(iw-iw/zoom)*(1-on/${F})':y='ih/2-(ih/zoom/2)'`,
    pan_right: `zoompan=z='1.2':x='(iw-iw/zoom)*on/${F}':y='ih/2-(ih/zoom/2)'`,
  };
  const f = z[motion]; return f ? `${base},${f}:d=${F}:s=360x640:fps=${MOTION_FPS},format=yuv420p` : null;
}
