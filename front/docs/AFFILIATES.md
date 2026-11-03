# Afiliados

1. **Conectar:** Perfil → Afiliados → Configuração (Shopee Afiliados / Mercado Livre Afiliados). Instruções passo a passo na tela. `// TODO: integrar com API oficial` (aprovação de afiliado necessária).
2. **Publicar:** em Shopee/Mercado Livre marque "Incluir meu link de afiliado": o link é gerado com a conta conectada ou colado manualmente (precisa de `https://`).
3. **Rastreamento:** o app grava o link e publica `app.nexusreel.com/r/{publicationId}`; o endpoint registra o clique e responde 302 para o link real.
4. **Comissão:** bruta = valor da venda × taxa da plataforma (Shopee 6%, ML 5% no protótipo – `TODO: verify`). O app retém `affiliateFeePct` (10%); o restante vai ao saldo. Valores em **centavos inteiros**.
5. **Saque:** mínimo R$ 50 (configurável). O pedido reserva o saldo; `pendente → aprovado → pago`, ou `rejeitado` (saldo devolvido). Pagamento real: `// TODO` gateway.
6. **Conversões reais:** conciliar com relatórios oficiais das plataformas (hoje o protótipo simula).
