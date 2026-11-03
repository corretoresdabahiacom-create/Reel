# Runbook — alerta de burn rate de SLO

**Gatilho:** alerta `*SloBurn*` (page: 14,4× em 1 h ou 6× em 6 h; ticket: 1× em 3 d). Dono: SRE on-call.

1. `GET /api/v1/admin/ops/slo` → qual SLO, janela, % de orçamento restante.
2. Correlacionar: deploy recente? (`git log`, painel de release) → **rollback** (`docs/RUNBOOKS/rollback.md`) se coincide.
3. Por serviço: api → erros 5xx por rota (`/__debug`, logs); geração/dublagem → provedor de IA (breaker `cb:open:*`; `docs/RUNBOOKS/ai-provider-failure.md`); publicação → plataforma (flag `publish_<plataforma>`); filas → `docs/RUNBOOKS/stuck-queue.md`.
4. Mitigar (rollback, kill switch, escalar workers). Abrir incidente (`npm run incident -- open --sev sev2 --title ...`) se ainda não aberto pela automação.
5. Orçamento < 25%: freeze de features liga sozinho; confirmar em `GET /admin/ops/release-gate`.
6. Pós: postmortem se Sev1/Sev2; ajustar SLO/alerta se foi ruído (registrar em ADR).
