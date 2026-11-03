# Política de retenção de dados

Valores marcados em `RETENTION_DAYS` (rawVideos 90 · logs 30 · auditLogs 365 · deletionGrace 30); os demais são propostas a validar. Fonte: (`src/types/phase5.ts`) — ajustar após revisão jurídica.

| Dado | Retenção | Observação |
|---|---|---|
| Conta e perfil | Enquanto ativa; **30 dias** após pedido de exclusão (cancelável) | Depois: remoção definitiva |
| Projetos, cenas, vídeos e versões locais | Enquanto a conta existir | Removidos junto com a conta |
| Vídeos publicados em plataformas | Fora do controle do NexusReel | O usuário remove na plataforma; revogar acesso apaga o token |
| Tokens OAuth | Até revogação/desconexão/exclusão | Criptografados; renovados via refresh |
| Vídeos brutos de cenas (intermediários) | **90 dias** (`rawVideos`) | Vídeo final permanece com o projeto |
| Registros de consentimento | **5 anos** após término (proposta, a validar) | Prova de conformidade (mínimo necessário, sem conteúdo) |
| Trilha de auditoria | **365 dias** (`auditLogs`) | Sem dados pessoais além do id |
| Logs de aplicação | **30 dias** | JSON estruturado, redigido |
| Métricas agregadas | 13 meses | Sem identificação |
| Solicitações de exportação | 30 dias (link/arquivo) | Arquivo gerado sob demanda |
| Dados fiscais/transações | **5 anos** (obrigação legal) | Mesmo após exclusão da conta, anonimizados quando possível |
| Backups | Até 35 dias | Dados excluídos saem dos backups no ciclo seguinte |

Exclusão: soft-delete (flag + `deleteAt = now+30d`) → job diário `runDeletionJob` remove perfil, projetos, mídias, tokens; mantém apenas o que a lei exige.
