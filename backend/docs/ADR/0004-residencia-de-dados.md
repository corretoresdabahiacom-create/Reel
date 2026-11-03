# ADR 0004 — Residência por usuário e 421
**Status:** aceito · **Data:** 2026-10-20
## Contexto
LGPD/GDPR e expansão exigem dados de BR/UE/US/CA na região de origem.
## Decisão
`users.data_residency_region` por país no cadastro; rotas por tipo de dado; cada deploy regional (`DEPLOY_REGION`) responde 421 `wrong_region` para usuário de outra região; analytics pseudonimizado global.
## Alternativas
Proxy entre regiões (move dado pessoal além da fronteira); banco global com réplicas (não satisfaz UE).
## Consequências
Clientes precisam seguir o redirecionamento; failover UE→fora da UE exige base legal (decisão aberta); infra multi-região real ainda pendente (DEBT #7).
