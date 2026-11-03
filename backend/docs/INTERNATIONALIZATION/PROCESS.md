# Internacionalização — processo

## Pipeline de tradução (TMS)
1. **Fonte única:** catálogos no repositório (hoje: e-mails em `src/modules/emails/email.service.ts`; textos do app mobile ficam no repositório do app).
2. **Extração → TMS** (Crowdin/Lokalise — **escolha e contrato pendentes**): chaves novas sobem no merge; tradutores humanos + revisão de nativo para pt-BR, es, es-MX, en; tradução automática só como rascunho.
3. **Retorno por PR:** o TMS abre PR com os catálogos; CI roda `npm run i18n:check` (completude por locale com fallback regional es-MX→es→pt-BR, pseudolocalização de todos os e-mails, detector de strings hardcoded vs. baseline) e `npm run i18n:docs`.
4. **Pseudolocalização:** `npm run i18n:check -- pseudo "Olá ${name}"` → `⟦Ølá ${name}~~⟧` (acentos + expansão ~35% + delimitadores; placeholders preservados). Texto na UI **sem** `⟦ ⟧` em build de pseudo-locale = string hardcoded; estouro de layout = expansão não prevista.
5. **Dívida conhecida:** `tools/i18n-check/baseline.json` lista mensagens de API ainda em pt-BR fixo (erros de validação etc.). O CI só falha para **novas** strings; reduzir o baseline é meta trimestral.

## Flags regionais
Lançamento por região via `feature_flags.regions` (ex.: `ai_disclosure_visible` = {EU}); métodos de pagamento e plataformas por perfil (`/i18n/profile`). Novo país = (1) perfil + revisão local, (2) jurisdição na matriz de compliance, (3) rota de residência, (4) flag em canário.

## Suporte 24/7 (follow-the-sun)
Cobertura planejada: BR (manhã–tarde BRT), US/MX (tarde–noite), UE (manhã CET) com ferramenta de tickets única, base de conhecimento por idioma e SLA de 1ª resposta (4 h pt/es; 8 h en). **Estado: modelo de operação; contratação e ferramenta ainda não definidas.** Escalação para on-call técnico via `docs/SRE/SEVERITIES.md`.

## Comunidade e parcerias
Comunidade de criadores por idioma (Discord/WhatsApp), embaixadores locais e programa de templates (marketplace). Parcerias regionais (agências, marketplaces, operadoras): ver `docs/PARTNERSHIPS.md` e `docs/MARKET_EXPANSION.md`; contratos pelo `tools/contract-generator`.
