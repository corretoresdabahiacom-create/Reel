# Data room (due diligence)

Estrutura (pastas obrigatórias): **Corporate · Financials · Product · Technology · Legal · Compliance · People · Customers · Partners**. O índice (`INDEX.md`) e as cópias dos documentos são gerados por `npm run dataroom:sync` a partir de `manifest.json` (fonte única = documentos vivos do repositório); `npm run dataroom:check` falha se algo obrigatório com fonte no repositório estiver ausente ou defasado. Itens **externos** (demonstrações auditadas, cap table, contratos assinados, folha) aparecem como "EXTERNO PENDENTE" até serem fornecidos — nunca são fabricados.
Acesso: compartilhar por link com expiração e marca d'água em plataforma de data room (a definir); log de acessos retido.
