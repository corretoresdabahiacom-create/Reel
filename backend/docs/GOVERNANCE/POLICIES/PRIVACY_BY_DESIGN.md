# Privacidade desde a concepção

> Versão 1.0.

1. **Checklist em todo PR/RFC que toca dados pessoais:** finalidade e base legal; minimização (só o necessário); retenção definida (`RETENTION_POLICY.md`); residência (`DATA_RESIDENCY.md`); atualização do ROPA (`ropaService` — job semanal acusa tabelas novas sem atividade); necessidade de DPIA (`tools/dpia-assistant`).
2. **Padrões seguros:** pseudonimização em analytics (`pseudo_id` HMAC), IP e fingerprint em hash, tokens OAuth cifrados, consentimento granular com prova (`consents.proof_hash`).
3. **Direitos do titular** por design: exportar/excluir sem intervenção manual; SLA monitorado.
4. **Novo fornecedor/provedor de IA:** DPIA + DPA + registro de subprocessador **antes** de ir a produção.
5. **Revisão anual** desta política e dos DPIAs (campo `next_review_at`).
