import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { boot, shutdown, pool } from './helpers.js';
import { importMusic } from '../src/cli/import-music.js';
import { flagsCli } from '../src/cli/flags.js';
import { resolveTrackFile } from '../src/modules/audio/musicLibrary.js';
import { storage, refLocation } from '../src/providers/storage.js';

/** Biblioteca livre: importa só licenças livres (CC0/domínio público/CC BY com crédito), guarda licença e origem, sem duplicar. */
let dir: string;
const manifest = (o: Record<string, unknown>) => { const f = join(dir, `m-${Math.random().toString(36).slice(2)}.json`); writeFileSync(f, JSON.stringify(o)); return f; };
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cc0-')); mkdirSync(join(dir, 'chill'));
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=12', '-c:a', 'libmp3lame', join(dir, 'chill', 'Faixa Livre.mp3')]);
  spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=2', '-c:a', 'libmp3lame', join(dir, 'chill', 'Curta.mp3')]);
  await boot(false);
});
afterAll(async () => { await shutdown(); rmSync(dir, { recursive: true, force: true }); });

describe('importação de música livre', () => {
  const base = { source: 'Teste: acervo CC0 de exemplo', license: 'CC0-1.0', attribution: 'Acervo de teste (CC0)', base: `https://exemplo.test/cc0-${Date.now()}/` };
  it('importa com licença, crédito e origem; segunda vez não duplica; arquivo curto demais é recusado', async () => {
    const f = manifest({ ...base, tracks: [{ title: 'Faixa Livre', mood: 'calm', genre: 'ambient', path: 'chill/Faixa Livre.mp3' }, { title: 'Curta', mood: 'calm', genre: 'ambient', path: 'chill/Curta.mp3' }] });
    const r1 = await importMusic(f, dir); expect(r1).toEqual({ imported: 1, skipped: 0, failed: ['Curta'] });
    const row = (await pool.query(`SELECT * FROM music_tracks WHERE source_url=$1`, [`${base.base}chill/Faixa%20Livre.mp3`])).rows[0];
    expect(row).toMatchObject({ title: 'Faixa Livre', license: 'CC0-1.0', attribution: 'Acervo de teste (CC0)', owner_user_id: null, source: 'library', duration: 12 });
    expect(row.file_url).toMatch(/^videos\/library\/cc0\/faixa-livre\.m4a$/);
    const ref = await resolveTrackFile(row); const loc = refLocation(ref); expect((await storage.get(loc.bucket, loc.key)).length).toBeGreaterThan(1000); // a faixa importada é encontrada pela montagem (antes: ENOENT)
    const r2 = await importMusic(f, dir); expect(r2.imported).toBe(0); expect(r2.skipped).toBe(1);
  });
  it('recusa licença não livre e CC BY sem crédito', async () => {
    await expect(importMusic(manifest({ ...base, license: 'All-Rights-Reserved', tracks: [{ title: 'X', mood: 'calm', genre: 'g', path: 'chill/Faixa Livre.mp3' }] }), dir)).rejects.toThrow();
    await expect(importMusic(manifest({ ...base, license: 'CC-BY-4.0', attribution: '', tracks: [{ title: 'X', mood: 'calm', genre: 'g', path: 'chill/Faixa Livre.mp3' }] }), dir)).rejects.toThrow(/attribution_required/);
  });
  it('CLI de flags: liga, lista e desliga; recusa flag inexistente', async () => {
    expect(await flagsCli(['on', 'ff_voice_studio'])).toBe('ligada: ff_voice_studio');
    expect(await flagsCli(['list'])).toMatch(/ON {2}ff_voice_studio \(100%\)/);
    expect(await flagsCli(['off', 'ff_voice_studio'])).toBe('desligada: ff_voice_studio');
    await expect(flagsCli(['on', 'ff_nao_existe'])).rejects.toThrow(/inexistente/);
  });
});
