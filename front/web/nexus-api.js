"use strict";
var NexusApi = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // src/api/http.ts
  var http_exports = {};
  __export(http_exports, {
    ApiError: () => ApiError,
    browserStore: () => browserStore,
    createHttp: () => createHttp,
    memoryStore: () => memoryStore
  });
  var MESSAGES = {
    network_error: { "pt-BR": "Sem conex\xE3o. Verifique sua internet e tente de novo.", en: "No connection. Check your internet and try again.", es: "Sin conexi\xF3n. Revisa tu internet e int\xE9ntalo de nuevo." },
    timeout: { "pt-BR": "O servidor demorou para responder. Tente de novo.", en: "The server took too long to respond. Try again.", es: "El servidor tard\xF3 en responder. Int\xE9ntalo de nuevo." },
    unauthorized: { "pt-BR": "Sua sess\xE3o expirou. Entre de novo.", en: "Your session expired. Please sign in again.", es: "Tu sesi\xF3n expir\xF3. Inicia sesi\xF3n de nuevo." },
    forbidden: { "pt-BR": "Voc\xEA n\xE3o tem permiss\xE3o para isso.", en: "You don't have permission to do that.", es: "No tienes permiso para hacer eso." },
    csrf_failed: { "pt-BR": "Sua sess\xE3o precisa ser renovada. Entre de novo.", en: "Your session needs to be renewed. Please sign in again.", es: "Tu sesi\xF3n necesita renovarse. Inicia sesi\xF3n de nuevo." },
    not_found: { "pt-BR": "N\xE3o encontramos o que voc\xEA procurou.", en: "We couldn't find that.", es: "No encontramos lo que buscabas." },
    rate_limited: { "pt-BR": "Muitas tentativas. Aguarde um pouco.", en: "Too many attempts. Please wait a moment.", es: "Demasiados intentos. Espera un momento." },
    service_unavailable: { "pt-BR": "Servi\xE7o indispon\xEDvel no momento. Tente em instantes.", en: "Service unavailable right now. Try again shortly.", es: "Servicio no disponible por ahora. Int\xE9ntalo en un momento." },
    server_error: { "pt-BR": "Algo deu errado do nosso lado. Tente de novo.", en: "Something went wrong on our side. Try again.", es: "Algo sali\xF3 mal de nuestro lado. Int\xE9ntalo de nuevo." }
  };
  var ApiError = class extends Error {
    constructor(status, code, message, details, traceId, retryAfterSec) {
      super(message);
      __publicField(this, "status", status);
      __publicField(this, "code", code);
      __publicField(this, "details", details);
      __publicField(this, "traceId", traceId);
      __publicField(this, "retryAfterSec", retryAfterSec);
      this.name = "ApiError";
    }
  };
  var memoryStore = () => {
    const m = /* @__PURE__ */ new Map();
    return { get: (k) => m.get(k) ?? null, set: (k, v) => {
      if (v === null) m.delete(k);
      else m.set(k, v);
    } };
  };
  var browserStore = (prefix = "nx.") => {
    const mem = memoryStore();
    return {
      get: (k) => {
        if (k !== "csrf") return mem.get(k);
        try {
          return globalThis.localStorage?.getItem(prefix + k) ?? mem.get(k);
        } catch {
          return mem.get(k);
        }
      },
      set: (k, v) => {
        mem.set(k, v);
        if (k !== "csrf") return;
        try {
          if (v === null) globalThis.localStorage?.removeItem(prefix + k);
          else globalThis.localStorage?.setItem(prefix + k, v);
        } catch {
        }
      }
    };
  };
  function createHttp(cfg) {
    const mode = cfg.mode ?? "cookie";
    const store = cfg.tokenStore ?? (mode === "cookie" ? browserStore() : memoryStore());
    const doFetch = cfg.fetch ?? globalThis.fetch.bind(globalThis);
    const sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    const rnd = cfg.random ?? Math.random;
    const uuid = cfg.uuid ?? (() => globalThis.crypto.randomUUID());
    const loc = () => cfg.locale?.() ?? "pt-BR";
    const maxRetries = cfg.maxRetries ?? 2;
    let access = null;
    let refreshing = null;
    const base = cfg.baseUrl.replace(/\/+$/, "");
    const msg = (code, fallback) => MESSAGES[code]?.[loc()] ?? fallback ?? MESSAGES.server_error[loc()];
    const sessionHeaders = () => mode === "cookie" ? { "x-session-mode": "cookie" } : {};
    function keep(t) {
      if (t.accessToken) access = t.accessToken;
      if (mode === "cookie") {
        if (t.csrfToken) store.set("csrf", t.csrfToken);
      } else if (t.refreshToken) store.set("refresh", t.refreshToken);
    }
    function forget() {
      access = null;
      store.set("csrf", null);
      store.set("refresh", null);
    }
    function url(path, params, query) {
      const p = path.replace(/\{(\w+)\}/g, (_, k) => {
        const v = params?.[k];
        if (v === void 0 || v === null || v === "") throw new ApiError(0, "bad_request", `par\xE2metro ausente: ${k}`);
        return encodeURIComponent(String(v));
      });
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(query ?? {})) if (v !== void 0 && v !== null) qs.append(k, String(v));
      const s = qs.toString();
      return `${base}/api/v1${p}${s ? `?${s}` : ""}`;
    }
    async function raw(method, href, init) {
      const ctl = new AbortController();
      const ms = init.timeoutMs ?? cfg.timeoutMs ?? 15e3;
      const timer = setTimeout(() => ctl.abort(new DOMException("timeout", "TimeoutError")), ms);
      const onAbort = () => ctl.abort(init.signal?.reason);
      init.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        return await doFetch(href, { method: method.toUpperCase(), headers: init.headers, body: init.body, signal: ctl.signal, credentials: mode === "cookie" ? "include" : "omit" });
      } catch (e) {
        if (init.signal?.aborted) throw e;
        if (ctl.signal.aborted) throw new ApiError(0, "timeout", msg("timeout"));
        throw new ApiError(0, "network_error", msg("network_error"));
      } finally {
        clearTimeout(timer);
        init.signal?.removeEventListener("abort", onAbort);
      }
    }
    async function toError(r, credentialCall = false) {
      let b = {};
      try {
        b = await r.json();
      } catch {
      }
      const code = b.code ?? (r.status === 401 ? "unauthorized" : r.status === 403 ? "forbidden" : r.status === 404 ? "not_found" : r.status === 429 ? "rate_limited" : r.status >= 500 ? "server_error" : "bad_request");
      const ra = Number(r.headers.get("retry-after"));
      const generic = /* @__PURE__ */ new Set([...credentialCall ? [] : ["unauthorized", "forbidden"], "csrf_failed", "not_found", "rate_limited", "service_unavailable", "server_error"]);
      return new ApiError(r.status, code, generic.has(code) ? msg(code, b.message) : b.message ?? msg(code), b.details, b.traceId ?? r.headers.get("x-trace-id") ?? void 0, Number.isFinite(ra) && ra > 0 ? ra : void 0);
    }
    function refresh() {
      if (refreshing) return refreshing;
      const p = (async () => {
        try {
          const headers = { "content-type": "application/json", "accept-language": loc(), ...sessionHeaders() };
          let body;
          if (mode === "cookie") {
            const c = store.get("csrf");
            if (!c) return false;
            headers["x-csrf-token"] = c;
          } else {
            const rt = store.get("refresh");
            if (!rt) return false;
            body = JSON.stringify({ refreshToken: rt });
          }
          const r = await raw("post", `${base}/api/v1/auth/refresh`, { headers, body: body ?? "{}" });
          if (!r.ok) {
            forget();
            return false;
          }
          keep(await r.json());
          return true;
        } catch {
          return false;
        }
      })();
      refreshing = p;
      void p.finally(() => {
        if (refreshing === p) refreshing = null;
      });
      return p;
    }
    async function send(method, path, o = {}) {
      const write = method !== "get";
      const key = write ? o.idempotencyKey ?? uuid() : void 0;
      const href = url(path, o.params, o.query);
      let refreshed = false;
      for (let attempt = 0; ; attempt++) {
        const headers = { accept: "application/json", "accept-language": loc(), ...sessionHeaders() };
        if (o.raw !== void 0) headers["content-type"] = o.contentType ?? "application/octet-stream";
        else if (o.body !== void 0) headers["content-type"] = "application/json";
        if (key) headers["idempotency-key"] = key;
        if (o.auth !== false && access) headers.authorization = `Bearer ${access}`;
        let r;
        try {
          r = await raw(method, href, { headers, body: o.raw !== void 0 ? o.raw : o.body === void 0 ? void 0 : JSON.stringify(o.body), signal: o.signal, timeoutMs: o.timeoutMs });
        } catch (e) {
          if (e instanceof ApiError && e.code === "network_error" && attempt < maxRetries) {
            await sleep(backoff(attempt));
            continue;
          }
          throw e;
        }
        if (r.status === 401 && o.auth !== false && !refreshed) {
          refreshed = true;
          if (await refresh()) {
            attempt--;
            continue;
          }
          cfg.onUnauthenticated?.();
          throw await toError(r);
        }
        if ((r.status === 502 || r.status === 503 || r.status === 504) && attempt < maxRetries) {
          await sleep(backoff(attempt, Number(r.headers.get("retry-after"))));
          continue;
        }
        if (!r.ok) throw await toError(r, o.auth === false);
        if (r.status === 204) return void 0;
        const ct = r.headers.get("content-type") ?? "";
        return ct.includes("json") ? await r.json() : await r.text();
      }
    }
    const backoff = (attempt, retryAfterSec) => Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? Math.min(retryAfterSec, 10) * 1e3 : 300 * 2 ** attempt * (0.75 + rnd() * 0.5);
    return {
      /** Chamada tipada pelo contrato: rota, parâmetros, corpo e resposta vêm de `schema.d.ts`. */
      request(method, path, o = {}) {
        return send(method, path, o);
      },
      async login(email, password, totp) {
        const t = await send("post", "/auth/login", { body: { email, password, ...totp ? { totp } : {} }, auth: false });
        keep(t);
        return t;
      },
      /** Login com Firebase: troca o ID token (e-mail verificado) pela sessão do app (cookie httpOnly no navegador). */
      async firebaseLogin(idToken, locale) {
        const t = await send("post", "/auth/firebase", { body: { idToken, ...locale ? { locale } : {} }, auth: false });
        keep(t);
        return t;
      },
      async register(body) {
        const t = await send("post", "/auth/register", { body, auth: false });
        keep(t);
        return t;
      },
      /** Restaura a sessão ao abrir o app (F5): tenta um refresh com o que estiver guardado. */
      restore: () => refresh(),
      async logout() {
        try {
          if (mode === "cookie") {
            const c = store.get("csrf");
            if (c) await raw("post", `${base}/api/v1/auth/logout`, { headers: { "content-type": "application/json", "x-csrf-token": c, ...sessionHeaders() }, body: "{}" });
          } else {
            const rt = store.get("refresh");
            if (rt) await raw("post", `${base}/api/v1/auth/logout`, { headers: { "content-type": "application/json" }, body: JSON.stringify({ refreshToken: rt }) });
          }
        } finally {
          forget();
        }
      },
      /** Envio binário (ex.: `PUT /uploads/photo` com a foto): mesma auth, refresh e idempotência das demais chamadas. */
      upload(method, path, data, contentType, o = {}) {
        return send(method, path, { ...o, raw: data, contentType, timeoutMs: o.timeoutMs ?? 6e4 });
      },
      isAuthenticated: () => access !== null
    };
  }
  return __toCommonJS(http_exports);
})();
