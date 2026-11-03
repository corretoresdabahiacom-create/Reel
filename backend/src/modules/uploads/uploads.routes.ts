import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { LIMITS, rateLimit } from '../../middlewares/rateLimit.js';
import { safeFileName, storage, sniffMime, refLocation, signRef } from '../../providers/storage.js';
import { parse } from '../../utils/validate.js';
import { badRequest, notFound, unprocessable } from '../../utils/errors.js';
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';

const MEDIA_TYPES: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', vtt: 'text/vtt', json: 'application/json', zip: 'application/zip',
  wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg', ogg: 'audio/ogg', opus: 'audio/ogg' };
const MAX_BYTES = 10 * 1024 * 1024; const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
/** Stub de antivírus (ClamAV): em produção chamar clamd via INSTREAM. Aqui só bloqueia a assinatura de teste EICAR. */
export async function scan(buf: Buffer): Promise<void> { if (buf.includes(Buffer.from('EICAR-STANDARD-ANTIVIRUS-TEST-FILE'))) throw unprocessable('Arquivo bloqueado pelo antivírus'); }
/**
 * P0-1 etapa 4 (achado no navegador real): magic bytes certos não garantem imagem legível. Um PNG corrompido passava e
 * travava o worker de geração (ffmpeg preso até o timeout, 2 min × tentativas). Agora a imagem precisa decodificar (ffprobe, 5 s).
 */
async function assertDecodes(buf: Buffer): Promise<void> {
  const ok = await new Promise<boolean>((resolve) => {
    const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', '-i', 'pipe:0'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = ''; const t = setTimeout(() => { p.kill('SIGKILL'); resolve(false); }, 5000);
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; }); p.on('error', () => { clearTimeout(t); resolve(false); });
    p.on('close', (c) => { clearTimeout(t); resolve(c === 0 && !err.trim() && /^\d+,\d+/.test(out.trim())); });
    p.stdin.on('error', () => undefined); p.stdin.end(buf);
  });
  if (!ok) throw unprocessable('Imagem corrompida ou ilegível: envie outra foto');
}
async function accept(userId: string, buf: Buffer): Promise<{ ref: string; mime: string; bytes: number }> {
  if (buf.length === 0) throw badRequest('Arquivo vazio'); if (buf.length > MAX_BYTES) throw new (await import('../../utils/errors.js')).AppError(413, 'payload_too_large', 'Máximo de 10 MB por foto');
  const mime = sniffMime(buf); if (!mime || !EXT[mime]) throw unprocessable('Tipo de arquivo não permitido (somente JPEG, PNG ou WebP — verificado pelo conteúdo)');
  await scan(buf); await assertDecodes(buf); const key = `${userId}/${randomUUID()}.${EXT[mime]}`; await storage.put('uploads', key, buf, mime); return { ref: `uploads/${key}`, mime, bytes: buf.length };
}
export async function uploadsRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'], { parseAs: 'buffer', bodyLimit: MAX_BYTES + 1024 }, (_r, body, done) => done(null, body));
  const auth = { preHandler: [authenticate(), requireJwt, rateLimit(LIMITS.write)] };
  /** Upload direto (corpo binário). O servidor valida o tipo REAL por magic bytes, tamanho e antivírus. */
  app.put('/uploads/photo', auth, async (req, reply) => { const r = await accept(uid(req), req.body as Buffer); return reply.status(201).send({ ...r, url: await signRef(r.ref) }); });
  /** Fluxo S3: 1) presign → cliente envia direto ao bucket; 2) confirm → servidor lê os primeiros bytes e valida (apaga se inválido). */
  app.post('/uploads/presign', auth, async (req) => { const b = parse(z.object({ contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']) }), req.body); const key = `${uid(req)}/${randomUUID()}.${EXT[b.contentType]}`; return { ref: `uploads/${key}`, uploadUrl: await storage.signedPutUrl('uploads', key, b.contentType), expiresInSec: 900 }; });
  app.post('/uploads/confirm', auth, async (req) => {
    const { ref } = parse(z.object({ ref: z.string().startsWith('uploads/') }), req.body); const l = refLocation(ref); if (!l.key.startsWith(uid(req) + '/')) throw notFound();
    if (!(await storage.exists('uploads', l.key))) throw notFound('Arquivo não enviado'); const buf = await storage.get('uploads', l.key);
    if (buf.length > MAX_BYTES || !sniffMime(buf)) { await storage.delete('uploads', l.key); throw unprocessable('Arquivo inválido'); } await scan(buf).catch(async (e) => { await storage.delete('uploads', l.key); throw e; });
    return { ref, mime: sniffMime(buf), bytes: buf.length, url: await signRef(ref) };
  });
  // Servir arquivos do driver local (dev/test) com URL assinada por HMAC
  app.get('/storage/:bucket/*', async (req, reply) => {
    const { bucket, '*': key } = req.params as { bucket: 'uploads' | 'videos' | 'exports' | 'archive'; '*': string }; const q = req.query as { exp?: string; sig?: string; dl?: string };
    const v = storage.verify; if (!v || !q.exp || !q.sig || !v.call(storage, 'GET', bucket, key, Number(q.exp), q.sig)) return reply.status(403).send({ code: 'forbidden', message: 'URL inválida ou expirada', traceId: req.traceId });
    const f = storage.fileOf ? await storage.fileOf.call(storage, bucket, key).catch(() => null) : null; if (!f) throw notFound();
    // tipo pela extensão: o Safari/iPhone não toca áudio servido como octet-stream (achado no teste do estúdio de voz)
    const ct = MEDIA_TYPES[(/\.([a-z0-9]+)$/i.exec(key)?.[1] ?? '').toLowerCase()] ?? 'application/octet-stream';
    if (q.dl) reply.header('content-disposition', `attachment; filename="${safeFileName(q.dl)}"`);
    // Range (RFC 9110): Safari/iPhone só tocam MP4 com respostas parciais; o player avança/volta sem baixar tudo; envio em fluxo
    reply.header('accept-ranges', 'bytes').header('cache-control', 'private, max-age=60').type(ct);
    const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ''));
    if (m && (m[1] || m[2])) {
      const start = m[1] ? Number(m[1]) : Math.max(0, f.size - Number(m[2])); let end = m[1] && m[2] ? Number(m[2]) : f.size - 1;
      end = Math.min(end, f.size - 1);
      if (start > end || start >= f.size) return reply.status(416).header('content-range', `bytes */${f.size}`).send();
      return reply.status(206).header('content-range', `bytes ${start}-${end}/${f.size}`).header('content-length', String(end - start + 1)).send(createReadStream(f.path, { start, end }));
    }
    return reply.header('content-length', String(f.size)).send(createReadStream(f.path));
  });
  app.put('/storage/:bucket/*', async (req, reply) => {
    const { bucket, '*': key } = req.params as { bucket: 'uploads' | 'videos' | 'exports'; '*': string }; const q = req.query as { exp?: string; sig?: string };
    const v = storage.verify; if (!v || !q.exp || !q.sig || !v.call(storage, 'PUT', bucket, key, Number(q.exp), q.sig)) return reply.status(403).send({ code: 'forbidden', message: 'URL inválida ou expirada', traceId: req.traceId });
    await storage.put(bucket, key, req.body as Buffer, 'application/octet-stream'); return reply.status(200).send();
  });
}
