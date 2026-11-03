# NexusReel – Integrações (Fase 3)

## Arquitetura
Front (`src/services/integrations/*`) monta a URL OAuth (PKCE) e chama o backend. O backend (`server/`) guarda **client secrets**, troca `code`→token, renova tokens, assina requisições (Shopee), faz uploads grandes e roda FFmpeg. **Segredos nunca vão para o front.** Tokens: criptografados em repouso (AES-256-GCM); logs passam por `redact()`.

Chave mestra: `USE_REAL_APIS` (padrão `false` = mocks). Contrato estável: `publish(platform, video, metadata, token, onProgress) → { status, url?, error? }`.

## Como obter credenciais
| Plataforma | Onde | Observações |
|---|---|---|
| TikTok | developers.tiktok.com → app → Content Posting API (Direct Post) | **Sem auditoria, só posta privado (SELF_ONLY).** Solicite auditoria. ~6 req/min/token. Legenda ≤ 2200. |
| YouTube | console.cloud.google.com → YouTube Data API v3 → OAuth client Web, escopo `youtube.upload` | Projeto não verificado: vídeos privados. `access_type=offline&prompt=consent` para refresh token. |
| Instagram | developers.facebook.com → Instagram API (login do Instagram) | Conta **profissional** obrigatória. `video_url` público. Revisão do app para `instagram_business_content_publish`. |
| Shopee | open.shopee.com → app → Partner ID/Key | URL de autorização com assinatura HMAC; token por loja (`shop_id`). |
| Temu | Programa de parceiros | **Não verificado** – confirmar API. |
| OLX | Programa de parceiros/integradores | **Não verificado.** Vídeo = link do YouTube. |
| Mercado Livre | developers.mercadolivre.com.br → app | Escopos `offline_access read write`. Clips: vertical, 10s–1min, ≤280MB. |

## Divergências encontradas na checagem (leia antes de ir a produção)
1. **YouTube cota**: página oficial *determine_quota_cost* lista `videos.insert` = 1 unidade, bucket próprio (~100/dia padrão). O prompt citava 1.600 unidades (~6 vídeos/dia) – provável valor antigo. Confirme no seu projeto.
2. **YouTube Shorts**: fontes de terceiros indicam vertical/quadrado e **< 3 min**; o prompt dizia ≤ 59s. O código mantém 59s por segurança.
3. **Não verificados (marcados `TODO: verify`)**: endpoint de Clips do Mercado Livre, endpoints de vídeo da Shopee, campo de vídeo da OLX, API da Temu, limites exatos de Instagram/Temu.

## Vídeo (videoAdapter)
`adaptForPlatform(url, platform)` → backend FFmpeg: 1080×1920 (9:16), MP4 H.264/AAC, corte por duração, compressão por bitrate calculado (Shopee ≤30MB). Perfis em `ADAPT_PROFILES`.

## Fluxo OLX
`publishAll` publica o YouTube primeiro (ou usa o já publicado), e passa `youtubeUrl` ao OLX. Falhas são isoladas (`allSettled`).

## Erros e retry
`http.ts`: timeout 30s, 3 retries com backoff exponencial + jitter, respeita `Retry-After`. `PlatformError { code, retryable }`. Na UI, "Tentar novamente" refaz só a plataforma que falhou.

## Testes
Rode primeiro em sandbox/contas de teste. Nada aqui foi testado contra as APIs reais (o ambiente de desenvolvimento não alcança esses serviços).
