# Módulo 3 — Inserção de elementos (pessoa, animal, objeto)

**Flag:** `ff_elements` (desligada por padrão). Com a flag desligada:
- todas as rotas abaixo respondem **404**;
- o editor de cena não mostra "Inserir elemento";
- as cenas não ganham o campo `insertedElements` no JSON.

**Migration:** `0012_elements` · **Testes:** `tests/25-elements.test.ts` (13) e `tests/e2e/drive-elements.cjs` no frontend (30 verificações) · **Fila:** `elements-insert` (+ `elements-insert-dlq`).

## Objetivo
- **Inserir uma pessoa real** em cena, a partir de foto de referência, **só com consentimento `person_image` verificado**. A pessoa pode ser o próprio usuário.
- **Inserir animais** (pet ao lado do produto) e **objetos** (celular na mão, tênis na rua).
- **Substituir elementos existentes:** mudar a cor de uma região, como a roupa, ou **remover um objeto** do fundo.

## Como funciona
```
App (ElementInserter, atrás de ff_elements)
  │  POST /projects/:projectId/scenes/:sceneId/elements   (Idempotency-Key)
  ▼
elementInserter.request
  1. flag → cena do usuário
  2. PESSOA: consentimento person_image verificado, ativo e do próprio usuário — ANTES de qualquer outra coisa.
     Sem ele: 403, sem gravar linha, sem enfileirar e sem chamar o provedor
  3. referência (upload do próprio usuário, imagem válida) / região (substituição)
  4. external_provider, se o provedor for externo
  ▼ fila BullMQ "elements-insert" (retry exponencial, DLQ, métricas genéricas)
worker → confere o consentimento DE NOVO (pode ter sido revogado) → elProviders (breaker R14, ai_usage R11, log de chamada) → engine.ts
  │   inserir:    recorta o fundo da referência (borda suave do Módulo 2) e compõe na posição e escala, com sombra
  │   recolorir:  gira o matiz só dentro da região (ex.: roupa)
  │   remover:    preenche a região a partir das bordas (interpolação)
  ▼
NOVA linha em scenes (version = maior + 1, derived_from_scene_id) com o elemento em inserted_elements
```
- **`insertedElements`:**
  - Formato de cada item: `{ type: 'person' | 'animal' | 'object', referenceImageUrl, description, resultUrl, status }`, mais `action`, `mode` e `insertionId`.
  - Fica na nova linha. A lista acumula: a versão nova herda os elementos da versão de origem.
  - No banco é `jsonb` com default `[]`. **Cenas antigas leem como lista vazia**, e a API do projeto só mostra o campo quando ele não está vazio, sem as referências cruas.
  - As URLs assinadas aparecem só no endpoint de versões.
- **Versões e seletor:** os endpoints do Módulo 2 (`GET .../versions`, `PUT .../current`) passam a valer com `ff_background` **ou** `ff_elements`. A edição de fundo continua só com `ff_background`.
- **Original nunca sobrescrito:** o worker só lê a mídia de origem; os testes conferem o hash no storage.

## Endpoints (login; 404 sem `ff_elements`)
| Método | Rota | Notas |
|---|---|---|
| GET | `/elements/config` | Aviso de processamento, tipos, modos e mensagens (pt-BR/en/es) |
| POST | `/projects/:projectId/scenes/:sceneId/elements` | **Idempotency-Key obrigatória**; 202. `action: "insert"` com `type`, `referenceRef`, `consentId` (pessoa), `position`, `scale`, `description`, `target` (`video`/`photo`). `action: "replace"` com `mode` (`recolor`/`remove`), `region {x,y,w,h}` e `hue`. Limite de 30/h por usuário e por IP |
| GET | `/projects/:projectId/scenes/:sceneId/elements` | Inserções e substituições da posição, com status |
| GET/POST | `/elements/person-consents` | Lista; abre consentimento (Idempotency-Key) e devolve a frase única |
| POST | `/elements/person-consents/:consentId/confirm` | Frase digitada (sem diferenciar maiúsculas nem acentos) + `evidenceRef` opcional (upload do próprio usuário); grava `verified_at` |
| DELETE | `/elements/person-consents/:consentId` | Revoga; inserções pendentes passam a falhar sem chamar o provedor |

## Migration `0012_elements` (só acréscimos)
- **`element_insertions`:** id, project_id, source_scene_id, derived_scene_id, type, reference_url, description, result_url, provider, status, created_at, e mais `action`, `mode`, `params`, `consent_id`, `error_code` e `updated_at`.
  - **RLS:** herdado do projeto.
- **`scenes.inserted_elements`:** `jsonb NOT NULL DEFAULT '[]'`, instantâneo.
- **`consents.evidence_url`:** autorização opcional do `person_image`. Guarda a chave no storage, nunca uma URL pública.
- **Rollback:** recusa reverter se houver inserções, cena com elemento ou evidência enviada.

## Pessoa real sem consentimento → 403 e nada sai do servidor (Checkpoint 3)
Teste `PESSOA sem consentimento…` com 4 tentativas:
- sem `consentId`;
- `consentId` inexistente;
- consentimento pedido mas não confirmado;
- consentimento **confirmado de outro usuário**.

Todas devolvem `403 person_consent_required` e **não mudam**:
- o contador de chamadas do provedor;
- as linhas de `ai_usage`;
- as linhas de `element_insertions`;
- os jobs da fila;
- o **log**: nenhuma linha `elements.provider.call`, conferido com espião no logger. Toda ida ao provedor escreve essa linha, com só o provedor, a operação e o ID do projeto.

Com o consentimento confirmado, a inserção da pessoa gera **exatamente 1** chamada e 1 log. Se o consentimento for revogado depois de enfileirar, o worker recusa **sem** chamar o provedor (teste "consentimento revogado depois de enfileirar"). No app, o E2E confere no painel de debug que as tentativas bloqueadas não geram `elements.provider.call`.

## Regras globais
| Regra | Como |
|---|---|
| R1 flag | `requireElements()`; no app, `ffOn()` estrito |
| R2 original | Nova linha em `scenes`; hash do vídeo e da foto originais idêntico |
| R3 fila | `elements-insert` com retry, DLQ e métricas; idempotente, com lock por posição |
| R4 / R5 | Provedor só no servidor; URLs assinadas de 24 h no endpoint de versões |
| R6 | `person_image` (frase única, upload opcional, timestamp, hash de IP/UA, prova) e `external_provider` |
| R7 logs | Só IDs, operação, tipo, duração e provedor (`audit/evidence/module3/checks.txt`) |
| R8 | Tabela nova + 2 colunas nulas ou com default; `lock_timeout` |
| R11 | `element_insert`, `element_recolor` e `element_remove`, com ok/erro |
| R12 | Idempotency-Key no POST de inserção e no de abrir consentimento |
| R13 | Por usuário e por IP |
| R14 | Breaker próprio `cb:open:elements:mock`; falha vira `elements_unavailable` |
| R15 | Arquivos em `projects/<id>/elements/`; exportação inclui `elementInsertions` e indica se há evidência, sem expor o arquivo |

## Critérios de aceite → evidência
| Critério | Teste |
|---|---|
| Inserir pessoa com consentimento | `consentimento person_image…`: frase errada → 422, evidência de outro usuário → 422, frase certa → verificado e pessoa inserida |
| Inserir pet | `inserir ANIMAL no vídeo…`: elemento visível na posição (cor do pixel), sujeito original preservado |
| Inserir objeto | `inserir OBJETO na foto…`: os elementos se acumulam na nova versão |
| Remover objeto do fundo | `substituir…`: a região volta à cor do fundo; recolorir muda só a região |
| Sem consentimento, pessoa não é inserida | 403 e zero envio (ver seção acima) |
| `insertedElements` não quebra cenas antigas | Flag desligada: sem o campo no JSON e `[]` no banco; ao reverter para a original, o campo some de novo |
| Flag desligada = app idêntico | 6 rotas → 404; E2E sem o botão; suíte inteira verde |

## Riscos e limites
- **Composição local sem IA:** o motor recorta a referência pela cor do fundo (fundo liso funciona melhor) e cola com sombra. Não ajusta luz, perspectiva nem oclusão. "Remover objeto" interpola a partir das bordas, sem inpainting generativo.
  - Provedores reais entram pela interface `ElementsProvider`.
  - O contrato precisa vetar treino com as referências, o que **não é verificável** aqui.
- **O consentimento não prova identidade:** é uma declaração do usuário (frase digitada + autorização opcional).
- **Mudar cor:** gira o matiz da região inteira, inclusive de pele e fundo dentro dela. A segmentação semântica da roupa depende do provedor real.
- **Não verificável aqui:** staging e produção e Testcontainers.

## Como ligar (staging)
```sql
UPDATE feature_flags SET enabled = true, rollout_percent = 10 WHERE key = 'ff_elements';
```
