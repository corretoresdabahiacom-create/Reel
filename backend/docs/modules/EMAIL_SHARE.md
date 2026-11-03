# Módulo 7 — Envio por e-mail (link assinado)

**Flag:** `ff_email` (desligada por padrão). Com a flag desligada:
- todas as rotas respondem **404**, inclusive os links públicos já enviados (a flag é o "botão de desligar");
- o player e o catálogo ficam como antes.

**Migration:** `0016_email_share` · **Testes:** `tests/29-email-share.test.ts` (15) e, no frontend, `tests/e2e/drive-email.cjs` (27 verificações) · **Fila:** `email-share` (só para preparar o ZIP do lote) + a fila `emails` que já existia · **Template:** `templates/emails/share.html` (o Dockerfile passou a copiar `templates/`).

## Entregáveis
| Arquivo | O quê |
|---|---|
| `src/modules/emailShare/emailShareService.ts` | `createSignedLink`, `sendEmail`, `sendBatch`, mais `processZip` (worker), `open`/`download` (link público), `list`, `revoke` e `config` |
| `templates/emails/share.html` | E-mail em HTML (tabelas e estilos inline, para clientes de e-mail), com versão texto junto |
| `templates/emails/share-page.html` | Página do link: download direto ou formulário de senha. HTML **sem script** |
| `migrations/0016_email_share` | `email_shares (id, user_id, asset_id, recipients_hash, sent_at, expires_at, password_hash, access_count)`, mais projeto, tipo, lote, arquivo, remetente, mensagem, contagem, status e revogação. RLS por dono |
| UI `<EmailShareSheet>` | No player (um vídeo) e no catálogo B2B (lote) |

## Como funciona
- **Link:** `…/api/v1/s/<shareId>.<expiração>.<HMAC-SHA256(segredo, shareId.expiração)>`.
  - O segredo é `EMAIL_SHARE_SECRET` ou uma chave derivada do `JWT_SECRET`, nunca a mesma chave.
  - Mexer no id, na validade ou na assinatura invalida o link.
  - O servidor também confere `expires_at`, a revogação e a flag do dono.
- **Validade:** 7 dias (`EMAIL_SHARE_TTL_DAYS`).
- **Download:** redireciona (303) para uma URL assinada de **5 min** do arquivo, conta o acesso (`access_count`) e audita (`email_share.access`).
- **Senha opcional:**
  - guardada como hash **argon2id**, o mesmo do login. O spec pede bcrypt; o argon2id é a recomendação atual da OWASP e já está no projeto, então não entra biblioteca nova;
  - a senha **não vai no e-mail** (a tela avisa para combinar com a pessoa);
  - 5 tentativas erradas por link travam por 15 min (429), além de 10 tentativas por minuto por IP.
- **Destinatários:**
  - até **20 por envio**, contando a cópia para si;
  - repetidos são ignorados;
  - **um e-mail por pessoa**: ninguém vê o endereço dos outros.
- **Cópia para si** (`includeSelf`): vai para o e-mail da conta, como backup do link.
- **Lote B2B** (`POST /catalogs/:catalogId/email`):
  - `per_item` manda um e-mail por produto, com um link para cada vídeo; o teto é destinatários × itens ≤ 100;
  - `zip` monta **um ZIP** com uma pasta por produto (vídeo + `ficha.json`) no bucket `exports`, que some sozinho em 7 dias, e manda um e-mail;
  - itens sem vídeo pronto saem em `skipped`;
  - aceita API key `catalogs:read`.
- **Arquivo enviado:** o vídeo final do projeto (com a versão de áudio ativa do Módulo 1, se houver) ou um asset pronto do Módulo 6 (`assetId`).

## Segurança
- **E-mail do destinatário nunca em logs:**
  - no banco e na auditoria, os destinatários só existem como `emailHash` = HMAC-SHA256 com pepper do servidor. Um SHA-256 puro de e-mail seria reversível por dicionário;
  - na **fila** o endereço vai **cifrado** (AES-256-GCM, `toEnc`) e o driver de e-mail registra só `toHash`;
  - prova: `evidence/email-log-grep.txt`. Todas as 215 linhas de log da suíte foram capturadas, e `grep` pelo domínio de todos os destinatários dá **0**. O teste "LOGS" também falha se aparecer qualquer endereço.
- **Rate limit (spec):**
  - `POST /projects/:id/email`: **10/min por usuário** e **30/min por IP**, como dois limites independentes;
  - o teste "RATE LIMIT" faz o 11º envio do mesmo usuário e o 31º do mesmo IP (4 usuários) e recebe 429, sem gravar o envio bloqueado.
- **Anti-spam e golpes:**
  - domínios descartáveis bloqueados (`disposable.ts`, cerca de 60 domínios e subdomínios, ampliável por `EMAIL_BLOCKED_DOMAINS`);
  - **mensagem com link é recusada**;
  - nome do remetente sem caracteres especiais (≤60);
  - teto diário de 200 destinatários por usuário;
  - tudo no e-mail e na página é **escapado** (o teste de XSS confere).
- **Página pública:** CSP própria (`default-src 'none'; style-src 'unsafe-inline'; form-action 'self'`), `no-store`, `no-referrer`, `noindex`. A rota está classificada em `PUBLIC_ROUTE_DB_SCOPE`.
- **Auditoria em `audit_logs`:**
  - `email_share.send` registra quem, o hash de cada destinatário (para quem), quando, qual arquivo, se tem senha e a validade;
  - também há `email_share.batch`, `email_share.access` e `email_share.revoke`.
- **Idempotency-Key** obrigatória nos envios.
- **LGPD:** a exportação lista os envios sem destinatários nem senha; a exclusão da conta apaga os registros.

## Endpoints (login; 404 sem `ff_email`)
| Método | Rota | Notas |
|---|---|---|
| POST | `/projects/:projectId/email` | `recipients[]`, `includeSelf`, `message` (≤280, sem link), `senderName` (≤60), `password` (4–64), `assetId`. 202 com `link` e `expiresAt` |
| POST | `/catalogs/:catalogId/email` | `mode: per_item \| zip`, mais os mesmos campos |
| GET | `/email-shares` · `/email-shares/config` | Histórico (quantidade de destinatários, acessos, status) e limites |
| DELETE | `/email-shares/:shareId` | Cancela o link |
| GET | `/s/:token` | Página do link (HTML) ou `?format=json` |
| GET/POST | `/s/:token/download` | Sem senha (GET) ou com senha (POST, formulário ou JSON) |

## Critérios de aceite → evidência
| Critério | Teste |
|---|---|
| Enviar link | "envia": 3 e-mails (2 pessoas + cópia), HTML com remetente, mensagem e link |
| Expira em 7 dias | Validade entre 6,99 e 7 dias; vencido, revogado ou adulterado devolve 404 |
| Senha opcional | Sem senha ou com senha errada dá 401; certa libera (JSON e formulário); 5 erradas dão 429 |
| Lote: 1 e-mail por item ou 1 ZIP | `per_item` gera 2×2 e-mails; `zip` gera um ZIP com `BK-29/` e `FN-01/` e vídeo idêntico; via API key |
| Rate limit (429) | "RATE LIMIT" (usuário e IP) |
| E-mail fora dos logs (grep) | `email-log-grep.txt` + teste "LOGS" |
| Flag desligada = app idêntico | 404 (inclusive links), nada gravado, E2E sem botão |

## Riscos e limites
- **Provedor real de e-mail:** só o driver `log` foi exercitado. O `resend` envia texto + HTML. O `ses` continua TODO (como antes do módulo). **Não verificável:** entrega real, SPF/DKIM/DMARC e caixa de spam.
- **Anti-spam:** a lista de descartáveis é curta e embutida, sem consulta de MX ou de reputação (exigiria rede ou um serviço externo).
- **Kill switch:** desligar a flag derruba os links já enviados. Isso é intencional, mas o destinatário vê "link não existe ou expirou".
- **Boas-vindas do cadastro:** o e-mail de boas-vindas (fluxo anterior ao módulo) segue com o endereço **mascarado** no log (`u***@dominio`). Os e-mails deste módulo usam só hash. Dá para trocar o resto do app para hash com uma linha.
- **Também não verificável:** staging e produção.

## Como ligar (staging)
```sql
UPDATE feature_flags SET enabled = true, rollout_percent = 10 WHERE key = 'ff_email';
```
Defina `EMAIL_SHARE_SECRET` (≥32 caracteres) e `EMAIL_PROVIDER=resend` com domínio verificado.
