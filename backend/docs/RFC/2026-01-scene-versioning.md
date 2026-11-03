# RFC 2026-01 — Versionamento de cenas (R2)

**Status:** aceita (Módulo 0) · **Migration:** `0008_module0_preparation` · **Afeta:** `scenes`

## Problema
A regra R2 pede que o original nunca seja sobrescrito: toda edição (fundo, elementos, áudio…) grava uma **linha nova** em `scenes`, com `derived_from_scene_id` apontando para a cena de origem e `version = origem.version + 1`. Hoje `scenes` tem `UNIQUE (project_id, index)`, que impede duas linhas na mesma posição do projeto. Além disso, `projectsRepo.scenes()` faz `SELECT * … ORDER BY index` e devolveria todas as versões.

## Decisão
1. **Módulo 0 (schema):** trocar a unicidade por `UNIQUE (project_id, index, version)` e acrescentar `version` (padrão 1, `CHECK >= 1`) e `derived_from_scene_id` (FK para `scenes(id)`, `ON DELETE SET NULL`, índice parcial). Como hoje toda linha tem `version = 1`, a nova regra é equivalente à antiga: nenhuma consulta, rota ou tela muda. Nenhum código usa `ON CONFLICT (project_id, index)` (verificado).
2. **Leitura — antecipada para o Módulo 0** (decisão do Checkpoint 0, para eliminar o risco de cenas repetidas): `projectsRepo.scenes()` devolve, por posição, só a versão de maior número (`DISTINCT ON (index) … ORDER BY index, version DESC`), e `sceneVersions()` lista o histórico. A versão anterior continua no banco para histórico e "desfazer". Hoje o resultado é idêntico, porque só existe a versão 1; a partir daqui, qualquer módulo que crie derivados já é lido corretamente.
3. **Sem travar a tabela** (risco de volume alto): a troca da unicidade fica na migration 0009, sem transação. O índice é criado com `CONCURRENTLY` e anexado com `ADD CONSTRAINT … USING INDEX`, e as constraints entram `NOT VALID` e são validadas depois. Detalhes e medições estão em `docs/modules/MODULE_0_PREPARATION.md`.
4. **R8 (sem DROP):** a única remoção é a constraint de unicidade antiga, trocada por uma mais ampla no mesmo bloco atômico. Nenhuma coluna ou dado é removido, e o rollback a recria.
5. **Regeneração existente** (`updateScene`, refazer uma cena) continua atualizando a linha no lugar: é o fluxo de geração da Fase 1, não uma edição do usuário sobre um resultado pronto. Trocar isso fica fora do escopo e exigiria outra RFC.

## Alternativas descartadas
- **Tabela separada `scene_versions`:** mais isolada, mas contraria o texto da R2 ("nova linha em `scenes`") e duplica o RLS e o worker de geração.
- **Coluna `is_current` com unicidade parcial:** exige atualizar duas linhas a cada edição (condição de corrida) e não acrescenta nada à ordenação por `version`.

## Riscos e rollback
- **Leitura duplicada:** eliminada no Módulo 0. O teste `tests/22` cria uma versão derivada e confirma que a API mostra só a mais recente, sem campo novo no JSON.
- **Rollback:** `0009…down.sql` volta à unicidade antiga, sem travar a tabela, e `0008…down.sql` remove as colunas. Os dois **recusam** reverter se existir alguma cena com `version > 1` ou com `derived_from_scene_id`, para não apagar edições em silêncio.

## Impacto
- **SLO e desempenho:** nenhum hoje. A leitura `DISTINCT ON` usa o índice da unicidade `(project_id, index, version)`, então não há varredura extra.
- **Custo:** cada edição guarda um vídeo novo no storage. A retenção das versões antigas segue a política LGPD que já existe (`src/workers/retention.ts`) e será configurada no Módulo 5.
- **Privacidade:** as versões herdam o RLS do projeto; a exclusão de conta apaga todas (`ON DELETE CASCADE` via projeto).

## Plano de rollout
1. Módulo 0 aplica o schema (sem efeito visível).
2. O Módulo 2 cria derivados só com `ff_background` ligada, primeiro para usuários internos e depois por percentual.
3. Rollback de código: desligar a flag. Rollback de schema: só depois de tratar os derivados (o `down` recusa antes disso).

## Atualização — Módulo 2 (escolha manual de versão)
O seletor de versões do Módulo 2 precisa de um "reverter" que **não crie mídia nova nem apague nada**. Para isso, a migration `0011_background` acrescenta `scenes.selected` (`boolean NOT NULL DEFAULT false`, instantâneo). A leitura passa a ser `DISTINCT ON (index) … ORDER BY index, selected DESC, version DESC`:
- vale a versão marcada; sem marcação, a de maior número;
- com tudo `false`, o resultado é idêntico ao do Módulo 0.

Uma edição nova limpa a marcação da posição, então a versão recém-criada vira a atual.
