import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdir, rename, stat } from 'node:fs/promises';
import { ffmpeg } from '../../utils/ffmpeg.js';
import { SFX } from './presets.js';

/** Arquivo do SFX embutido, gerado uma vez por processo num cache local (são poucos KB). */
const dir = join(tmpdir(), 'nexus-sfx-v1'); const pending = new Map<string, Promise<string>>();
export function sfxFile(id: string): Promise<string> {
  const s = SFX[id]; if (!s) return Promise.reject(new Error(`sfx desconhecido: ${id}`));
  let p = pending.get(id);
  if (!p) {
    p = (async () => {
      const f = join(dir, `${id}.wav`); await mkdir(dir, { recursive: true });
      if (!(await stat(f).then((x) => x.size > 0, () => false))) { // grava em arquivo temporário e renomeia (atômico entre processos)
        const tmp = `${f}.${process.pid}.${Date.now()}.wav`; await ffmpeg(['-f', 'lavfi', '-i', `aevalsrc='${s.expr}':s=44100:d=${s.dur}`, '-ac', '2', tmp]); await rename(tmp, f);
      }
      return f;
    })();
    p.catch(() => pending.delete(id)); pending.set(id, p);
  }
  return p;
}
