/* NexusReel service worker — cache-first para o app shell, stale-while-revalidate para o resto.
 * Fila de ações offline: o app guarda a fila em memória/estado e sincroniza ao reconectar;
 * aqui registramos Background Sync (quando existir) para avisar a página. */
const VERSION = "nx-v1.13.0"; // config do servidor (nexus-config.js) sempre da rede primeiro. // P0-1: API e mídia assinada fora do cache (apaga caches antigos que guardaram dados do usuário). // Módulo 11 (acessibilidade + teleprompter atrás de ff_accessibility/ff_teleprompter; correções WCAG 2.2 AA): força atualização do cache
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./vendor/react.production.min.js", "./vendor/react-dom.production.min.js", "./vendor/htm.js", "./icons/icon-192.png", "./icons/icon-512.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin && !/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;
  // API (dados do usuário) e mídia assinada (/api/v1/storage): SEMPRE rede, nunca no cache do aparelho. Com front e API no
  // mesmo domínio (instalação gratuita/Caddy), o cache servia projeto excluído, lista velha e até /users/me de outra conta.
  if (url.origin === location.origin && url.pathname.startsWith("/api/")) return;
  if (req.headers.has("authorization") || req.headers.has("range")) return;
  // configuração do servidor: rede primeiro (mudou no servidor → vale no próximo carregamento); cache só sem internet
  if (url.origin === location.origin && url.pathname.endsWith("/nexus-config.js")) {
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); } return r; }).catch(() => caches.match(req)));
    return;
  }
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put("./index.html", cp)); return r; }).catch(() => caches.match("./index.html")));
    return;
  }
  // só arquivos estáticos do app (scripts, estilos, imagens, fontes, manifesto)
  if (!["script", "style", "image", "font", "manifest"].includes(req.destination)) return;
  e.respondWith(caches.match(req).then((hit) => {
    const net = fetch(req).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(VERSION).then((c) => c.put(req, cp)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
self.addEventListener("sync", (e) => {
  if (e.tag === "nx-sync") e.waitUntil(self.clients.matchAll().then((cs) => cs.forEach((c) => c.postMessage({ type: "nx-sync" }))));
});
