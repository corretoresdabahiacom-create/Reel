# Runbook — vazamento de token/segredo

| Segredo | Ação imediata | Depois |
|---|---|---|
| Token OAuth de plataforma de um usuário | `DELETE /integrations/:platform` (apaga o token) e revogue o app na plataforma | avisar o usuário; auditar `audit_logs` |
| `JWT_SECRET` | trocar no Secrets Manager e redeploy → **todas** as sessões caem (usuários refazem login) | revisar acessos suspeitos |
| `DATA_ENCRYPTION_KEY` | gerar nova chave com **novo `keyId`**, manter a antiga só para leitura, rodar re‑encriptação dos tokens (`connected_accounts`, `affiliate_accounts`), aposentar a antiga | **revogar** os tokens de plataformas (a chave antiga comprometida decifra o que foi copiado) |
| API key B2B (`nxr_…`) | `DELETE /api-keys/:id` | gerar outra; revisar `last_used_at` |
| Segredo de webhook (Stripe/Pix/afiliados) | rotacionar no provedor e no Secrets Manager | reprocessar eventos perdidos |
| Chaves de IA/Stripe/plataformas | revogar no painel do provedor, publicar nova no Secrets Manager, redeploy | checar faturas/uso |

Sempre: registrar o incidente, preservar logs (CloudWatch 30 d), verificar `audit_logs` e comunicar a ANPD/titulares quando houver dado pessoal exposto (LGPD art. 48).
