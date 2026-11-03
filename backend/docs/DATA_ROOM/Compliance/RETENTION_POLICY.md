# Política de retenção automatizada

Implementação: `src/workers/retention.ts` (`RETENTION_POLICY`) — job diário `policy-retention` (fila `ops`), cada execução gravada em `retention_runs` (`GET /admin/ops/compliance/retention/report`) e usada no relatório mensal de compliance. Modo seco: `POST /admin/ops/compliance/retention/run {"dryRun":true}`.

| Dado | Retenção | Enforcement |
|---|---|---|
| Vídeos brutos de cena | 90 dias | lifecycle S3 (`raw-scenes-90d`); worker **reporta** cenas além do prazo |
| Vídeo final | Free 365 d / Pro e Business 730 d | **somente relatório** (`eligibleForExpiryReportOnly`): expurgar exige aviso prévio ao usuário e decisão de produto — não há remoção automática |
| Logs (aplicação e `generation_logs`) | 30 dias | CloudWatch + job de retenção |
| Exports de dados | 7 dias | lifecycle S3 + remoção de registros expirados |
| Refresh tokens | expirados/revogados + 30 dias | worker |
| Inscritos não confirmados da status page | 7 dias | worker |
| `slo_samples` | 95 dias | worker |
| Cache de cenas de IA | 90 dias ou projeto removido | worker |
| `oncall_pages` | 2 anos | worker |
| Analytics transacional | 180 dias | job de retenção |
| Analytics no warehouse | **anonimizado após 24 meses** (vinculação entre linhas quebrada, PII removida; coortes antigas deixam de ser possíveis) | `warehouse/anonymize_24m.sql` |
| `audit_logs`, `transactions` | 5 anos | sem expurgo (obrigação legal) |

Cada exclusão por política é idempotente e contada; falha do job gera incidente Sev3 (`docs/RUNBOOKS/retention-failure.md`).
