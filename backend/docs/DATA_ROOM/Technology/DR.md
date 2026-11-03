# Recuperação de desastres

| Componente | RTO | RPO | Mecanismo |
|---|---|---|---|
| Postgres | **1 h** | **5 min** | backups contínuos (WAL/PITR) + réplica cross-region; promoção da réplica |
| S3 (mídia) | 4 h | **15 min** | replicação cross-region (CRR) para a região par |
| Redis | **30 min** | n/a (cache/filas efêmeras) | recriar do IaC; filas reprocessadas a partir de `projects/scenes` pelo estado no banco |
| Aplicação | 30 min | 0 | Terraform + imagem imutável no ECR (replicado) |

## Regiões e pares (`DR_PAIRS` em `src/modules/bcp/bcp.service.ts`)
sa-east-1 ⇄ us-east-1 · eu-west-1 → us-east-1 **(atenção: UE → fora da UE exige base legal; preferir segunda região UE — decisão pendente, ver DATA_RESIDENCY.md)** · ca-central-1 → us-east-1.

## Procedimento: perda de região
1. Declarar Sev1; comandante; status page.
2. Congelar escritas (flag `release_freeze` + modo manutenção).
3. Promover réplica Postgres na região par; validar `pg_last_wal_replay_lsn` e perda estimada (≤ 5 min).
4. Apontar DNS (Route 53 health-checked) e `DEPLOY_REGION`; rodar migrations idempotentes (`infra/scripts/run-migrations.sh`).
5. Subir workers; reprocessar filas; validar SLOs.
6. Comunicar; abrir postmortem; planejar o retorno (failback) em janela.

## Testes
- **Mensal:** restauração de backup em ambiente isolado + checagem de integridade (`docs/RUNBOOKS/db-restore.md`).
- **Semestral:** exercício de perda de região em staging (`kind='dr'`). 
- **Drill de lógica:** `npm run bcp -- run cloud_region_failure` valida mapeamento de rotas/pares; **não** promove banco.

## Estado
Nenhum exercício de DR foi executado em infraestrutura real; RTO/RPO acima são **metas** até a primeira medição registrada.
