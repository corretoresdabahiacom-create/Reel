import express from 'express';
import { createHmac } from 'node:crypto';
import { adapt, type Profile } from './adapter';

/* Backend mínimo (stub). Aqui moram os SEGREDOS: client secrets, partner keys, troca de code por token, refresh,
   uploads grandes e FFmpeg. Persistência de tokens: criptografar (AES-256-GCM) em banco; nunca logar tokens. */
const app = express();
app.use(express.json({ limit: '1mb' }));
const env = (k: string) => process.env[k] ?? '';
const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const post = async (url: string, body: Record<string, string>) => { const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form(body) }); if (!r.ok) throw new Error(`token endpoint ${r.status}`); return r.json() as Promise<Record<string, any>>; };
const toToken = (j: Record<string, any>) => ({ accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: Date.now() + (j.expires_in ?? 3600) * 1000, scope: j.scope, externalUserId: j.open_id ?? j.user_id });

app.post('/api/oauth/:p/token', async (req, res) => {
  const { code, codeVerifier, redirectUri } = req.body; const p = req.params.p;
  try {
    if (p === 'tiktok') return res.json(toToken(await post('https://open.tiktokapis.com/v2/oauth/token/', { client_key: env('TIKTOK_CLIENT_KEY'), client_secret: env('TIKTOK_CLIENT_SECRET'), code, grant_type: 'authorization_code', redirect_uri: redirectUri, code_verifier: codeVerifier })));
    if (p === 'youtube') return res.json(toToken(await post('https://oauth2.googleapis.com/token', { client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), code, grant_type: 'authorization_code', redirect_uri: redirectUri, code_verifier: codeVerifier })));
    if (p === 'mercadolivre') return res.json(toToken(await post('https://api.mercadolibre.com/oauth/token', { grant_type: 'authorization_code', client_id: env('MELI_APP_ID'), client_secret: env('MELI_CLIENT_SECRET'), code, redirect_uri: redirectUri, code_verifier: codeVerifier })));
    // TODO: instagram (api.instagram.com/oauth/access_token), shopee (auth/token/get com HMAC), temu, olx
    res.status(501).json({ error: 'not_implemented' });
  } catch (e) { res.status(502).json({ error: (e as Error).message }); }
});
app.post('/api/oauth/:p/refresh', async (req, res) => {
  const { refreshToken } = req.body; const p = req.params.p;
  try {
    if (p === 'tiktok') return res.json(toToken(await post('https://open.tiktokapis.com/v2/oauth/token/', { client_key: env('TIKTOK_CLIENT_KEY'), client_secret: env('TIKTOK_CLIENT_SECRET'), grant_type: 'refresh_token', refresh_token: refreshToken })));
    if (p === 'youtube') return res.json({ ...toToken(await post('https://oauth2.googleapis.com/token', { client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), grant_type: 'refresh_token', refresh_token: refreshToken })), refreshToken });
    if (p === 'mercadolivre') return res.json(toToken(await post('https://api.mercadolibre.com/oauth/token', { grant_type: 'refresh_token', client_id: env('MELI_APP_ID'), client_secret: env('MELI_CLIENT_SECRET'), refresh_token: refreshToken })));
    res.status(501).json({ error: 'not_implemented' });
  } catch (e) { res.status(502).json({ error: (e as Error).message }); }
});
// Shopee: URL de autorização assinada. sign = HMAC-SHA256(partner_key, partner_id + path + timestamp)
app.post('/api/oauth/shopee/auth-url', (req, res) => {
  const path = '/api/v2/shop/auth_partner'; const ts = Math.floor(Date.now() / 1000);
  const sign = createHmac('sha256', env('SHOPEE_PARTNER_KEY')).update(`${env('SHOPEE_PARTNER_ID')}${path}${ts}`).digest('hex');
  res.json({ url: `https://partner.shopeemobile.com${path}?${form({ partner_id: env('SHOPEE_PARTNER_ID'), timestamp: String(ts), sign, redirect: req.body.redirectUri })}` });
});
app.post('/api/adapt', async (req, res) => {
  try { const out = `/tmp/nexusreel-${Date.now()}.mp4`; const r = await adapt(req.body.videoUrl, out, req.body.profile as Profile); res.json({ url: out, ...r }); } // TODO: enviar a um storage (S3/GCS) e devolver URL assinada
  catch (e) { res.status(500).json({ error: (e as Error).message }); }
});
// TODO: rotas /api/{tiktok,youtube,instagram,shopee,temu,olx,mercadolivre}/* usadas por common.backend()
// ---- Fase 4 ----
// Redirect de afiliados: registra o clique e responde 302 para o link real. TODO: usar recordClick() com banco real.
app.get('/r/:publicationId', (req, res) => { res.status(501).json({ error: 'not_implemented', hint: 'chame recordClick(db, req.params.publicationId) e res.redirect(302, url)' }); });
// API B2B: geração programática. Autenticação por API key (header Authorization: Bearer nxr_live_...), escopo "catalogs:generate".
app.post('/api/v1/catalogs/:id/generate', (req, res) => { res.status(202).json({ batchId: 'stub', catalogId: req.params.id, status: 'queued' }); }); // TODO: generateBatch() + fila BullMQ
app.listen(Number(env('PORT') || 8787), () => console.info(JSON.stringify({ ts: new Date().toISOString(), level: 'info', event: 'server_started' })));
