# Runbook — Redis indisponível
**Efeito:** filas BullMQ param, rate limit e cache falham; API deve degradar (leitura segue). Meta RTO 30 min.
1. Confirmar (healthz/readyz → redis). Sev1 se a API devolve 5xx.
2. Recriar/replace o nó (ElastiCache failover ou Terraform). Aguardar `readyz` ok.
3. Workers reconectam sozinhos (ioredis). Reprocessar: jobs ausentes são recuperados pelo estado no banco (projetos `generating` sem job ativo → `generationService` reenfileira via manutenção).
4. Limpar flags/caches obsoletos: `invalidateFlags()`; breakers resetados.
5. Pós: conferir `slo_samples` (agregação em Redis perde ≤ 5 min de amostras — esperado).
