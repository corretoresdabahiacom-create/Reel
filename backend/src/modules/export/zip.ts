import { crc32 } from 'node:zlib';

/**
 * ZIP mínimo (método STORE, sem compressão), só com `node:zlib.crc32` — sem biblioteca nova. Vídeo MP4 já é comprimido,
 * então comprimir de novo só gastaria CPU. Nomes em UTF-8 (bit 11). Limite: 4 GiB por arquivo/total (sem ZIP64).
 */
export interface ZipEntry { name: string; data: Buffer; date?: Date }
const MAX = 0xffffffff;

function dos(d: Date): { time: number; date: number } {
  const y = Math.max(1980, d.getUTCFullYear());
  return { time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2), date: ((y - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate() };
}
export function zipStore(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [], centrals: Buffer[] = []; let offset = 0;
  const seen = new Set<string>();
  for (const e of entries) {
    const name = e.name.replace(/\\/g, '/').replace(/^\/+/, '').split('/').filter((p) => p && p !== '..' && p !== '.').join('/'); // sem zip-slip
    if (!name || seen.has(name)) throw new Error(`nome inválido ou repetido no ZIP: ${e.name}`); seen.add(name);
    if (e.data.length > MAX || offset > MAX) throw new Error('ZIP acima de 4 GiB (ZIP64 não suportado)');
    const n = Buffer.from(name, 'utf8'); const crc = crc32(e.data) >>> 0; const { time, date } = dos(e.date ?? new Date());
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8);
    h.writeUInt16LE(time, 10); h.writeUInt16LE(date, 12); h.writeUInt32LE(crc, 14); h.writeUInt32LE(e.data.length, 18); h.writeUInt32LE(e.data.length, 22); h.writeUInt16LE(n.length, 26); h.writeUInt16LE(0, 28);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10);
    c.writeUInt16LE(time, 12); c.writeUInt16LE(date, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(e.data.length, 20); c.writeUInt32LE(e.data.length, 24); c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    locals.push(h, n, e.data); centrals.push(c, n); offset += h.length + n.length + e.data.length;
  }
  const cd = Buffer.concat(centrals); if (offset + cd.length > MAX) throw new Error('ZIP acima de 4 GiB (ZIP64 não suportado)');
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
