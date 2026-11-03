# Runbook — suspeita de vazamento de dados pessoais
Procedimento legal e de comunicação: `docs/COMPLIANCE/BREACH.md` (relógio de 72 h GDPR; LGPD "prazo razoável", 3 dias úteis recomendados).
Técnico imediato: conter (revogar chaves/tokens — `docs/RUNBOOKS/token-leak.md`), preservar evidências (logs, snapshots), abrir incidente Sev1 (`source=security`), acionar DPO e Jurídico, registrar linha do tempo desde a detecção.
