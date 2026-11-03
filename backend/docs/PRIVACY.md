# Privacidade e LGPD

## Bases e consentimento
- Cadastro exige idade ≥ 13; 13–17 exige `guardianConsent` (registrado). Termos, cookies, IA e marketing são consentimentos **separados e versionados** (`consents`, versão atual `2026-10`), revogáveis (`revoked_at`). Eventos de analytics só vinculam o usuário se houver consentimento de cookies — caso contrário são anonimizados.
- O uso de IA generativa (fotos → vídeo) requer consentimento `ai`; fotos de pessoas usam `referenceMode:'person'` e são tratadas como dado pessoal.

## Direitos do titular
| Direito | Como | Prazo |
|---|---|---|
| Acesso/portabilidade | `POST /users/me/export` → worker gera JSON/ZIP → link assinado de **7 dias** (`GET /users/me/export/:id`); máx. 3 pedidos/10 min; nunca inclui hashes de senha nem tokens de plataformas | minutos |
| Eliminação | `POST /users/me/deletion` agenda para **+30 dias** (geração/publicação ficam bloqueadas — 423); `DELETE /users/me/deletion` cancela. No vencimento o worker faz *hard delete* de projetos, cenas, publicações, uploads e vídeos (S3), revoga sessões e **anonimiza** o usuário | 30 dias |
| Correção | `PATCH /users/me` | imediato |
| Revogação de consentimento | `POST /users/me/consents` com `accepted:false` | imediato |

**Mantido após exclusão:** apenas `transactions` (valores e referências, sem dados pessoais — o usuário vira `deleted-<uuid>@deleted.invalid`) por obrigação fiscal/contábil, e `audit_logs` (ator anonimizado).

## Compartilhamento (operadores)
Provedores de IA (Kling, ElevenLabs, OpenAI moderação) recebem roteiro/imagens para processar; plataformas de destino recebem o vídeo e metadados que o usuário publica; Stripe/Mercado Pago/Pagar.me recebem dados de cobrança; Sentry recebe erros **sem** corpo de requisição (apenas `userId` e `traceId`). Formalizar DPAs com cada operador antes de produção.

## Minimização
IP apenas como HMAC; logs sem corpo de requisição nem e-mail completo (mascarado); e-mails transacionais não registram o corpo (podem conter link mágico).

> Este documento descreve a implementação técnica — não substitui revisão jurídica (política de privacidade, RIPD/DPIA, DPO, base legal por tratamento).
