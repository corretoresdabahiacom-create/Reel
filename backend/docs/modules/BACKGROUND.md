# Módulo 2 — Edição de fundo (remoção, troca, outpainting)

**Flag:** `ff_background` (desligada por padrão). Com a flag desligada:
- todas as rotas abaixo respondem **404**;
- o editor de cena não mostra "Editar fundo";
- nenhuma linha recebe `scenes.selected = true`, então a leitura das cenas fica idêntica.

**Migration:** `0011_background` · **Testes:** `tests/24-background.test.ts` (14) e `tests/e2e/drive-background.cjs` no frontend (27 verificações) · **Fila:** `background-edit` (+ `background-edit-dlq`).

## Objetivo
- **Remover fundo** de vídeo e de foto com borda suave (alfa parcial), preservando parte de cabelo, pelos e translúcidos.
- **Trocar o fundo** por um gerado a partir de texto ("cozinha moderna", "escritório") ou por uma imagem enviada pelo usuário.
- **Outpainting:** expandir 9:16 → 16:9, 1:1 ou o inverso sem cortar produto ou pessoa.
- **Fundo novo para foto de produto sem cenário:** é a troca por texto aplicada à foto (`target: "photo"`).

## Como funciona
```
App (BackgroundEditor, atrás de ff_background)
  │  PATCH /projects/:projectId/scenes/:sceneId/background  (Idempotency-Key)  → 202 { editId }
  ▼
backgroundService ─► fila BullMQ "background-edit" (retry exponencial 3×, DLQ, métricas genéricas)
                        │
                        ▼ worker → bgProviders (breaker R14 + ai_usage R11) → engine.ts (FFmpeg local)
                        │   remove:   colorkey com borda suave → PNG/WebM com alfa + MP4/PNG sobre cor sólida
                        │   replace:  fundo gerado (paleta pelo prompt) ou enviado + primeiro plano recortado
                        │   outpaint: quadro original inteiro no centro + laterais com extensão desfocada
                        ▼
              NOVA linha em scenes (version = maior da posição + 1, derived_from_scene_id = origem)
```
- **Original nunca sobrescrito:** o worker só **lê** a mídia de origem e grava os resultados em `projects/<id>/background/<editId>/`.
  - Os testes comparam o SHA-256 do vídeo e da foto originais no storage antes e depois de 7 edições.
  - Também conferem que a linha original em `scenes` não muda.
- **Versão da cena:** cada edição cria uma linha nova com `version = maior versão da posição + 1`.
  - Editar a partir de uma versão antiga também funciona: a origem fica registrada em `derived_from_scene_id`.
  - A versão nova passa a ser a atual.
- **Seletor de versões / reverter:** `PUT .../scenes/:sceneId/current` marca aquela linha como a versão em uso da posição (`scenes.selected`). Nenhuma mídia muda e nada é apagado.
  - Regra de leitura (`projectsRepo.scenes`): por posição, a versão marcada; sem marcação, a de maior número. Vale para o projeto, a montagem, a publicação e a dublagem.
- **Vídeo final:** a versão em uso entra no vídeo na **próxima montagem**. O vídeo final já montado não é tocado.
- **Rota:** segue o padrão pedido, `/projects/:projectId/scenes/:sceneId/background`.

## Endpoints (login; 404 se `ff_background` estiver desligada)
| Método | Rota | Notas |
|---|---|---|
| GET | `/background/config` | Banner de processamento, operações, formatos e mensagens (pt-BR/en/es) |
| PATCH | `/projects/:projectId/scenes/:sceneId/background` | **Idempotency-Key obrigatória**; 202. Corpo: `operation` (`remove`, `replace` ou `outpaint`), `target` (`video` ou `photo`), `photoIndex`, `prompt`, `backgroundRef` (upload do próprio usuário), `aspect` (`16:9`, `9:16` ou `1:1`), `fill` (cor para a versão sem alfa). Limite de 30/h por usuário e por IP |
| GET | `/projects/:projectId/scenes/:sceneId/versions` (também com `ff_elements`, Módulo 3) | Todas as versões da posição, a atual, a edição de cada uma (vídeo, fotos e alfa em URL assinada de 24 h) e as edições pendentes ou com falha |
| PUT | `/projects/:projectId/scenes/:sceneId/current` | Seletor de versões / reverter (idempotente por ser PUT) |
| GET/POST/DELETE | `/consents/external-provider` | Consentimento para enviar mídia a provedor externo (R6). POST com Idempotency-Key. Existe se `ff_audio` ou `ff_background` estiver ligada |

## Migration `0011_background` (só acréscimos)
- **`background_edits`:** id, project_id, scene_id, operation, source_media_url, result_media_url, derived_scene_id, provider, status, created_at e mais:
  - `target`, `params`, `result_alpha_url`;
  - `error_code`, `updated_at`.
- **RLS:** herdado do projeto.
- **`scenes.selected`:** `boolean NOT NULL DEFAULT false`. Instantâneo, porque o default é constante. Com tudo `false`, a leitura é igual à de antes.
- **Rollback:** `npm run migrate:down`. Recusa reverter se houver edições ou versão escolhida. As cenas derivadas ficam; só o histórico e a escolha somem.

## Regras globais
| Regra | Como |
|---|---|
| R1 flag | `requireBackground()` em todas as rotas; frontend com `ffOn()` estrito |
| R2 original intacto | Nova linha em `scenes`; hash do arquivo original no storage idêntico antes e depois (teste 24) |
| R3 fila | `background-edit` com retry exponencial, DLQ e métricas; idempotente (edição concluída não refaz, e a cena derivada é criada uma vez, com lock por posição) |
| R4 server-side | Provedor só no servidor; o cliente recebe só URLs assinadas |
| R5 URLs | `BACKGROUND_URL_TTL_SEC=86400` (24 h) |
| R6 consentimento | `external_provider` exigido antes de enviar mídia quando o provedor configurado é externo; o mock roda local. Endpoint de aceite e revogação com timestamp, versão, hash de IP/UA e prova |
| R7 logs | Só IDs, operação, alvo, duração e provedor (`grep logger` em `audit/evidence/module2/checks.txt`) |
| R8 aditivo | Tabela nova + coluna com default; `lock_timeout` de 5 s |
| R11 ai_usage | `bg_remove`, `bg_generate`, `bg_replace`, `bg_outpaint`, com ok/erro |
| R12 idempotência | PATCH com chave obrigatória: replay devolve o mesmo `editId`, e não há edição duplicada |
| R13 rate limit | Por usuário e por IP |
| R14 breaker | 3 falhas abrem `cb:open:background:mock` (separado de vídeo e áudio); a edição fica `failed` com `background_unavailable` |
| R15 LGPD | Arquivos em `projects/<id>/`, apagados com a conta; exportação inclui `backgroundEdits` (teste 24) |

## Critérios de aceite → evidência
| Critério | Verificado por |
|---|---|
| Remover fundo de 1 vídeo e de 1 foto | Teste 24: no vídeo, canto vira a cor de preenchimento, centro mantém o sujeito e o WebM com alfa é gerado; na foto, PNG com canto alfa 0 e centro 255. Teste unitário: borda fina com alfa parcial |
| Substituir por prompt | Teste 24: "cozinha moderna" muda o fundo e mantém o sujeito; também testado com upload próprio (aceito) e alheio (422) |
| Expandir 9:16 → 16:9 | Teste 24: 360x640 vira 1138x640, com o sujeito no centro, a borda superior original preservada e as laterais preenchidas |
| Reverter (seletor de versões) | Teste 24: volta para a original, depois para a v3, e o projeto passa a usar a escolhida; nenhuma linha apagada. E2E: "voltar para a original" e "usar esta" |
| Original nunca sobrescrito | Hash SHA-256 do vídeo e da foto originais no storage, antes e depois de 7 edições |
| Com a flag OFF, app idêntico | 6 rotas → 404; projeto e cenas sem mudança; E2E sem o botão; suíte inteira verde |

**Desempenho medido** (vídeo de 10 s em 1080x1920@30, 2 vCPU):
- remover: 20,1 s (inclui o WebM VP9 com alfa);
- trocar: 12,0 s;
- expandir para 16:9: 12,3 s, com o lado maior limitado a 1920. Sem esse limite a saída seria 3414x1920 e levava 32 s.

## Riscos e limites
- **Matting simplificado:** o motor local recorta por cor do fundo estimada pelas bordas. Funciona em fundo liso (foto de produto, estúdio). Fundo complexo e cabelo realista exigem um provedor de matting e inpainting com IA (modelo próprio tipo MODNet/BiRefNet ou API).
  - A interface `BackgroundProvider` está pronta para isso.
  - O contrato precisa vetar treino com a mídia do usuário, o que **não é verificável** aqui.
- **"Outpainting" local:** as laterais são preenchidas por extensão desfocada da própria imagem, não por geração. Nada é cortado; inpainting generativo depende do provedor real.
- **Fundo gerado:** no mock, é um gradiente com paleta por tema, não uma cena fotográfica.
- **Vídeo final:** só reflete a versão nova depois de remontar. O botão "remontar" do app já existe; a nova versão não dispara a montagem sozinha.
- **Não verificável aqui:** staging e produção, provedor externo real e Testcontainers.

## Como ligar (staging)
```sql
UPDATE feature_flags SET enabled = true, rollout_percent = 10 WHERE key = 'ff_background';
```
