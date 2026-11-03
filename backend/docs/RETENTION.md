# Retenção de dados

| Dado | Retenção | Mecanismo |
|---|---|---|
| Vídeos brutos de cena e último quadro (objetos com a tag `retention=raw-90d`, gravada pelo app) | 90 dias (30 d → Standard‑IA) | lifecycle S3 `raw-scenes-90d` (filtro por **tag**; antes o filtro por prefixo `projects/` expirava também o vídeo final) |
| Vídeo final, dublagens, áudio, legendas | enquanto o projeto existir | **excluir projeto** → job `project-purge` apaga `projects/<id>/`, os assets derivados e as fotos sem outro uso (`PROJECT_PURGE_DELAY_SEC`, padrão 0; varredura diária `deleted-projects-retention` como rede de segurança); exclusão da conta |
| Versões antigas de objetos (bucket `videos` versionado) | 7 dias | lifecycle S3 `noncurrent-7d` (o que foi excluído some de vez) |
| Exportações de dados (bucket `exports`) | 7 dias | lifecycle S3 + `expires_at` (link assinado de 7 dias) |
| Nuvem NexusReel (bucket `archive`, Módulo 5) | Free 90 dias · Pro/Business 365 dias (subir de plano estende; descer não encurta) | job `save-retention` (diário) + lifecycle S3 `archive-safety-net-400d` |
| ZIPs em lote para baixar (bucket `archive`, Módulo 5) | 7 dias | job `save-retention` |
| Tokens de nuvem do usuário (`cloud_connections`, Módulo 5) | até o usuário revogar ou excluir a conta (revogar = DELETE da linha) | `DELETE /cloud/connections/:provider` · exclusão de conta |
| Assets derivados (`derived/<user_id>/`, Módulo 6) | 30 dias (`ASSETS_TTL_DAYS`); o arquivo só é apagado quando nenhum asset válido do mesmo usuário ainda o usa (cache) | job `assets-retention` (diário) · exclusão de conta |
| Links de envio por e-mail (`email_shares`, Módulo 7) | o link vale 7 dias (HMAC + `expires_at`); o registro de auditoria fica até a exclusão da conta; o ZIP do lote vai para o bucket `exports` (some em 7 dias) | validade no link · lifecycle `expire-exports-7d` · exclusão de conta |
| Colaboração e timeline (Módulo 8) | enquanto o projeto existir; convites pendentes vencem em 7 dias; comentários do usuário são anonimizados na exclusão da conta ou a pedido | `DELETE …/collaborators/me` · `POST /collab/me/comments/anonymize` · exclusão de conta |
| Transcrições (`transcripts`, Módulo 9 — dado sensível, cifrado) | 90 dias (`TRANSCRIPT_RETENTION_DAYS`) ou até o projeto ser excluído (o que vier antes); prévias de edição e `agent_runs` ficam com o projeto | job `transcript-retention` (diário) · exclusão do projeto · exclusão de conta |
| Estimativas, séries, selos e lives (Módulo 10) | enquanto o projeto/conta existir; vídeo selado em `projects/<id>/sealed/` sai com o projeto; eventos da live (incluindo `ai_disclosure_shown`) ficam como registro de transparência até a exclusão da conta | exclusão do projeto (cascata) · exclusão de conta |
| Acessibilidade (Módulo 11): exportações de transcrição SRT/VTT/TXT | 90 dias (`TRANSCRIPT_RETENTION_DAYS`) | job `accessibility-retention` (diário) · exclusão do projeto/conta |
| Acessibilidade (Módulo 11): legendas animadas e audiodescrição | enquanto o projeto existir (texto cifrado) | exclusão do projeto (cascata) · exclusão de conta |
| Teleprompter (Módulo 11) | roteiro: até apagar a sessão/conta; gravação: fica NO APARELHO, e só existe no servidor se o usuário enviar (opt-in) | `DELETE /teleprompter/sessions/:id` (apaga o arquivo) · exclusão de conta |
| Uploads de fotos | até exclusão do projeto/conta | `deletePrefix('uploads', '<userId>/')` no hard delete |
| `generation_logs` | 30 dias | job `retention` (diário) |
| Logs da aplicação (CloudWatch) | 30 dias | `retention_in_days = 30` |
| `analytics_events` | 180 dias | job `retention` |
| `webhook_events` | 60 dias | job `retention` |
| `affiliate_clicks` (IP em hash) | 90 dias | job `purge-clicks` (diário); contadores agregados permanecem em `affiliate_links` |
| Refresh tokens | 30 dias (expiram) / revogados mantidos para detecção de reuso até expirar | `expires_at` |
| `audit_logs` | 5 anos (recomendado; ajuste conforme jurídico) | sem expurgo automático |
| `transactions`, `payout_requests` | 5 anos (obrigação fiscal) | anonimizados, nunca apagados |
| Backups do RDS | 14 dias (PITR) + snapshot final | `backup_retention_period` |
| Conta com exclusão agendada | 30 dias de carência | `deletion_requests` + job `due-deletions` (hora em hora) |

Os valores vivem em `RETENTION_DAYS` (`compliance.service.ts`), no Terraform (`modules/storage`, `modules/app`) e no job `retention` (`src/workers.ts`) — altere nos três lugares.

## Fase 7 (growth/dados)
Novas tabelas entram no job `retention` (`src/jobs/retention.ts`) e no export/eliminação LGPD (`compliance.service.ts`): eventos de recomendação, envios de ciclo de vida, atribuições de experimento, toques de atribuição, indicações, fingerprints de dispositivo e waitlist. No warehouse, só `pseudo_id`; eliminação de conta gera *tombstone* (`erasure_queue`).


> **Fase 8:** a política automatizada (com registro de execuções, vídeo final por plano, relatório mensal e anonimização do warehouse em 24 meses) está em `docs/COMPLIANCE/RETENTION_POLICY.md` e `src/workers/retention.ts`. Em caso de divergência, vale aquele documento.
