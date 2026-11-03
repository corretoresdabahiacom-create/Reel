# Runbook — suspeita de fraude em saques/afiliados
1. Não aprovar: saque com possível sanção fica `pending` com `hold_reason='sanctions_match'` (a aprovação devolve 409 `sanctions_hold`); para outras suspeitas, rejeitar ou manter pendente com nota em `audit_logs`.
2. Conferir KYC (`/users/me/kyc`) e `sanctions_checks` (similaridade ≥ 0,92 retém automaticamente; lista atual é demonstrativa).
3. Saques ≥ R$ 10.000 exigem **duas aprovações de admins distintos**; admin não aprova o próprio saque.
4. Fraude confirmada: bloquear usuário, reverter créditos, registrar em `audit_logs`; comunicar Jurídico/Compliance (COAF se aplicável — decisão jurídica).
Política: `docs/GOVERNANCE/POLICIES/ANTI_FRAUD.md`.
