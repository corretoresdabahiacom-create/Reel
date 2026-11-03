# Controles de governança

## Segregação de funções
| Função | Quem faz | Quem NÃO pode fazer a mesma coisa |
|---|---|---|
| Desenvolver e aprovar PR | autor / revisor distinto (branch protection) | autor aprovar o próprio PR |
| Solicitar e aprovar saque | usuário / admin | admin aprovar o saque do qual é titular (403 `self_approval`) |
| Aprovar saque ≥ R$ 10.000 | **dois admins distintos** (`first_approver` ≠ segundo) | o mesmo admin duas vezes (409 `dual_approval_same_admin`) |
| Deploy em produção | pipeline com release gate | override do freeze sem SRE (auditado) |
| Revisão de acesso | Segurança | dono do acesso revisar o próprio |

## Dupla aprovação (em código)
Saques ≥ `dualApprovalThresholdCents` (R$ 10.000): primeira aprovação marca `awaitingSecondApproval`; segunda de outro admin liquida; o mesmo admin → 409 `dual_approval_same_admin`; admin aprovando o próprio saque → 403 `self_approval`. Cobertura: `tests/17-governance`.

## Revisão trimestral de acessos
`npm run audit:access` lista admins (com/sem 2FA) e chaves de API ativas/sem uso > 90 d e gera o formulário `docs/GOVERNANCE/access-reviews/AAAA-Qn.md`; revisor assina manter/revogar; revogações aplicadas no mesmo dia. **Nenhuma revisão real executada ainda.**

## Evidências contínuas
SBOM + auditoria de licenças por release; ROPA/DPIA atualizados; relatório de retenção mensal; relatório de DSAR; logs de auditoria 5 anos.
