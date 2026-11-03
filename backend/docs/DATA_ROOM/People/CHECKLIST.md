# Checklist de onboarding (meta: produtivo em < 1 semana)

> Fonte única. `npm run onboarding:validate` garante a meta no CI; `tools/onboarding-checklist generate` cria a cópia datada por pessoa.
> Formato: `- [ ] D<dia útil> [<papel|all>] texto`.

## Dia 1 — acessos e ambiente
- [ ] D1 [all] Conta de e-mail, SSO e 2FA ativados; entrada nos canais #eng, #incidents (leitura) e #on-call
- [ ] D1 [all] Ler README.md, docs/ARCHITECTURE.md e docs/ADR/ (decisões vigentes)
- [ ] D1 [backend,sre] Subir o ambiente local: `docker compose up -d` + `npm ci` + `npm run migrate` + `npm test` verde
- [ ] D1 [all] Assinar código de conduta, política de segurança da informação e política de uso interno de IA (docs/GOVERNANCE/POLICIES/)
- [ ] D1 [all] Reunião 1:1 com o gestor e definição do "buddy" de onboarding

## Dia 2 — domínio do produto
- [ ] D2 [all] Gerar um vídeo ponta a ponta no ambiente de staging e publicá-lo em uma plataforma de teste
- [ ] D2 [backend,sre] Ler docs/SRE/SLOs.md, docs/SRE/SEVERITIES.md e o runbook do componente que vai assumir
- [ ] D2 [backend] Percorrer o fluxo geração → montagem → publicação no código (src/modules/generation, publication)
- [ ] D2 [all] Treinamento de privacidade (LGPD/GDPR) de 1 h e leitura de docs/COMPLIANCE/MATRIX.md

## Dia 3 — primeira entrega
- [ ] D3 [backend,sre] Abrir o primeiro PR (item de "good first issue" de docs/DEBT.md ou correção de documentação)
- [ ] D3 [all] Revisão do primeiro PR e aprendizado do fluxo de release (docs/DEPLOY.md, release gate)
- [ ] D3 [all] Conhecer o painel de SLO e o painel de custos (dashboards/sre, FinOps)

## Dia 4 — operação
- [ ] D4 [backend,sre] Executar um runbook em staging (ex.: fila com DLQ alta) acompanhado pelo buddy
- [ ] D4 [all] Participar (observando) de um game day ou revisão de incidente/postmortem
- [ ] D4 [backend] Escrever ou ajustar um teste de integração em tests/

## Dia 5 — autonomia
- [ ] D5 [backend,sre] Fazer shadow de on-call (acompanhar o plantão; sem pager principal)
- [ ] D5 [all] Retrospectiva de onboarding com o gestor: o que faltou na documentação? (PR corrigindo o checklist)
- [ ] D5 [all] Plano de 30/60/90 dias combinado e registrado
