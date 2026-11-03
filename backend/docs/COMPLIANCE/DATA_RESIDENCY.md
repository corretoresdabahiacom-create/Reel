# Residência de dados

## Regiões
| Região do usuário | Nuvem | Quem cai aqui |
|---|---|---|
| BR | sa-east-1 | Brasil (padrão) |
| EU | eu-west-1 | UE/EEE, Reino Unido, Suíça |
| US | us-east-1 | EUA e demais países sem região própria |
| CA | ca-central-1 | Canadá |

Atribuída no cadastro por país (`residencyFor`) e gravada em `users.data_residency_region`; rotas por tipo de dado em `data_residency_routes` (banco primário, mídia, inferência de IA). Mudança de país: `POST /admin/ops/residency/migrate` (auditado); a movimentação física dos dados segue o runbook abaixo.

## Roteamento
- Cada deploy regional define `DEPLOY_REGION`. Se o usuário pertence a outra região, a API responde **421 `wrong_region`** com `homeRegion`, para o cliente reapontar ao endpoint certo (sem proxy cruzado de dados pessoais).
- **Analytics** é pseudonimizado e agregável globalmente (sem identificadores diretos); contas e mídia ficam na região de origem.
- **Inferência de IA:** para a UE existe rota `eu`; para as demais, `global` (provedor decide). Provedor sem região UE ⇒ transferência internacional (ver DPIA).

## Estado
- Implementado: atribuição, rotas, 421, distribuição por região e painel executivo regional.
- **Não implementado:** infraestrutura multi-região real (bancos/buckets por região, DNS geográfico). Terraform define módulos por ambiente; o provisionamento das 3 regiões é um passo de infraestrutura pendente.
- Decisão jurídica pendente: failover UE → região fora da UE (ver `docs/SRE/DR.md`); preferir segunda região UE.

## Runbook — migrar residência de um usuário
1. Verificar base legal e pedido do titular; abrir tarefa com DPO.
2. `POST /admin/ops/residency/migrate` (`reason` obrigatório) — registra auditoria.
3. Exportar dados da região de origem (`complianceService.buildExport`), importar na de destino, validar contagens e hashes.
4. Excluir da origem após confirmação (30 d de carência) e atualizar `data_residency_routes` conforme necessário.
