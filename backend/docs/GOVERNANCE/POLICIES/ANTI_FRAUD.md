# Política antifraude e PLD/AML (saques e afiliados)

> **Versão 1.0 — parâmetros iniciais; validar com jurídico/compliance financeiro.** Implementado em `src/modules/governance` (`payoutGuard`, `kyc`, `sanctions`).

- **KYC** obrigatório para saques ≥ **R$ 5.000** (acumulado por pedido): documento verificado por provedor (hoje **stub** — provedor real a contratar; `KYC_PROVIDER`). Sem KYC verificado: pedido recusado (409 `kyc_required`; flag `kyc_enforced`).
- **Triagem de sanções** em todo saque: nome vs. lista; similaridade ≥ 0,92 retém o saque para revisão manual. A lista atual é **demonstrativa**; produção exige lista oficial (OFAC/UE/ONU/COAF) e provedor — pendente.
- **Dupla aprovação** para saques ≥ **R$ 10.000**: dois administradores distintos (o mesmo admin duas vezes → 409); **admin não aprova o próprio saque** (403).
- **Antifraude de afiliados/indicações:** impressão digital em hash, limites por IP/dispositivo, expiração de recompensas.
- **Segregação:** quem desenvolve não aprova saque; acessos revisados trimestralmente.
- **Reporte:** operações suspeitas → Compliance → decisão sobre comunicação a autoridades (COAF) — decisão jurídica.
Limiares configuráveis em `settings.ops` (`kycThresholdCents`, `dualApprovalThresholdCents`).
