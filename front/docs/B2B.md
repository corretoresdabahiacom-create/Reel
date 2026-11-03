# Painel B2B

**Acesso:** Perfil → Modo Business (plano Business; no protótipo há botão de ativação simulada).

**Fluxo:** Catálogos → wizard (1 dados, 2 CSV, 3 template padrão, 4 revisão) → Gerar vídeos em lote → Fila → Publicar em lote.

**CSV** (`services/b2b/csvParser.ts`): colunas `nome, descricao, preco, categoria, fotos, sku`; separador `,` ou `;`; fotos separadas por `|`. Obrigatórias: `nome` e `preco`. Preço aceita `R$ 1.299,90`. Erros por linha (nome vazio, preço inválido, SKU duplicado) bloqueiam a linha; avisos (categoria desconhecida, SKU gerado) não.

**Limites:** `planLimits` (Free 3, Pro 40, Business 100 vídeos/mês, configurável no Admin). O lote é recusado se estourar o limite.

**Fila:** no protótipo, fila em memória com 2 itens em paralelo, pausar/retomar e retry por item. Em produção troque por BullMQ/Redis (`generateBatch` marca o ponto: `queue.add`). Publicação em lote reutiliza `publish()` da Fase 3, com falha isolada por item e plataforma.

**API:** `POST /api/v1/catalogs/{id}/generate` com `Authorization: Bearer nxr_live_…` (escopo `catalogs:generate`). Resposta `202 { batchId, status }`. Stub: veja `server/index.ts`. Guarde apenas o hash da chave.
