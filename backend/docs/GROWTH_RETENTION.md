# Growth & Retenção (Fase 7)

## Recomendações
- **Cold start** (<5 interações): regras de popularidade x nota bayesiana x recência. **Personalizado** a partir de `growth.recommendations.minInteractionsForPersonalized` (padrão 5): híbrido (filtragem colaborativa item-item + conteúdo + baseline de popularidade) com re-ranqueamento **MMR** (relevância x redundância por categoria, λ=0,75).
- Feedback em `recommendation_events` (impressão, clique, uso, dispensa). Métricas: **CTR**, diversidade (categorias distintas no top-N) e novidade — em `GET /admin/growth/overview`.
- Melhor horário de publicação por usuário (`publishTime`) a partir do histórico de publicações.

## Retenção
- **Coortes** D1/D7/D30/D90 em dbt (`mart_retention_cohorts`): exato (dia N) e *rolling*. Só usuários **elegíveis** (cadastro + N <= data de referência); coorte imatura => `NULL`, nunca zero falso. Testado com coorte sintética (D7 = 0,5).
- **Churn**: serviço Python (XGBoost/LightGBM) chamado pelo backend com **timeout de 50 ms** e fallback heurístico (`heuristic-v1`). Resultado em `users.churn_risk` (job `churn-refresh`). Ver `docs/ML.md`.
- **Campanhas de ciclo de vida** (BullMQ, job `lifecycle-run`): D+1 (onboarding incompleto), D+7 (nunca publicou), D+21 (risco de churn), D+45 (win-back), pós-publicação (próxima plataforma). Cada envio tem condição de **conversão** (job `lifecycle-conversions`) que encerra a jornada.
- **Canais**: push, e-mail e in-app, escolhidos por preferência/consentimento. **Teto de frequência** (`lifecycle.capPerDay`=1, `capPerWeek`=3), **quiet hours** (22h-8h no fuso do usuário) e **opt-out** por canal e geral. Mensagens de segurança/cobrança não entram no teto.
- **Onboarding adaptativo**: `onboarding_goal` (vender produto, criar conteúdo, agência...) define template inicial e checklist.

## Loops de crescimento
| Loop | Mecanismo | Proteção |
|---|---|---|
| Indicação | Link `/ref/:code`; **recompensa dupla** (20+20 créditos) só após o convidado **concluir o 1º vídeo** | antifraude: mesmo dispositivo/IP, velocidade de cadastro (>5/IP/24h), e-mail descartável, limite mensal (50 créditos) => status `fraud` |
| Compartilhamento | Cartão SVG (`/growth/share/:projectId/card.svg`) + link com UTM | - |
| Marca d'água dinâmica | Plano free leva marca com link de indicação do autor | removível no Pro |
| Programa de criadores | Selo **verificado** (taxa do marketplace menor: `creatorVerifiedFeePct`) | critérios no admin |
| SEO | Páginas públicas de template (`/public/templates/:id`, `/public/sitemap.xml`) com CSP | só templates aprovados |
| Afiliados / parceiros | `/admin/partners*`: cadastro, revenue share, vendas rastreadas | ver `docs/PARTNERSHIPS.md` |

## Parâmetros (sem deploy)
`PATCH /admin/growth/settings` altera `settings.growth` (holdout, recompensas, tetos, limiar de churn, orçamento mensal de IA, taxa de criador verificado, IOF, domínios descartáveis). Defaults seguros em `GROWTH_DEFAULTS`.

## Privacidade
Analytics só pseudonimizados (`pseudo_id = HMAC(ANALYTICS_PSEUDO_SALT, user_id)`), identificação **somente com consentimento**; eliminação de conta propaga *tombstone* ao warehouse. Ver `docs/PRIVACY.md` e `docs/DATA_WAREHOUSE.md`.
