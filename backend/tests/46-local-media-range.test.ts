import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { boot, shutdown, http, signup, auth, type Session } from './helpers.js';
import { storage } from '../src/providers/storage.js';

/**
 * Instalação gratuita: os vídeos saem do disco pela rota /storage (driver local). Antes ela lia o arquivo inteiro na
 * memória e não aceitava Range — Safari/iPhone não tocam MP4 sem respostas parciais e o player não avançava/voltava.
 * Também: respostas da API com dados do usuário saem com Cache-Control: no-store.
 */
let s: Session; const data = Buffer.alloc(5000); for (let i = 0; i < data.length; i++) data[i] = i % 251;
let url = '';
beforeAll(async () => { await boot(false); s = await signup(); await storage.put('videos', 'projects/range-test/final.mp4', data, 'video/mp4'); url = await storage.signedGetUrl('videos', 'projects/range-test/final.mp4', 600); });
afterAll(async () => { await shutdown(); });
const path = () => { const u = new URL(url); return u.pathname + u.search; };

describe('mídia local com Range', () => {
  it('sem Range: 200 completo, em fluxo, com Accept-Ranges e Content-Length', async () => {
    const r = await http.get(path()).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(r.status).toBe(200); expect(r.headers['accept-ranges']).toBe('bytes'); expect(r.headers['content-length']).toBe('5000'); expect(r.headers['content-type']).toBe('video/mp4');
    expect((r.body as Buffer).equals(data)).toBe(true);
  });
  it('bytes=100-199 → 206 com os bytes certos; aberto (4900-) e sufixo (-50); fora do arquivo → 416', async () => {
    const get = (range: string) => http.get(path()).set('range', range).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    const a = await get('bytes=100-199'); expect(a.status).toBe(206); expect(a.headers['content-range']).toBe('bytes 100-199/5000'); expect((a.body as Buffer).equals(data.subarray(100, 200))).toBe(true);
    const b = await get('bytes=4900-'); expect(b.status).toBe(206); expect(b.headers['content-range']).toBe('bytes 4900-4999/5000'); expect((b.body as Buffer).length).toBe(100);
    const c = await get('bytes=-50'); expect(c.status).toBe(206); expect((c.body as Buffer).equals(data.subarray(4950))).toBe(true);
    const d = await get('bytes=6000-7000'); expect(d.status).toBe(416); expect(d.headers['content-range']).toBe('bytes */5000');
  });
  it('tipo de mídia pela extensão (áudio m4a/mp3/webm): o Safari não toca áudio servido como octet-stream', async () => {
    for (const [ext, ct] of [['m4a', 'audio/mp4'], ['mp3', 'audio/mpeg'], ['webm', 'video/webm'], ['wav', 'audio/wav'], ['bin', 'application/octet-stream']]) {
      await storage.put('uploads', `ct-test/a.${ext}`, Buffer.from('x'.repeat(64)), 'application/octet-stream');
      const u = new URL(await storage.signedGetUrl('uploads', `ct-test/a.${ext}`, 600)); const r = await http.get(u.pathname + u.search);
      expect(r.status).toBe(200); expect(String(r.headers['content-type'])).toContain(ct);
    }
  });
  it('assinatura adulterada continua 403; caminho com ".." é recusado no driver', async () => {
    expect((await http.get(path().replace(/sig=([0-9a-f])/, (_, x: string) => `sig=${x === '0' ? '1' : '0'}`))).status).toBe(403);
    await expect(storage.fileOf!('videos', '../../../etc/passwd')).rejects.toThrow(/key inválida/);
    await expect(storage.fileOf!('videos', '../nexus-videos-outro/x')).rejects.toThrow(/key inválida/);
  });
  it('API com dados do usuário: Cache-Control no-store; mídia assinada: private, max-age curto', async () => {
    const me = await http.get('/api/v1/users/me').set(auth(s)); expect(me.headers['cache-control']).toBe('no-store');
    const r = await http.get(path()).set('range', 'bytes=0-9'); expect(r.headers['cache-control']).toBe('private, max-age=60');
  });
});
