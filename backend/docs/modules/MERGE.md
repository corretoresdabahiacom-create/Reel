# Módulo 4 — União de vídeos (2×60 s com transição)

**Flag:** `ff_merge` (desligada por padrão). Com a flag desligada:
- as rotas abaixo respondem **404**;
- a Biblioteca não mostra "Unir dois vídeos";
- a resposta dos projetos não ganha campo nenhum.

**Migration:** `0013_merge` · **Testes:** `tests/26-merge.test.ts` (11) e `tests/e2e/drive-merge.cjs` no frontend (22 verificações) · **Fila:** `merge-projects` (o `merge:projects` do spec; o BullMQ não aceita `:`), com DLQ.

## Objetivo
- **Unir dois projetos** de até 60 s num vídeo de até 120 s.
- **Escolher a transição pela emenda:** mede a luz, as cores e o movimento no fim do 1º e no começo do 2º.
- **Normalizar automaticamente:** codec (H.264/yuv420p), FPS, resolução, taxa de amostragem (44,1 kHz) e canais (estéreo).
- **Replanejar o áudio:** cada parte é nivelada em -16 LUFS antes da emenda (as duas ficam no mesmo nível), as partes se cruzam na transição e o resultado final sai em -14 LUFS.

## Como funciona (`mergeService.ts`)
| Etapa (`project_merges.stage`) | Função | O que faz |
|---|---|---|
| `normalize` (10%) | `normalizeInputs` | Alvo comum: proporção do 1º vídeo, maior resolução (lado ≤ 1920), maior FPS (≤ 30). A proporção diferente vira barras. Vídeo sem áudio recebe silêncio. Loudness das duas partes igualado |
| `analyze` (40%) | `generateTransition` | `signalstats` (luz média e diferença entre quadros) + cor média no último segundo de A e no primeiro de B |
| `transition` / `audio` (55–70%) | `render` | `xfade` no vídeo + `acrossfade` no áudio, depois loudnorm em duas passadas para -14 LUFS |
| `finalize` (90%) | `mergeProjects` | Cria um **projeto novo** (`status=ready`, `versions=['merge']`) com o vídeo unido; grava transição, motivo e medidas |

- **Regra da transição automática** (explicável, gravada em `project_merges.analysis.reason`):
  - diferença de luz > 60 → `fadeblack`;
  - movimento > 8 → `slideleft`;
  - distância de cor > 80 → `dissolve`;
  - caso contrário → `fade`.
  - O usuário pode escolher outra: `fade`, `fadeblack`, `dissolve`, `slideleft`, `smoothleft`, `circleopen` ou `zoomin`.
- **Origem do vídeo unido:** a fonte de verdade é `project_merges.result_project_id`. **Não há `mergedFrom` em `projects`**; o teste confere que não existe coluna com "merge" no nome.
- **Originais intactos:** o worker só lê os vídeos finais de A e B. O teste compara o hash dos arquivos e as linhas dos dois projetos.
- **Idempotência:**
  - o POST exige `Idempotency-Key`;
  - o worker ignora uniões já concluídas;
  - o id do projeto resultante é derivado da união, então um retry depois do upload reaproveita o mesmo arquivo.

## Rota e ordem de registro
- `POST /api/v1/projects/:projectId/merge` fica no plugin `mergeRoutes`, **registrado antes de `projectsRoutes`** em `src/app.ts`:
  ```
  for (const r of [authRoutes, usersRoutes, uploadsRoutes, mergeRoutes, projectsRoutes, …]) await api.register(r);
  ```
- O roteador (find-my-way) já distingue `/projects/:id` de `/projects/:projectId/merge` pelo número de segmentos. A ordem garante que nenhuma rota futura com um segmento a mais em `projectsRoutes` sombreie a de união.
- **Provas** (`audit/evidence/module4/route-tree.txt` e o teste "roteamento"):
  - o log HTTP mostra `route: "/api/v1/projects/:projectId/merge"` para `POST …/merge`;
  - `GET /api/v1/projects/merge` cai em `/projects/:id` e responde 400 (id inválido), sem nunca acionar a união;
  - `GET/PATCH/DELETE /projects/:id` continuam respondendo.

## Endpoints (login; 404 sem `ff_merge`)
| Método | Rota | Notas |
|---|---|---|
| POST | `/projects/:projectId/merge` | **Idempotency-Key obrigatória**; 202. Corpo: `otherProjectId`, `order` (`this_first`/`other_first`), `transition` (`auto` ou um tipo), `title`. **Projeto de outro usuário → 403 `merge_forbidden`**. Limite de 10/h por usuário e por IP |
| GET | `/projects/:projectId/merge/:mergeId` | Etapa, progresso, transição, motivo, medidas, duração, LUFS e URL assinada (24 h) do vídeo unido |
| GET | `/merges` | Uniões do usuário |
| GET | `/merges/config` | Transições e limites |

## Segurança
- **Mesmo dono:** os dois projetos são buscados como system e o dono é comparado no servidor, para devolver **403** explícito (o RLS sozinho daria 404). O worker confere de novo.
- **URLs:** só assinadas (24 h); o original nunca sai sem assinatura.
- **`ai_usage`:** `merge_transition` (análise) e `merge_render`, com provedor `local`.
- **RLS:** `project_merges` só para o dono.
- **R13:** 10 uniões por hora por usuário e por IP. O render é pesado, e o teste confere o 429.

## Critérios de aceite → evidência
| Critério | Teste |
|---|---|
| Unir dois de 60 s → 120 s | "dois vídeos de 60 s viram um de ~120 s": 119 s ≤ `MERGE_MAX_SEC` |
| Transição coerente | "une claro + escuro": luz muito diferente vira `fadeblack`, com motivo e medidas. Vídeos parecidos viram `fade`. A escolha do usuário é respeitada (`circleopen`) |
| Áudio nivelado | Entradas com cerca de 30 dB de diferença viram duas metades a até 1,5 LU uma da outra, com o total em -14 ±1 LUFS |
| Normalização | 360x640@12 (mono, 22 kHz) + 720x1280@30 (mono, 48 kHz) = 720x1280@30, AAC 44,1 kHz estéreo; vídeo sem áudio recebe silêncio |
| Originais inalterados | Hash dos arquivos e linhas dos projetos A e B iguais |
| Outro usuário → 403 | Nos dois sentidos (dele como 1º ou como 2º); nenhuma união criada |
| Flag desligada = app idêntico | 404 nas rotas, projeto sem campos novos, E2E sem botão, suíte inteira verde |

**Desempenho medido:** dois vídeos de 6 s em resoluções diferentes levam cerca de 13 s; 60 s + 60 s em 360x640 levam cerca de 55 s (2 vCPU, inclui normalização e duas passadas de loudness).

## Riscos e limites
- **Transição heurística:** a análise mede luz, cor e movimento e escolhe entre transições prontas do FFmpeg; não gera quadros novos. Uma transição generativa exigiria um provedor de vídeo.
- **Trilha unificada:** o "replanejamento" iguala o nível das partes e cruza o áudio na emenda. Uma trilha única por cima das duas partes pode vir do Módulo 1, mixando o projeto resultante, mas não é automático.
- **Proporções diferentes:** a proporção do 1º vídeo vence e o 2º recebe barras.
- **Não verificável aqui:** staging e produção e Testcontainers.

## Como ligar (staging)
```sql
UPDATE feature_flags SET enabled = true, rollout_percent = 10 WHERE key = 'ff_merge';
```
