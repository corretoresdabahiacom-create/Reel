# Módulo 5 — Salvamento (aparelho, pasta, nuvem do usuário, Nuvem NexusReel, ZIP em lote)

**Flag:** `ff_save` (desligada por padrão). Com a flag desligada:
- as rotas abaixo respondem **404**;
- o player, a etapa final do criador, a Privacidade e o catálogo B2B ficam iguais a antes;
- a resposta dos projetos não ganha campo nenhum.

Duas exceções, de propósito:
- o **callback OAuth** é público (o navegador volta do provedor sem `Authorization`; a identidade vem do `state`);
- **`DELETE /cloud/connections/:provider` funciona sempre**. Pela LGPD, o usuário revoga a qualquer momento, mesmo que a flag tenha sido desligada depois de ele conectar.

**Migration:** `0014_save` · **Testes:** `tests/27-save.test.ts` (19). No frontend: `tests/save.test.ts` (5) e `tests/e2e/drive-save.cjs` (35 verificações) · **Fila:** `save-export` (com DLQ) · **Job diário:** `save-retention`.

## Tabelas
| Tabela | Para quê |
|---|---|
| `destination_exports` | Um salvamento por destino: `id, user_id, project_id, destination, status, external_url, error, created_at`, mais `kind` (video/zip), `batch_id`, `catalog_id`, `catalog_item_id`, `file_name`, `storage_key`, `bytes`, `sha256`, `expires_at`. O nome foi escolhido para não confundir com `data_export_requests` (LGPD). **Não existe `export_jobs`**; o teste confere no `information_schema`. |
| `cloud_connections` | `id, user_id, provider, access_token_enc, refresh_token_enc, expires_at, scopes`, mais `kms_key_id`, `status`, `refresh_count`, `rotated_at`. Uma linha por usuário e provedor. |

As duas têm RLS só para o dono. O rollback é bloqueado se houver conexões ou salvamentos.

## Destinos
| Destino | Como funciona | Onde fica |
|---|---|---|
| `device` (galeria) | O servidor emite um link assinado de 24 h com `Content-Disposition: attachment; filename="<título>.mp4"`. No app, o Capacitor Filesystem baixa o arquivo e o Share abre a folha do sistema. No iOS, "Salvar vídeo" leva para Fotos. No Android, o arquivo vai para `Documents/NexusReel` (público). | Aparelho |
| `local_folder` | Mesmo link. No navegador, a File System Access API (`showSaveFilePicker`) grava em stream. Sem a API (Firefox/Safari) ou se o fetch falhar (CORS), cai para o download normal. | Computador |
| `icloud` | O iCloud **não tem OAuth/API pública** para um servidor gravar no iCloud Drive. No iPhone, o caminho é Compartilhar → "Salvar em Arquivos" → iCloud Drive, com o mesmo link. | iCloud Drive do usuário |
| `google_drive` / `dropbox` / `onedrive` | Fila `save-export`: upload com o token do usuário para a pasta **NexusReel**. Google usa upload resumível; OneDrive usa sessão em partes de 10 MiB; Dropbox aceita até 150 MB. | Nuvem do usuário |
| `nexus_cloud` | Cópia no bucket **`archive`**, separado do storage operacional (o bucket `videos` expira cenas em 90 dias; `exports`, em 7). Chave: `<userId>/<exportId>/<arquivo>`. | Nuvem NexusReel |

O worker **só lê** o vídeo final: usa a versão de áudio ativa do Módulo 1, se houver, e nunca altera o original. O teste compara o hash e a linha do projeto.

## Nuvem NexusReel: retenção e cota
- **Free 90 dias / Pro e Business 365 dias**, configuráveis por `NEXUS_CLOUD_RETENTION_*_DAYS`.
- **Validade efetiva** = o maior entre o prazo gravado e `created_at + prazo do plano atual`. Subir para Pro estende o que já foi salvo; descer de plano nunca encurta.
- **Job `save-retention`** (diário) apaga o arquivo vencido e marca `expired`. No S3, a regra de ciclo de vida de 400 dias do bucket `archive` é só rede de segurança (`infra/terraform/modules/storage`).
- **Cota:** Free 2 GB, Pro 50 GB. Cota cheia devolve 409 `nexus_quota_exceeded` com mensagem clara.
- O usuário pode apagar um item antes do prazo com `DELETE /save/exports/:id`.

## ZIP em lote (B2B)
`POST /catalogs/:catalogId/export` gera **um ZIP por produto**:
- **conteúdo:** `<SKU>.mp4`, `ficha.json` (sku, nome, descrição, preço, categoria, catálogo) e `legenda.txt`. Não leva nenhum dado pessoal;
- **destinos:** aparelho (o ZIP fica 7 dias para baixar), Nuvem NexusReel ou uma nuvem conectada;
- **itens sem vídeo pronto** saem em `skipped`, com o motivo;
- **acesso:** aceita API key com `catalogs:read`. O dono do catálogo é conferido de novo no worker.

O ZIP é escrito em `src/modules/export/zip.ts` (método STORE + `zlib.crc32`), sem biblioteca nova: vídeo já é comprimido. A escrita é protegida contra zip-slip e nomes repetidos, e o arquivo é validado com `unzip -t` no teste.

## OAuth das nuvens (`cloudOAuth.ts`)
- **Escopo mínimo:**
  - Google `https://www.googleapis.com/auth/drive.file` (só arquivos criados pelo app);
  - Dropbox `files.content.write` (app com pasta própria);
  - OneDrive `Files.ReadWrite.AppFolder` + `offline_access`.
  - **Nunca o drive inteiro.** Se o provedor conceder escopo a mais, a conexão é recusada (403 `scope_too_broad`), o token é revogado e nada é gravado.
- **`connect`:** `state` de uso único + PKCE (S256) no Redis por 10 min. O cliente recebe só a URL de autorização. `client_secret` e tokens nunca saem do servidor.
- **Tokens em envelope AES-256-GCM com chave do KMS** (`src/providers/kms.ts`):
  - cada gravação gera uma **chave de dados nova** (KMS `GenerateDataKey`), cifra o token e guarda `k1:<keyId>:<chave embrulhada>:<iv>:<tag>:<ct>`;
  - o **AAD** amarra o texto cifrado ao usuário, ao provedor e ao campo: copiar um token para outra linha não abre;
  - o `EncryptionContext` do KMS é `{purpose: cloud_token, provider}`;
  - em produção, `KMS_DRIVER=aws` usa a chave do stack (`module.secrets.kms_key_arn`; a role da task já tem `kms:GenerateDataKey/Decrypt`). Em dev/test, `KMS_DRIVER=local` deriva a chave mestra por HKDF.
- **`refresh` rotativo:**
  - renova quando faltam menos de 2 min ou quando o provedor responde 401 (renova uma vez e repete o upload);
  - o refresh token novo substitui o antigo. Microsoft e o mock giram a cada uso, e o teste prova que o refresh antigo morre no provedor;
  - há um lock por conexão no Redis: dois pedidos juntos geram um refresh só;
  - `invalid_grant` marca a conexão `expired` e devolve 409 `cloud_reauth_required`.
- **`revoke`:**
  1. avisa o provedor (melhor esforço: o Google e o Dropbox têm endpoint; a Microsoft não tem revogação de token avulso, então a tela indica `account.live.com/consent/Manage`);
  2. **apaga a linha**: os tokens deixam de existir no banco;
  3. grava a auditoria `cloud.revoke`.
- **LGPD:**
  - a exportação da conta lista as conexões **sem token** (nem cifrado) e os salvamentos;
  - a exclusão da conta revoga as conexões, apaga a Nuvem NexusReel (`archive/<userId>/`) e as duas tabelas.

## Endpoints (login; 404 sem `ff_save`, salvo as exceções acima)
| Método | Rota | Notas |
|---|---|---|
| GET | `/save/config` | Destinos, conexões (sem token), retenção, cota e uso |
| POST | `/projects/:projectId/save` | **Idempotency-Key obrigatória**. Corpo `{ destination }`. Aparelho, pasta ou iCloud: 200 com `url`, `fileName` e `flow`. Nuvem ou Nuvem NexusReel: 202 na fila. Limite de 60/h por usuário e por IP |
| GET | `/save/exports` · `/save/exports/:id` | Lista ou estado de um salvamento; link assinado de 24 h quando o arquivo está no `archive` |
| DELETE | `/save/exports/:id` | Apaga da Nuvem NexusReel antes do prazo |
| POST | `/catalogs/:catalogId/export` | ZIP por produto; **Idempotency-Key obrigatória**; JWT ou API key `catalogs:read`; limite de 10/h |
| GET | `/save/batches/:batchId` | Progresso do lote, com link de cada ZIP |
| GET | `/cloud/connections` | Estado e escopos (nunca token) |
| POST | `/cloud/:provider/connect` | URL de autorização; limite de 10 a cada 10 min |
| GET | `/cloud/:provider/callback` | Público (state + PKCE); classificado em `PUBLIC_ROUTE_DB_SCOPE` |
| DELETE | `/cloud/connections/:provider` | Revoga e apaga os tokens; **funciona com a flag desligada** |

`exportRoutes` é registrado **antes** de `projectsRoutes`, como no Módulo 4. `/projects/save` continua sendo só um id inválido (400).

## Segurança
- **R7 (logs):** nunca levam token, code, verifier nem corpo de resposta do provedor. O teste espiona o logger durante todo o fluxo.
- **R11 e R14:** toda chamada a provedor grava em `ai_usage`, com status ok ou erro. As operações são `cloud_oauth_exchange`, `cloud_oauth_refresh`, `cloud_oauth_revoke`, `cloud_upload`, `save_nexus_cloud` e `save_zip`. O circuit breaker é por provedor (`cloud:<provedor>`), e só falha temporária conta: um token expirado de um usuário não abre o circuito para todos. Com o circuito aberto, a resposta é 503 `cloud_unavailable`, com a sugestão de salvar na Nuvem NexusReel.
- **Fila:** 3 tentativas com backoff; depois vai para a DLQ `save-export-dlq` e a linha fica `failed` com o código do erro.
- **Produção:** com `CLOUD_MODE=mock` ou `KMS_DRIVER=local` e sem `ALLOW_STUBS_IN_PRODUCTION`, a conexão de nuvem responde 503 `cloud_not_configured`, sem travar o boot de quem não usa o módulo. `KMS_DRIVER=aws` sem `KMS_KEY_ID` impede o boot.
- **R13:** limites por usuário e por IP em salvar, ZIP e conectar.

## Critérios de aceite → evidência
| Critério | Teste |
|---|---|
| Salvar na galeria | Back: "aparelho": link de 24 h, `Content-Disposition`, bytes iguais ao original. Front: `saveToGallery` (iOS share sheet, Android Documents) e E2E |
| Salvar no Google Drive | "salvar no Google Drive": arquivo idêntico (sha256) em `/NexusReel/`, `external_url` e `ai_usage` |
| Salvar na Nuvem NexusReel | Bucket `archive`, 365/90 dias, upgrade estende, purge apaga o vencido, cota e apagar |
| ZIP em lote | "ZIP por produto": `unzip` lista `SKU.mp4`, `ficha.json` e `legenda.txt`, com o vídeo idêntico; API key funciona; também vai para o Drive |
| **Revogar apaga os tokens (SELECT)** | "REVOGAR APAGA OS TOKENS": `SELECT … FROM cloud_connections WHERE user_id=… AND provider='google_drive'` devolve `[]`, nenhuma linha guarda os textos cifrados antigos e o provedor invalida os tokens |
| Tabela `destination_exports`, não `export_jobs` | "a tabela criada é destination_exports" (`information_schema`) |
| Flag desligada = app idêntico | 404 em todas as rotas, projeto igual, nenhuma linha gravada, E2E sem botão, suíte inteira verde |

## Bibliotecas novas (justificativa em 2 linhas cada)
- **`@aws-sdk/client-kms`** (backend): o spec exige a chave em KMS. É o cliente oficial, da mesma família e versão do `@aws-sdk/client-s3` que já está no projeto, e só é carregado com `KMS_DRIVER=aws`.
- **`@capacitor/filesystem` e `@capacitor/share` 6.0.4** (frontend): o spec pede galeria via Capacitor Filesystem/Share. São plugins oficiais da mesma major do `@capacitor/core` já instalado, importados sob demanda (o bundle web não os carrega).

## Riscos e limites
- **Não verificável aqui:**
  - APIs reais do Google, Dropbox e Microsoft (sem rede externa e sem credenciais; o código segue a documentação, mas só o mock foi exercitado);
  - AWS KMS real;
  - `terraform validate` (terraform não está instalado);
  - gravação real na galeria em iPhone ou Android (sem aparelho);
  - staging e produção.
- **Dropbox:** limite de 150 MB por upload simples (os vídeos de até 60 s ficam bem abaixo). Sem escopo de compartilhamento não há link direto, então o link abre a pasta de apps.
- **CORS:** a gravação em stream na pasta exige CORS GET nos buckets. Sem ele, o cliente cai para o download normal (testado).
- **Android:** depende de o MediaStore indexar `Documents/NexusReel`. Se a galeria do fabricante não mostrar, a folha de compartilhar é o caminho.

## Como ligar (staging)
```sql
UPDATE feature_flags SET enabled = true, rollout_percent = 10 WHERE key = 'ff_save';
```
Antes, configure `CLOUD_MODE=real`, `KMS_DRIVER=aws` e `KMS_KEY_ID`, as credenciais dos três provedores e as URLs de callback `https://<api>/api/v1/cloud/<provider>/callback` nos consoles.
