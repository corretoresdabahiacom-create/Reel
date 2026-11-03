# Módulo 8 — Colaboração + Timeline multi-track

**Flags:** `ff_collaboration` (convites, comentários, tempo real) e `ff_timeline` (timeline multi-track), ambas desligadas por padrão. Com as duas desligadas:
- todas as rotas abaixo respondem **404**;
- o WebSocket fecha com 4404;
- o app volta ao modo de um usuário só, idêntico ao atual: a lista de projetos, as rotas de projeto e as políticas de `projects` não mudaram.

**Migration:** `0017_collab_timeline` · **Testes:** `tests/30-collab-timeline.test.ts` (backend, com WebSocket real), `tests/collab.test.ts` (cliente) e `tests/e2e/drive-collab.cjs` (UI) · **Biblioteca nova:** `@fastify/websocket` (plugin oficial do Fastify sobre `ws`; mais leve que o Socket.IO e com o mesmo ciclo de vida, logs e autenticação do servidor).

## Matriz de permissões
Fonte única: `MATRIX` em `src/modules/collaboration/permissions.ts`. **Toda** operação, por REST ou WebSocket, passa por `assertCan` no servidor. O teste "matriz" confere que esta tabela e o código são iguais e exercita cada linha por HTTP e pelo socket.

<!-- matriz:inicio -->
| Ação | Owner | Editor | Viewer |
|---|---|---|---|
| Ver timeline (`timeline.view`) | ✅ | ✅ | ✅ |
| Editar timeline (`timeline.edit`) | ✅ | ✅ | ❌ |
| Comentar (`comment.create`) | ✅ | ✅ | ✅ |
| Resolver comentário (`comment.resolve`) | ✅ | ✅ | ❌ |
| Apagar comentário de outra pessoa (`comment.delete_any`) | ✅ | ❌ | ❌ |
| Convidar colaborador (`collaborator.invite`) | ✅ | ❌ | ❌ |
| Remover colaborador (`collaborator.remove`) | ✅ | ❌ | ❌ |
| Salvar versão / fork (`snapshot.create`) | ✅ | ✅ | ❌ |
| Restaurar versão (`snapshot.restore`) | ✅ | ✅ | ❌ |
| Excluir projeto (`project.delete`) | ✅ | ❌ | ❌ |
<!-- matriz:fim -->

**Regras de resposta:**
- quem não tem papel no projeto recebe **404**, sem revelar que o projeto existe;
- quem tem papel mas não tem a permissão recebe **403 `forbidden_role`**;
- excluir projeto continua sendo a rota original `DELETE /projects/:id`, protegida pela política "só o dono" de `projects`; para colaboradores ela responde 404.

## Convites
- **Token:** `<id>.<exp>.<HMAC>`, com chave derivada própria e validade de **7 dias**. No banco fica só o `sha256` do token, que é **apagado no aceite** (uso único).
- **Preso ao e-mail convidado:** no banco fica só o HMAC do e-mail. Um link encaminhado não funciona em outra conta (403 `invite_other_email`).
- **E-mail do convite:** vai pela fila com o endereço cifrado, e o log registra só o hash (como no Módulo 7).
- **Limites:** até 10 colaboradores por projeto. Domínios descartáveis são bloqueados. Um convite novo para o mesmo e-mail cancela o anterior.

## Tempo real (WebSocket `/api/v1/collab/ws`)
- **Login:**
  - `POST /collab/ws-ticket` devolve um JWT de **60 s** (audiência `nexusreel-ws`, `jti` de uso único, preso ao projeto);
  - o cliente envia `{type:'auth', token}` como **primeira mensagem**;
  - token na URL é **ignorado** (vaza em logs de proxy/CDN);
  - sem login em 5 s, a conexão fecha com 4401.
- **Mensagens:**
  - `op` (timeline): resposta `ack` ou `rejected`, mais transmissão para a sala;
  - `cursor` (efêmero);
  - `comment`;
  - `ping`.
- **Eventos do servidor:** `ready` (papel e presença), `presence` (entrou/saiu), `op`, `cursor`, `comment`, `snapshot`, `reload` (restauração).
- **Escala:** as salas usam pub/sub do Redis, então funcionam com várias instâncias da API.
- **Presença:** guardada em hash no Redis com expiração.
- **Colaborador removido ou que saiu:** é derrubado (4403) em todas as instâncias.
- **Proteções:** até 40 mensagens/s por conexão (4429) e 64 KB por mensagem (1009). As mensagens de uma conexão são processadas em ordem.

## Conflitos e versões
- Cada trilha e cada trecho tem `version`, e o cliente manda `baseVersion` em toda operação.
- **Propriedade** (`updateClip`, `setTrackProperty`): **last-write-wins**. A operação é aplicada, a resposta traz `conflict: 'lww'` e o valor sobrescrito fica guardado em `timeline_ops.overwritten`.
- **Estrutural** (`moveClip`, `removeClip`, `reorderClips`, `removeTrack`) com versão velha, ou alvo apagado por outra pessoa: **conflito crítico (409)**.
  - Nada muda, e a resposta traz o estado atual com `forkable: true`.
  - O cliente oferece "recarregar" ou "salvar a minha versão como cópia" (`POST …/timeline/fork`), que vira um snapshot `fork` restaurável.
- **Histórico:**
  - snapshot **automático** a cada `TIMELINE_SNAPSHOT_EVERY` edições (padrão 20), mais o **manual**;
  - **restaurar** guarda antes a versão atual (`restore`), então dá para desfazer, e todos recebem `reload`;
  - `timeline_ops` registra quem mudou o quê.
- **Concorrência:** as operações de um projeto ficam em fila (`timeline_meta FOR UPDATE`).

## Timeline
- **Trilhas:** vídeo, áudio, texto e efeitos, até 12 por projeto. Na primeira abertura o timeline é montado a partir das cenas:
  - vídeo: uma cena por trecho;
  - legendas: o texto das cenas;
  - áudio: narração e trilha;
  - efeitos: vazia.
- **Limites:** cada trilha pode ter até **120 s**. Trilha travada (`locked`) não aceita edição (423).
- **Reordenar** na trilha de vídeo encosta os trechos um no outro.
- **Funções pedidas no spec:** `addTrack`, `addClip`, `reorderClips` e `setTrackProperty`. Também existem mover, editar e remover trecho e remover trilha.

## Permissões no banco (RLS)
- A função `collab_can(projeto)` é verdadeira para o dono e para colaboradores aceitos.
- As tabelas novas (`timeline_*`, `comments`) usam essa função. Ela é `SECURITY DEFINER` só para ler `projects` (cuja política é "só o dono") e devolve um booleano.
- A política de **`projects` não mudou**. O colaborador vê título e vídeo pelo serviço, depois da checagem de papel.
- **Reauditoria (migration 0021):** antes, uma política única `ALL = collab_can` deixava o banco aceitar escrita de qualquer membro (inclusive `viewer`) — o app barrava, o banco não. Agora as políticas são por comando e espelham a MATRIX:
  - `timeline_tracks/clips/meta/snapshots`: leitura = membros; escrita = dono/editor (`collab_can_edit`). A montagem inicial da timeline no 1º acesso roda como sistema (o 1º acesso pode ser de um viewer).
  - `timeline_ops`: só acréscimo, sempre com `user_id` = quem está logado; ninguém altera nem apaga o histórico (só sistema).
  - `comments`: comentar só em nome próprio; editar o texto só o autor (trigger `comments_guard`); resolver = autor/dono/editor; apagar = autor ou dono.
  - `project_collaborators`: escrita só o dono (aceite e "sair" rodam como sistema).
  - Teste com SQL direto como `nexus_app`: `tests/35-rls-collab-reaudit.test.ts`.

## LGPD
- **Sair do projeto:** o colaborador sai a qualquer momento (`DELETE /projects/:id/collaborators/me`).
- **Anonimizar comentários:** `POST /collab/me/comments/anonymize` funciona sem a flag. O texto fica e o autor some.
- **Exclusão da conta:** remove as participações e anonimiza os comentários feitos em projetos de outras pessoas.
- **Exportação:** lista as participações e os comentários do usuário.
- **Auditoria em `audit_logs`:**
  - `collab.invite` (com hash do e-mail), `collab.accept`, `collab.remove`, `collab.leave`;
  - `collab.comment`, `collab.comment_delete`, `collab.comments_anonymized`;
  - `timeline.fork`, `timeline.restore`.

## Critérios de aceite → evidência
| Critério | Teste |
|---|---|
| Convidar 2 colaboradores | Editor + viewer convidados e aceitos; o link encaminhado e o token reusado são recusados |
| Ver edições em tempo real | 3 sockets na sala: a operação do editor chega ao dono e ao viewer, com presença e cursor |
| Conflito resolvido ou fork oferecido | Propriedade com versão velha dá LWW (valor sobrescrito guardado); mover um trecho apagado dá 409 com `forkable` e o fork vira snapshot restaurável |
| Comentário ancorado em timestamp | Comentário em `timeMs` com `clipId`, transmitido pelo socket |
| **Viewer não edita (servidor)** | Viewer manda `op` pelo socket e recebe `rejected` 403, a revisão não muda e nada é gravado; o mesmo vale por REST |
| Matriz implementada e documentada | O teste compara esta tabela com `MATRIX` e exercita as ações |
| Flags desligadas = app idêntico | 404, o WebSocket fecha com 4404, projeto igual, E2E sem barra de colaboração |

## Riscos e limites
- **Edição de texto ao mesmo tempo:** não há edição colaborativa caractere a caractere (CRDT/OT). O modelo é por operação, com LWW e fork, como pede o spec.
- **Cursores e presença:** são efêmeros (Redis). Se o Redis cair, a edição continua por REST.
- **Não verificável aqui:** várias instâncias reais atrás de um balanceador (o pub/sub foi testado com uma instância e um Redis real), staging e produção.
