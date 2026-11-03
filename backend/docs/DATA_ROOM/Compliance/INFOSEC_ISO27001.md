# Política de segurança da informação (alinhada à ISO/IEC 27001)

> **Versão 1.0.** Alinhamento de intenção — **não há certificação ISO 27001 nem auditoria externa**. Escopo, SoA e ISMS formais são pendências (ver "Caminho para certificação").

## Controles já implementados (referência: `docs/SECURITY.md`)
Criptografia em trânsito/repouso; Argon2id; 2FA para admin; rate limit; RLS no banco; logs e auditoria (`audit_logs`); backups e DR (`docs/SRE/DR.md`); gestão de incidentes (`docs/SRE/INCIDENT_RESPONSE.md`); SBOM e auditoria de licenças (`npm run audit:sbom`, `audit:licenses`); revisão de acessos trimestral (`npm run audit:access`); segregação de funções e dupla aprovação em saques.

## Princípios
Menor privilégio; acesso por função com SSO + 2FA; dispositivos com disco cifrado; segredos só em cofre (nunca no repositório); mudanças por PR revisado; produção sem acesso individual direto (break-glass auditado); fornecedores avaliados e com DPA (`docs/COMPLIANCE/SUBPROCESSORS.md`).

## Caminho para certificação
1. Definir escopo do ISMS e responsável (CISO/encarregado). 2. Análise de riscos formal (`operations:risk-assessment`) e Declaração de Aplicabilidade. 3. Auditoria interna. 4. Seleção de certificadora; auditoria estágios 1 e 2. 5. Revisão anual pela direção. Estimativa realista: 6–9 meses após contratar a responsabilidade — **não iniciado**.
