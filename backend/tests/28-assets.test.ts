import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { boot, shutdown, http, signup, auth, waitFor, pool, type Session } from './helpers.js';
import { asSystem } from '../src/db/pool.js';
import { env } from '../src/config/env.js';
import { invalidateFlags } from '../src/modules/flags.service.js';
import { storage, refLocation } from '../src/providers/storage.js';
import { ffmpeg, withTmp } from '../src/utils/ffmpeg.js';
import { CAR_PROFILES } from '../src/config/carProfiles.js';
import { DEVICE_PROFILES } from '../src/config/deviceProfiles.js';
import { cacheKeyFor, normalize, derivedAssetsService } from '../src/modules/assets/derivedAssetsService.js';
import { complianceService } from '../src/modules/compliance/compliance.service.js';

/**
 * Módulo 6 — Assets derivados (FFmpeg local, Postgres/Redis reais).
 * Checkpoint 6: perfis automotivos saem em H.264 Baseline (ffprobe) e o cache é isolado por usuário (teste explícito).
 */
let a: Session; let b: Session;
const V: Record<string, { id: string; key: string; hash: string }> = {};
const setFlag = async (on: boolean) => { await asSystem((db) => db.query(`UPDATE feature_flags SET enabled=$1, rollout_percent=$2 WHERE key='ff_assets'`, [on, on ? 100 : 0])); await invalidateFlags(); };
const idem = () => ({ 'idempotency-key': `as-${randomUUID()}` });
const sha = (x: Buffer) => createHash('sha256').update(x).digest('hex');
const pathOf = (url: string) => url.replace(env.PUBLIC_API_URL, '');
const download = async (url: string) => (await http.get(pathOf(url)).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); })).body as Buffer;
const probeJson = (f: string) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type,profile,level,width,height,pix_fmt,has_b_frames,sample_rate,channels:format=duration,format_name:format_tags', '-of', 'json', f]).toString()) as
  { streams: Array<Record<string, string | number>>; format: { duration: string; format_name: string; tags?: Record<string, string> } };
const decodes = (f: string) => { execFileSync('ffmpeg', ['-v', 'error', '-xerror', '-i', f, '-f', 'null', '-']); return true; };
const py = (code: string, ...args: string[]) => JSON.parse(execFileSync('python3', ['-I', '-c', code, ...args]).toString());
async function source(kind: 'busy' | 'green'): Promise<Buffer> {
  return withTmp(async (d) => {
    const o = join(d, 'v.mp4');
    if (kind === 'busy') await ffmpeg(['-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=30:d=12', '-f', 'lavfi', '-i', 'sine=frequency=440:d=12', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest',
      '-metadata', 'location=+48.8584+002.2945/', '-metadata', 'title=Video da Maria', o], 120_000);
    else await ffmpeg(['-f', 'lavfi', '-i', 'color=c=0x22cc44:s=360x640:r=30:d=5', '-f', 'lavfi', '-i', 'testsrc=s=140x140:r=30:d=5', '-filter_complex', '[0:v][1:v]overlay=x=110+40*sin(t*3):y=250:shortest=1', '-c:v', 'libx264', '-preset', 'ultrafast', o], 120_000);
    return readFile(o);
  });
}
async function project(s: Session, name: string, buf: Buffer) {
  const id = (await asSystem((db) => db.query(`INSERT INTO projects (user_id, title, script, status, duration_sec) VALUES ($1,$2,'Roteiro.','ready',12) RETURNING id`, [s.id, name]))).rows[0].id as string;
  const key = `projects/${id}/final.mp4`; await storage.put('videos', key, buf, 'video/mp4'); await asSystem((db) => db.query('UPDATE projects SET final_video_url=$2 WHERE id=$1', [id, key]));
  V[name] = { id, key, hash: sha(buf) }; return id;
}
const ask = (s: Session, pid: string, body: object, key = idem()) => http.post(`/api/v1/projects/${pid}/assets`).set(auth(s)).set(key).send(body);
async function make(s: Session, pid: string, body: object) {
  const r = await ask(s, pid, body); expect(r.status).toBe(202);
  const st = await waitFor(async () => { const x = await http.get(`/api/v1/assets/${r.body.assetId}`).set(auth(s)); return ['done', 'failed'].includes(x.body.status) ? x.body : undefined; }, 300_000, 150);
  expect(st.status, JSON.stringify(st)).toBe('done'); return st;
}
const fileTo = async (dir: string, name: string, url: string) => { const f = join(dir, name); await writeFile(f, await download(url)); return f; };

beforeAll(async () => {
  await boot(); a = await signup({ plan: 'pro', credits: 100 }); b = await signup({ plan: 'pro', credits: 100 });
  const busy = await source('busy'); await project(a, 'Bike Aro 29 da Maria', busy); await project(a, 'verde', await source('green'));
  await project(b, 'copia-identica', busy); // MESMOS bytes do vídeo de A: base do teste de isolamento do cache
}, 180_000);
afterAll(async () => { await setFlag(false); await shutdown(); });

describe('Módulo 6 — unidade', () => {
  it('chave do cache muda com usuário, projeto, conteúdo e configuração', () => {
    const c = normalize({ type: 'gif' }); const k = cacheKeyFor('u1', 'p1', 'h1', c);
    expect(k).toMatch(/^[0-9a-f]{64}$/); expect(cacheKeyFor('u1', 'p1', 'h1', normalize({ type: 'gif' }))).toBe(k);
    for (const other of [cacheKeyFor('u2', 'p1', 'h1', c), cacheKeyFor('u1', 'p2', 'h1', c), cacheKeyFor('u1', 'p1', 'h2', c), cacheKeyFor('u1', 'p1', 'h1', normalize({ type: 'gif', durationSec: 5 }))]) expect(other).not.toBe(k);
  });
  it('validação de tipo × perfil × formato e limites (GIF ≤10 s, sticker ≤6 s)', () => {
    expect(normalize({ type: 'gif', durationSec: 60 }).durationSec).toBe(10); expect(normalize({ type: 'sticker', durationSec: 60 }).durationSec).toBe(6);
    expect(() => normalize({ type: 'wallpaper' })).toThrow(); expect(() => normalize({ type: 'wallpaper', profile: 'volkswagen' })).toThrow();
    expect(() => normalize({ type: 'car', profile: 'pc_4k' })).toThrow(); expect(() => normalize({ type: 'wallpaper', profile: 'android_fhd', format: 'webm' })).toThrow();
    expect(normalize({ type: 'wallpaper', profile: 'pc_4k', format: 'webm' })).toMatchObject({ profile: 'pc_4k', format: 'webm' });
    expect(normalize({ type: 'wallpaper', profile: 'iphone_live' })).toMatchObject({ format: 'live_zip', durationSec: 3 });
  });
  it('perfis automotivos: Baseline, dimensões pares e dentro do nível 3.1 (≤3600 macroblocos/quadro, ≤108000/s)', () => {
    expect(CAR_PROFILES.length).toBeGreaterThanOrEqual(2);
    for (const p of CAR_PROFILES) {
      const mbs = Math.ceil(p.width / 16) * Math.ceil(p.height / 16);
      expect([p.width % 2, p.height % 2]).toEqual([0, 0]); expect(p.h264Level).toBe('3.1'); expect(mbs).toBeLessThanOrEqual(3600); expect(mbs * p.fps).toBeLessThanOrEqual(108000); expect(p.verified).toBe(false);
    }
    for (const p of DEVICE_PROFILES) expect([p.width % 2, p.height % 2]).toEqual([0, 0]);
  });
});

describe('Módulo 6 — flag desligada', () => {
  it('rotas 404, projeto sem campo novo, nada gravado; tabela derived_assets com RLS', async () => {
    await setFlag(false);
    const before = (await http.get(`/api/v1/projects/${V['verde']!.id}`).set(auth(a))).body;
    for (const c of [() => http.get('/api/v1/assets/profiles'), () => http.get('/api/v1/assets'), () => http.get(`/api/v1/assets/${randomUUID()}`), () => http.post(`/api/v1/projects/${V['verde']!.id}/assets`).set(idem()).send({ type: 'gif' })]) {
      const r = await c().set(auth(a)); expect(r.status).toBe(404); expect(r.body.code).toBe('not_found');
    }
    const after = (await http.get(`/api/v1/projects/${V['verde']!.id}`).set(auth(a))).body; const strip = (o: { finalVideoUrl?: string }) => ({ ...o, finalVideoUrl: o.finalVideoUrl?.split('?')[0] });
    expect(strip(after)).toEqual(strip(before)); expect((await pool.query('SELECT count(*)::int n FROM derived_assets WHERE user_id = ANY($1)', [[a.id, b.id]])).rows[0].n).toBe(0); // só os usuários deste arquivo (outras suítes compartilham o banco)
    expect((await pool.query(`SELECT relrowsecurity FROM pg_class WHERE relname='derived_assets'`)).rows[0].relrowsecurity).toBe(true);
    expect((await http.get('/api/v1/projects/assets').set(auth(a))).status).toBe(400); // "assets" como id é só id inválido
  });
});

describe('Módulo 6 — com ff_assets LIGADA', () => {
  beforeAll(async () => { await setFlag(true); });
  const assets: Record<string, { assetId: string; url: string; fileName: string; cacheHit: boolean; info: Record<string, unknown> }> = {};

  it('GIF: loop perfeito, ≤10 s, ≤10 MB, abre e decodifica; nome padronizado sem título; sem metadados da origem', async () => {
    const st = assets.gif = await make(a, V['Bike Aro 29 da Maria']!.id, { type: 'gif', durationSec: 10 });
    expect(st.fileName).toMatch(/^nexusreel-gif-[0-9a-f]{8}\.gif$/); expect(st.fileName).not.toMatch(/Maria|Bike/); expect(st.cacheHit).toBe(false);
    await withTmp(async (d) => {
      const f = await fileTo(d, 'x.gif', st.url); const j = probeJson(f);
      expect((await readFile(f)).length).toBeLessThanOrEqual(10 * 1024 * 1024); expect(Number(j.format.duration)).toBeLessThanOrEqual(10.05); expect(j.streams[0]!.codec_name).toBe('gif'); expect(decodes(f)).toBe(true);
      const seam = py(`import sys,json
from PIL import Image, ImageChops, ImageStat
im=Image.open(sys.argv[1]); n=im.n_frames
def fr(i): im.seek(i); return im.convert('RGB')
d=lambda x,y: sum(ImageStat.Stat(ImageChops.difference(x,y)).mean)/3
c=[d(fr(i),fr(i+1)) for i in range(20,40)]
print(json.dumps({'n':n,'seam':d(fr(n-1),fr(0)),'avg':sum(c)/len(c),'loop':im.info.get('loop')}))`, f);
      expect(seam.loop).toBe(0); expect(seam.seam).toBeLessThanOrEqual(seam.avg * 1.25); // emenda do loop ≈ diferença entre quadros vizinhos (sem "pulo")
      expect(JSON.stringify(j.format.tags ?? {})).not.toMatch(/location|Maria|48\.8584/);
    });
  });

  it('sticker: WebP animado 512×512 com fundo transparente, ≤500 KB', async () => {
    const st = await make(a, V.verde!.id, { type: 'sticker', durationSec: 3 });
    expect(st.fileName).toMatch(/^nexusreel-sticker-[0-9a-f]{8}\.webp$/); expect(st.info.transparent).toBe(true);
    await withTmp(async (d) => {
      const f = await fileTo(d, 'x.webp', st.url); expect((await readFile(f)).length).toBeLessThanOrEqual(500 * 1024);
      const w = py(`import sys,json
from PIL import Image
im=Image.open(sys.argv[1]); n=im.n_frames; im.seek(0); f=im.convert('RGBA')
print(json.dumps({'fmt':im.format,'n':n,'size':list(im.size),'corner':f.getpixel((3,3))[3],'center':f.getpixel((256,256))[3],'loop':im.info.get('loop')}))`, f);
      expect(w).toMatchObject({ fmt: 'WEBP', size: [512, 512], corner: 0, center: 255, loop: 0 }); expect(w.n).toBeGreaterThan(5);
    });
  });

  it('wallpaper iPhone (Live Photo): MOV QuickTime + JPEG + live.json com o MESMO identificador', async () => {
    const st = await make(a, V['Bike Aro 29 da Maria']!.id, { type: 'wallpaper', profile: 'iphone_live' });
    expect(st.fileName).toMatch(/^nexusreel-wallpaper-iphone-live-[0-9a-f]{8}\.zip$/);
    await withTmp(async (d) => {
      const z = await fileTo(d, 'x.zip', st.url); expect(execFileSync('unzip', ['-t', z]).toString()).toMatch(/No errors/); execFileSync('unzip', ['-q', z, '-d', join(d, 'o')]);
      const names = execFileSync('unzip', ['-Z1', z]).toString().trim().split('\n').sort(); expect(names).toHaveLength(3); expect(names).toContain('live.json');
      const meta = JSON.parse(await readFile(join(d, 'o', 'live.json'), 'utf8')); const mov = join(d, 'o', names.find((n) => n.endsWith('.mov'))!), jpg = join(d, 'o', names.find((n) => n.endsWith('.jpg'))!);
      const j = probeJson(mov); expect(j.format.tags?.['com.apple.quicktime.content.identifier']).toBe(meta.contentIdentifier); expect(j.format.tags?.major_brand?.trim()).toBe('qt');
      expect(Number(j.format.duration)).toBeCloseTo(3, 0); expect(j.streams.find((x) => x.codec_type === 'video')).toMatchObject({ codec_name: 'h264', width: 1080, height: 1920 }); expect(decodes(mov)).toBe(true);
      expect(probeJson(jpg).streams[0]).toMatchObject({ width: 1080, height: 1920 });
    });
  });

  it('wallpaper Android (MP4 1080×2400) e PC (MP4 1080p, WebM VP9 4K): loop, sem áudio, decodificam', async () => {
    const cases: Array<[object, string, number, number]> = [[{ type: 'wallpaper', profile: 'android_fhd', durationSec: 5 }, 'h264', 1080, 2400], [{ type: 'wallpaper', profile: 'pc_1080', durationSec: 4 }, 'h264', 1920, 1080], [{ type: 'wallpaper', profile: 'pc_4k', format: 'webm', durationSec: 3 }, 'vp9', 3840, 2160]];
    for (const [body, codec, w, h] of cases) {
      const st = await make(a, V['Bike Aro 29 da Maria']!.id, body);
      await withTmp(async (d) => {
        const f = await fileTo(d, st.fileName, st.url); const j = probeJson(f);
        expect(j.streams).toHaveLength(1); expect(j.streams[0]).toMatchObject({ codec_name: codec, width: w, height: h, pix_fmt: 'yuv420p' }); expect(decodes(f)).toBe(true);
      });
    }
  });

  it('multimídia automotiva (Volkswagen e Toyota): H.264 Constrained Baseline, sem B-frames, nível ≤3.1, AAC-LC estéreo', async () => {
    for (const [profile, w, h] of [['volkswagen', 1280, 720], ['toyota', 800, 480]] as const) {
      const st = await make(a, V['Bike Aro 29 da Maria']!.id, { type: 'car', profile });
      expect(st.info).toMatchObject({ h264: 'Baseline@3.1', audio: 'AAC-LC' });
      await withTmp(async (d) => {
        const f = await fileTo(d, 'x.mp4', st.url); const j = probeJson(f); const v = j.streams.find((x) => x.codec_type === 'video')!, au = j.streams.find((x) => x.codec_type === 'audio')!;
        expect(v).toMatchObject({ codec_name: 'h264', width: w, height: h, pix_fmt: 'yuv420p', has_b_frames: 0 }); expect(['Baseline', 'Constrained Baseline']).toContain(v.profile); expect(Number(v.level)).toBeLessThanOrEqual(31);
        expect(au).toMatchObject({ codec_name: 'aac', profile: 'LC', channels: 2, sample_rate: '44100' }); expect(j.format.format_name).toContain('mp4');
        expect(decodes(f)).toBe(true);
      });
    }
  });

  it('screensaver Windows: pacote para o protetor de tela "Fotos" (12 JPEG 1920×1080 + vídeo em loop + LEIA-ME), sem executável', async () => {
    const st = await make(a, V['Bike Aro 29 da Maria']!.id, { type: 'screensaver', profile: 'windows', durationSec: 6 });
    await withTmp(async (d) => {
      const z = await fileTo(d, 'x.zip', st.url); const names = execFileSync('unzip', ['-Z1', z]).toString().trim().split('\n');
      expect(names.filter((n) => /^NexusReel\/nexusreel-\d{2}\.jpg$/.test(n))).toHaveLength(12); expect(names).toContain('NexusReel/nexusreel-loop.mp4'); expect(names).toContain('LEIA-ME.txt');
      expect(names.some((n) => /\.(scr|exe|saver|app)$/i.test(n))).toBe(false);
      execFileSync('unzip', ['-q', z, '-d', join(d, 'o')]); expect(probeJson(join(d, 'o', 'NexusReel', 'nexusreel-01.jpg')).streams[0]).toMatchObject({ width: 1920, height: 1080 });
      expect(await readFile(join(d, 'o', 'LEIA-ME.txt'), 'utf8')).toMatch(/Proteção de tela → Fotos/);
    });
  });

  it('cache: o mesmo pedido do MESMO usuário reaproveita o arquivo (sem converter de novo)', async () => {
    const again = await make(a, V['Bike Aro 29 da Maria']!.id, { type: 'gif', durationSec: 10 });
    expect(again.cacheHit).toBe(true); expect(again.assetId).not.toBe(assets.gif!.assetId); expect(sha(await download(again.url))).toBe(sha(await download(assets.gif!.url)));
    const rows = (await pool.query(`SELECT file_url, cache_key FROM derived_assets WHERE id = ANY($1)`, [[again.assetId, assets.gif!.assetId]])).rows;
    expect(rows[0].file_url).toBe(rows[1].file_url); expect(rows[0].cache_key).toBe(rows[1].cache_key);
    expect((await pool.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='asset_gif_cache'`, [a.id])).rows[0].n).toBe(1);
  });

  it('ISOLAMENTO DO CACHE: B com o MESMO vídeo e a MESMA configuração não recebe o arquivo de A, nem forçando a mesma chave', async () => {
    const aRow = (await pool.query(`SELECT * FROM derived_assets WHERE id=$1`, [assets.gif!.assetId])).rows[0];
    expect(V['copia-identica']!.hash).toBe(V['Bike Aro 29 da Maria']!.hash); // bytes idênticos
    const bSt = await make(b, V['copia-identica']!.id, { type: 'gif', durationSec: 10 });
    const bRow = (await pool.query(`SELECT * FROM derived_assets WHERE id=$1`, [bSt.assetId])).rows[0];
    expect(bSt.cacheHit).toBe(false); expect(bRow.cache_key).not.toBe(aRow.cache_key);
    expect(bRow.file_url).toMatch(new RegExp(`^derived/${b.id}/`)); expect(aRow.file_url).toMatch(new RegExp(`^derived/${a.id}/`)); expect(bRow.file_url).not.toBe(aRow.file_url);
    // ataque simulado: a linha de A passa a ter EXATAMENTE a chave que B calcula. O filtro por user_id (+ RLS) ainda impede o reuso.
    await pool.query(`UPDATE derived_assets SET cache_key=$2 WHERE id=$1`, [aRow.id, bRow.cache_key]);
    try {
      await pool.query(`DELETE FROM derived_assets WHERE id=$1`, [bRow.id]); // B não tem mais nada no cache
      const b2 = await make(b, V['copia-identica']!.id, { type: 'gif', durationSec: 10 });
      const b2Row = (await pool.query(`SELECT * FROM derived_assets WHERE id=$1`, [b2.assetId])).rows[0];
      expect(b2.cacheHit).toBe(false); expect(b2Row.file_url).toMatch(new RegExp(`^derived/${b.id}/`));
    } finally { await pool.query(`UPDATE derived_assets SET cache_key=$2 WHERE id=$1`, [aRow.id, aRow.cache_key]); }
    // acesso direto: B não lê, não lista e não gera a partir de nada de A
    expect((await http.get(`/api/v1/assets/${assets.gif!.assetId}`).set(auth(b))).status).toBe(404);
    expect((await http.get('/api/v1/assets').set(auth(b))).body.items.every((x: { projectId: string }) => x.projectId === V['copia-identica']!.id)).toBe(true);
    const n0 = (await pool.query('SELECT count(*)::int n FROM derived_assets')).rows[0].n;
    expect((await ask(b, V['Bike Aro 29 da Maria']!.id, { type: 'gif' })).status).toBe(404); expect((await pool.query('SELECT count(*)::int n FROM derived_assets')).rows[0].n).toBe(n0);
  });

  it('origem intacta; Idempotency-Key obrigatória; perfil inválido → 422 claro', async () => {
    const l = refLocation(V['Bike Aro 29 da Maria']!.key); expect(sha(await storage.get(l.bucket, l.key))).toBe(V['Bike Aro 29 da Maria']!.hash);
    expect((await http.post(`/api/v1/projects/${V.verde!.id}/assets`).set(auth(a)).send({ type: 'gif' })).status).toBe(400);
    const k = idem(); const r1 = await ask(a, V.verde!.id, { type: 'gif', durationSec: 2 }, k); const r2 = await ask(a, V.verde!.id, { type: 'gif', durationSec: 2 }, k);
    expect(r2.headers['idempotent-replay']).toBe('true'); expect(r2.body.assetId).toBe(r1.body.assetId);
    const bad = await ask(a, V.verde!.id, { type: 'car', profile: 'ferrari' }); expect(bad.status).toBe(422); expect(bad.body.code).toBe('invalid_profile'); expect(bad.body.details.allowed).toContain('volkswagen');
    const p = await http.get('/api/v1/assets/profiles').set(auth(a)); expect(p.body.car.every((x: { verified: boolean }) => x.verified === false)).toBe(true);
  });

  it('retenção: vencido apaga o arquivo — mas não se outro asset válido do mesmo usuário ainda o usa (cache)', async () => {
    const [x, y] = (await pool.query(`SELECT id, file_url FROM derived_assets WHERE user_id=$1 AND type='gif' AND status='done' AND file_url LIKE 'derived/%' ORDER BY created_at LIMIT 2`, [a.id])).rows;
    expect(x.file_url).toBe(y.file_url);
    await pool.query(`UPDATE derived_assets SET expires_at = now() - interval '1 day' WHERE id=$1`, [x.id]);
    expect(await derivedAssetsService.purgeExpired()).toEqual({ expired: 1, filesDeleted: 0 }); expect(await storage.exists('videos', y.file_url)).toBe(true);
    await pool.query(`UPDATE derived_assets SET expires_at = now() - interval '1 day' WHERE id=$1`, [y.id]);
    expect(await derivedAssetsService.purgeExpired()).toEqual({ expired: 1, filesDeleted: 1 }); expect(await storage.exists('videos', y.file_url)).toBe(false);
    expect((await http.get(`/api/v1/assets/${y.id}`).set(auth(a))).body).toMatchObject({ status: 'expired', url: null });
  });

  it('LGPD: exportação lista os assets; exclusão da conta apaga derived/<usuário>/', async () => {
    const eid = (await asSystem((db) => db.query(`INSERT INTO data_export_requests (user_id) VALUES ($1) RETURNING id`, [b.id]))).rows[0].id as string;
    await complianceService.buildExport(eid, b.id); const data = JSON.parse((await storage.get('exports', `${b.id}/${eid}.json`)).toString());
    expect(data.derivedAssets.length).toBeGreaterThan(0); expect(JSON.stringify(data.derivedAssets)).not.toMatch(/cache_key|file_url/);
    const f = (await pool.query(`SELECT file_url FROM derived_assets WHERE user_id=$1 AND file_url IS NOT NULL LIMIT 1`, [b.id])).rows[0].file_url;
    await complianceService.hardDelete(b.id);
    expect(await storage.exists('videos', f)).toBe(false); expect((await pool.query('SELECT count(*)::int n FROM derived_assets WHERE user_id=$1', [b.id])).rows[0].n).toBe(0);
  });
});
