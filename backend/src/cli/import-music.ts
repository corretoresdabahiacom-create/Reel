import { readFileSync, existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { asSystem, pool } from '../db/pool.js';
import { storage, refLocation } from '../providers/storage.js';
import { ffmpeg, ffprobeDuration, withTmp } from '../utils/ffmpeg.js';
import { audit } from '../repositories/audit.js';

/**
 * Importa músicas de LICENÇA LIVRE para a biblioteca (visível a todos), guardando licença, crédito e origem de cada uma.
 * Só aceita CC0 / domínio público / CC BY (este último exige crédito). Idempotente (pula a origem já importada).
 *
 *   node dist/cli/import-music.js infra/free/music-cc0.json            # baixa da internet (servidor)
 *   node dist/cli/import-music.js infra/free/music-cc0.json --from-dir /pasta   # usa arquivos já baixados (mesmo caminho relativo)
 */
const out = (s: string) => process.stdout.write(`${s}\n`); // CLI: progresso no terminal de quem rodou
const LICENSES = ['CC0-1.0', 'public-domain', 'CC-BY-4.0'] as const;
const manifestSchema = z.object({
  source: z.string().min(10), license: z.enum(LICENSES), attribution: z.string().default(''), base: z.string().url(),
  tracks: z.array(z.object({ title: z.string().min(1).max(80), mood: z.string().min(2).max(30), genre: z.string().min(2).max(30), path: z.string().min(3).max(200), bpm: z.number().int().min(40).max(220).optional() })).min(1).max(200),
}).refine((m) => m.license !== 'CC-BY-4.0' || m.attribution.trim().length > 0, { message: 'attribution_required_for_cc_by' });
const MAX_BYTES = 30 * 1024 * 1024;
const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function importMusic(manifestFile: string, fromDir?: string): Promise<{ imported: number; skipped: number; failed: string[] }> {
  const m = manifestSchema.parse(JSON.parse(readFileSync(manifestFile, 'utf8')));
  let imported = 0, skipped = 0; const failed: string[] = [];
  for (const t of m.tracks) {
    const sourceUrl = new URL(t.path.split('/').map(encodeURIComponent).join('/'), m.base).toString();
    const row = (await pool.query<{ file_url: string }>('SELECT file_url FROM music_tracks WHERE source_url=$1 AND owner_user_id IS NULL', [sourceUrl])).rows[0];
    // já cadastrada: só pula se o ARQUIVO ainda existe no armazenamento (volume perdido → reenvia o arquivo, sem duplicar a linha)
    if (row) { const l = refLocation(row.file_url.replace(/^videos\//, '')); const ok = await storage.get(l.bucket, l.key).then(() => true, () => false); if (ok) { skipped++; continue; } }
    try {
      let buf: Buffer;
      const local = fromDir ? join(fromDir, t.path) : null;
      if (local && existsSync(local)) buf = await readFile(local);
      else { const r = await fetch(sourceUrl, { signal: AbortSignal.timeout(120_000) }); if (!r.ok) throw new Error(`HTTP ${r.status}`); buf = Buffer.from(await r.arrayBuffer()); }
      if (buf.length < 1000 || buf.length > MAX_BYTES) throw new Error(`tamanho inválido (${buf.length} bytes)`);
      const { audio, dur } = await withTmp(async (dir) => {
        const i = join(dir, 'in.bin'), o = join(dir, 'out.m4a'); await writeFile(i, buf);
        await ffmpeg(['-i', i, '-vn', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ac', '2', '-ar', '44100', '-c:a', 'aac', '-b:a', '160k', o], 300_000);
        return { audio: await readFile(o), dur: await ffprobeDuration(o) };
      });
      if (dur < 5 || dur > 600) throw new Error(`duração fora do limite (${Math.round(dur)} s)`);
      const key = `library/cc0/${slug(t.title)}.m4a`; await storage.put('videos', key, audio, 'audio/mp4');
      if (row) { imported++; out(`refeito ${t.title} (arquivo restaurado)`); continue; }
      await asSystem(async (db) => {
        const r = await db.query<{ id: string }>(`INSERT INTO music_tracks (title, mood, genre, bpm, duration, license_region, file_url, owner_user_id, source, license, attribution, source_url)
          VALUES ($1,$2,$3,$4,$5,ARRAY['*'],$6,NULL,'library',$7,$8,$9) RETURNING id`, [t.title, t.mood, t.genre, t.bpm ?? 100, Math.round(dur), `videos/${key}`, m.license, m.attribution || null, sourceUrl]);
        await audit(db, '00000000-0000-0000-0000-000000000000', 'music.import', 'music_track', r.rows[0]!.id, { license: m.license, title: t.title });
      });
      imported++; out(`ok   ${t.title} (${Math.round(dur)} s, ${m.license})`);
    } catch (e) { failed.push(t.title); out(`erro ${t.title}: ${(e as Error).message.slice(0, 160)}`); }
  }
  return { imported, skipped, failed };
}

if (process.argv[1] && /import-music\.(js|ts)$/.test(process.argv[1])) {
  const [file, flag, dir] = process.argv.slice(2);
  if (!file) { console.error('uso: import-music <manifesto.json> [--from-dir <pasta>]'); process.exit(2); }
  importMusic(file, flag === '--from-dir' ? dir : undefined).then(async (r) => { out(JSON.stringify(r)); await pool.end(); process.exit(r.failed.length && !r.imported ? 1 : 0); })
    .catch(async (e) => { console.error(String(e)); await pool.end().catch(() => undefined); process.exit(1); });
}
