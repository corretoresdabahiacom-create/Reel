/**
 * Módulo 5 — Salvamento no cliente (atrás de `ff_save`). O servidor só entrega um link assinado de 24 h
 * (POST /api/v1/projects/:id/save → { url, fileName, mime, flow }); este arquivo grava o arquivo onde o usuário escolheu.
 * - Galeria (app): Capacitor Filesystem baixa o arquivo e o Share abre a folha do sistema
 *   (iOS: "Salvar vídeo" → Fotos; "Salvar em Arquivos" → iCloud Drive). No Android o arquivo vai para
 *   Documents/NexusReel (público, indexado pelo MediaStore) e a folha de compartilhar fica disponível.
 * - Pasta no computador (navegador): File System Access API (`showSaveFilePicker` / `showDirectoryPicker`), gravando
 *   em stream. Sem a API (Firefox/Safari) ou se o fetch falhar (CORS), cai para o download normal do navegador.
 * Nenhum token passa por aqui: só o link assinado, que expira.
 */
export interface SaveTarget { url: string; fileName: string; mime: string }
export type SaveMethod = 'share_sheet' | 'documents_folder' | 'file_picker' | 'folder_picker' | 'download_link' | 'cancelled';
export interface SaveResult { method: SaveMethod; path?: string }

interface Writable { write(d: Blob | BufferSource): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }
interface FileHandle { createWritable(): Promise<Writable & WritableStream> }
interface DirHandle { getFileHandle(name: string, o: { create: boolean }): Promise<FileHandle> }
export interface WinLike {
  showSaveFilePicker?: (o: { suggestedName: string; types?: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileHandle>;
  showDirectoryPicker?: (o?: { mode?: 'readwrite'; id?: string }) => Promise<DirHandle>;
  document?: { createElement(t: 'a'): { href: string; download: string; rel: string; click(): void; remove?(): void }; body?: { appendChild(n: unknown): unknown } };
}
export interface FsLike { downloadFile(o: { url: string; path: string; directory: string; recursive?: boolean }): Promise<{ path?: string }> }
export interface ShareLike { share(o: { title?: string; files?: string[]; url?: string; dialogTitle?: string }): Promise<unknown>; canShare?(): Promise<{ value: boolean }> }
export interface SaveEnv { platform: 'ios' | 'android' | 'web'; win?: WinLike; fs?: FsLike; share?: ShareLike; fetch?: typeof fetch }

const EXT: Record<string, string[]> = { 'video/mp4': ['.mp4'], 'application/zip': ['.zip'] };
const cancelled = (e: unknown) => (e as { name?: string })?.name === 'AbortError';

/** Download normal do navegador (o servidor manda Content-Disposition: attachment com o nome do arquivo). */
export function downloadLink(t: SaveTarget, win: WinLike): SaveResult {
  const a = win.document!.createElement('a'); a.href = t.url; a.download = t.fileName; a.rel = 'noopener';
  win.document!.body?.appendChild(a); a.click(); a.remove?.(); return { method: 'download_link' };
}
/** Plugins nativos carregados só no app (o bundle web não paga por eles). */
async function native(env: SaveEnv): Promise<{ fs: FsLike; share: ShareLike; dirs: { cache: string; documents: string } }> {
  if (env.fs && env.share) return { fs: env.fs, share: env.share, dirs: { cache: 'CACHE', documents: 'DOCUMENTS' } };
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  return { fs: Filesystem as unknown as FsLike, share: Share as unknown as ShareLike, dirs: { cache: Directory.Cache, documents: Directory.Documents } };
}

/** Galeria do aparelho (iOS Fotos / Android). No navegador vira download normal. */
export async function saveToGallery(t: SaveTarget, env: SaveEnv): Promise<SaveResult> {
  if (env.platform === 'web') return downloadLink(t, env.win!);
  const { fs, share, dirs } = await native(env);
  if (env.platform === 'android') {
    const r = await fs.downloadFile({ url: t.url, path: `NexusReel/${t.fileName}`, directory: dirs.documents, recursive: true });
    return { method: 'documents_folder', path: r.path };
  }
  const r = await fs.downloadFile({ url: t.url, path: `NexusReel/${t.fileName}`, directory: dirs.cache, recursive: true });
  try { await share.share({ title: t.fileName, files: [r.path!], dialogTitle: t.fileName }); } catch (e) { if (cancelled(e) || /cancel/i.test(String((e as Error)?.message))) return { method: 'cancelled' }; throw e; }
  return { method: 'share_sheet', path: r.path };
}

async function writeTo(w: Writable & WritableStream, t: SaveTarget, f: typeof fetch): Promise<void> {
  const res = await f(t.url); if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (res.body && typeof res.body.pipeTo === 'function') { await res.body.pipeTo(w); return; } // pipeTo fecha o arquivo
  await w.write(await res.blob()); await w.close();
}
/** Um arquivo numa pasta do computador (o usuário escolhe pasta e nome). */
export async function saveToFolder(t: SaveTarget, env: SaveEnv): Promise<SaveResult> {
  const win = env.win!; const f = env.fetch ?? fetch;
  if (typeof win.showSaveFilePicker !== 'function') return downloadLink(t, win);
  let h: FileHandle;
  try { h = await win.showSaveFilePicker({ suggestedName: t.fileName, types: [{ description: t.fileName, accept: { [t.mime]: EXT[t.mime] ?? [] } }] }); }
  catch (e) { if (cancelled(e)) return { method: 'cancelled' }; return downloadLink(t, win); }
  const w = await h.createWritable();
  try { await writeTo(w, t, f); return { method: 'file_picker' }; }
  catch { await w.abort?.().catch(() => undefined); return downloadLink(t, win); } // ex.: CORS no fetch → download normal
}
/** Vários arquivos (ZIP por produto) numa pasta escolhida uma vez. */
export async function saveManyToFolder(ts: SaveTarget[], env: SaveEnv): Promise<SaveResult & { saved: number }> {
  const win = env.win!; const f = env.fetch ?? fetch;
  if (typeof win.showDirectoryPicker !== 'function') { for (const t of ts) downloadLink(t, win); return { method: 'download_link', saved: ts.length }; }
  let dir: DirHandle;
  try { dir = await win.showDirectoryPicker({ mode: 'readwrite', id: 'nexusreel-export' }); } catch (e) { if (cancelled(e)) return { method: 'cancelled', saved: 0 }; throw e; }
  let saved = 0;
  for (const t of ts) {
    const w = await (await dir.getFileHandle(t.fileName, { create: true })).createWritable();
    try { await writeTo(w, t, f); saved++; } catch { await w.abort?.().catch(() => undefined); downloadLink(t, win); }
  }
  return { method: 'folder_picker', saved };
}
/** O navegador deixa escolher a pasta? (para a tela explicar o que vai acontecer) */
export const canPickFolder = (win: WinLike) => typeof win.showSaveFilePicker === 'function';
