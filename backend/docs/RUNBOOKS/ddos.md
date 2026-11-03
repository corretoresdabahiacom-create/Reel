# Runbook — ataque volumétrico (DDoS) / abuso de API
1. Confirmar padrão (IPs/ASNs, rota). Rate limit por IP já ativo (`rateLimit`).
2. Ativar regras de WAF/CDN (modo "under attack"/rate-based); bloquear ASNs abusivos.
3. Proteger rotas caras: desligar temporariamente `/auth/magic-link` e cadastro por flag se necessário.
4. Status page; Sev1 se afeta disponibilidade. Pós: ajustar limites; documentar IOCs.
