# Parcerias

## Tipos
| Tipo | Quem | Modelo | Rastreio |
|---|---|---|---|
| Afiliado/criador | influenciadores, canais de dicas | % da 1ª compra (ou recorrente por N meses) | link `/ref/:code` + UTM |
| Agência/B2B | agências sociais, e-commerces | plano Business + revenue share | `partner_id` no usuário |
| Marketplace | Shopee, Temu, OLX, Mercado Livre | integração de publicação, co-marketing | eventos de publicação |
| Ferramentas | editores, bancos de música/imagem | licença/integração | contratos |

## Operação (API admin)
- `POST /admin/partners` cadastra; `GET /admin/partners` lista; `PATCH /admin/partners/:id` altera; `GET /admin/partners/:id/sales` mostra **usuários indicados**, **vendas rastreadas** e totais (`totals.*`); `POST /admin/partners/:id/mark-paid` registra o pagamento do revenue share.
- Cadastro de usuário com `partner_id`/UTM herda o parceiro (visível em `dim_users.partner_id`).
- Pagamento: apurar mensalmente sobre receita **líquida** (sem reembolsos/impostos), pagamento após janela de reembolso (30 d).

## Due diligence e conformidade
Contrato com cláusulas de marca/uso de dados (LGPD: parceiro é controlador próprio dos dados que coletar), proibição de spam/fraude, auditoria de tráfego (cliques sem conversão, mesmo dispositivo), direito de encerrar. Divulgação de publi (#publi/#ad) obrigatória para criadores.

## Métricas
Receita por parceiro, CAC efetivo (revenue share / novo pagante), retenção D30 dos indicados vs orgânico (`mart_attribution_channels`).
