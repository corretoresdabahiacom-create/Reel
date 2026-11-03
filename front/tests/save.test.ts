import test from 'node:test';
import assert from 'node:assert/strict';
import { saveToGallery, saveToFolder, saveManyToFolder, canPickFolder, type WinLike, type SaveTarget } from '../src/services/save/saveClient';

/** Módulo 5 — cliente de salvamento: caminhos nativos e da File System Access API, com quedas seguras. */
const T: SaveTarget = { url: 'https://api.example/api/v1/storage/videos/x.mp4?exp=1&sig=s', fileName: 'Bike Aro 29.mp4', mime: 'video/mp4' };
const doc = () => { const clicks: { href: string; download: string }[] = []; return { clicks, document: { body: { appendChild: () => undefined }, createElement: () => { const a = { href: '', download: '', rel: '', click() { clicks.push({ href: a.href, download: a.download }); }, remove() {} }; return a; } } }; };
const bytes = new TextEncoder().encode('mp4-bytes');
const okFetch = (async () => new Response(bytes)) as typeof fetch;
function sink() { const got: Uint8Array[] = []; let closed = false; const ws = new WritableStream<Uint8Array>({ write(c) { got.push(c); }, close() { closed = true; } }) as WritableStream & { write: (d: unknown) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> };
  return { got, closed: () => closed, ws }; }

test('iOS: baixa para o cache e abre a folha do sistema (Salvar vídeo → Fotos / Arquivos → iCloud)', async () => {
  const calls: unknown[] = [];
  const r = await saveToGallery(T, { platform: 'ios', fs: { downloadFile: async (o) => { calls.push(o); return { path: 'file:///cache/NexusReel/Bike Aro 29.mp4' }; } }, share: { share: async (o) => { calls.push(o); return {}; } } });
  assert.equal(r.method, 'share_sheet');
  assert.deepEqual(calls[0], { url: T.url, path: 'NexusReel/Bike Aro 29.mp4', directory: 'CACHE', recursive: true });
  assert.deepEqual((calls[1] as { files: string[] }).files, ['file:///cache/NexusReel/Bike Aro 29.mp4']);
  const c = await saveToGallery(T, { platform: 'ios', fs: { downloadFile: async () => ({ path: 'p' }) }, share: { share: async () => { throw new Error('Share canceled'); } } });
  assert.equal(c.method, 'cancelled');
});
test('Android: grava em Documents/NexusReel (público, indexado)', async () => {
  let o: { directory?: string; path?: string } = {};
  const r = await saveToGallery(T, { platform: 'android', fs: { downloadFile: async (x) => { o = x; return { path: '/storage/emulated/0/Documents/NexusReel/Bike Aro 29.mp4' }; } }, share: { share: async () => ({}) } });
  assert.equal(r.method, 'documents_folder'); assert.equal(o.directory, 'DOCUMENTS'); assert.equal(o.path, 'NexusReel/Bike Aro 29.mp4');
});
test('navegador com File System Access: escolhe pasta/nome e grava em stream', async () => {
  const s = sink(); let opts: { suggestedName?: string } = {};
  const win: WinLike = { showSaveFilePicker: async (o) => { opts = o; return { createWritable: async () => s.ws }; } };
  const r = await saveToFolder(T, { platform: 'web', win, fetch: okFetch });
  assert.equal(r.method, 'file_picker'); assert.equal(opts.suggestedName, 'Bike Aro 29.mp4'); assert.equal(Buffer.concat(s.got).toString(), 'mp4-bytes'); assert.equal(s.closed(), true);
  assert.equal(canPickFolder(win), true);
});
test('sem a API (Firefox/Safari), com CORS bloqueado ou usuário cancelando: queda segura', async () => {
  const d1 = doc(); assert.equal((await saveToFolder(T, { platform: 'web', win: d1 })).method, 'download_link'); assert.deepEqual(d1.clicks, [{ href: T.url, download: T.fileName }]);
  assert.equal(canPickFolder(d1), false);
  const d2 = doc(); const s = sink(); let aborted = false; (s.ws as { abort: () => Promise<void> }).abort = async () => { aborted = true; };
  const r2 = await saveToFolder(T, { platform: 'web', win: { ...d2, showSaveFilePicker: async () => ({ createWritable: async () => s.ws }) }, fetch: (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch });
  assert.equal(r2.method, 'download_link'); assert.equal(aborted, true); assert.equal(d2.clicks.length, 1);
  const abort = Object.assign(new Error('x'), { name: 'AbortError' });
  assert.equal((await saveToFolder(T, { platform: 'web', win: { ...doc(), showSaveFilePicker: async () => { throw abort; } } })).method, 'cancelled');
  const d3 = doc(); assert.equal((await saveToGallery(T, { platform: 'web', win: d3 })).method, 'download_link'); assert.equal(d3.clicks.length, 1);
});
test('ZIP em lote: uma pasta escolhida uma vez recebe todos os arquivos', async () => {
  const files: Record<string, string> = {};
  const win: WinLike = { showDirectoryPicker: async () => ({ getFileHandle: async (name) => ({ createWritable: async () => { const s = sink(); const ws = new WritableStream<Uint8Array>({ write(c) { files[name] = (files[name] ?? '') + Buffer.from(c).toString(); } }); return Object.assign(ws, { write: s.ws.write, close: s.ws.close }) as never; } }) }) };
  const ts = ['Loja-BK-29.zip', 'Loja-FN-01.zip'].map((fileName) => ({ url: T.url, fileName, mime: 'application/zip' }));
  const r = await saveManyToFolder(ts, { platform: 'web', win, fetch: okFetch });
  assert.deepEqual(r, { method: 'folder_picker', saved: 2 }); assert.deepEqual(Object.keys(files).sort(), ['Loja-BK-29.zip', 'Loja-FN-01.zip']);
  const d = doc(); assert.deepEqual(await saveManyToFolder(ts, { platform: 'web', win: d }), { method: 'download_link', saved: 2 }); assert.equal(d.clicks.length, 2);
});
