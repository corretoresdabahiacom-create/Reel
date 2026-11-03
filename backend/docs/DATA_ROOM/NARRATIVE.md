# Narrativa de investimento — rascunho

> Rascunho técnico-comercial para a data room. **Todos os números de tração/mercado estão como `[a preencher]`** — nenhum foi medido ainda. Não circular externamente sem revisão da direção e jurídica.

## Problema
Pequenos vendedores e criadores de conteúdo precisam de vídeo curto para vender e crescer (TikTok, Reels, Shorts, marketplaces), mas produzir e publicar em vários canais é caro e lento.

## Solução
NexusReel (mobile-first): o usuário escreve um texto, envia fotos, e em minutos recebe um vídeo ≤ 60 s gerado por IA, com dublagem em vários idiomas, **publicado** em TikTok, YouTube Shorts, Instagram Reels, Shopee, Temu, OLX e Mercado Livre.

## Por que agora
Custo e qualidade de vídeo generativo viabilizam o produto; plataformas premiam volume de vídeo curto; marketplaces LATAM empurram vídeo na página do produto. `[tamanho de mercado — a fundamentar com fonte]`

## Modelo de negócio
Assinaturas (Free/Pro/Business), créditos avulsos, marketplace de templates (80% criador / 20% plataforma), afiliados, B2B (API e lote). Economia modelada em `docs/FINOPS/INITIAL_REPORT.md`: o custo de IA domina o COGS (~88%); com os preços simulados, a margem do Pro só atinge a meta com preço ≥ R$ 29,90 **e** otimizações — a decisão de preço depende de custos medidos.

## Vantagem e defensabilidade
Integração ponta a ponta (geração + dublagem + publicação multi-plataforma); dados de desempenho por plataforma (recomendações, experimentos); operação madura desde cedo (SLOs, DR, compliance LGPD/GDPR/AI Act, residência de dados). Dependência de provedores de IA é um risco reconhecido — mitigação: roteamento por custo/qualidade e segundo provedor (em andamento, `docs/BCP/PLAN.md`).

## Estado do produto e da empresa (fatos verificáveis no repositório)
Fases 1–8 entregues em código com testes automatizados e documentação; infraestrutura como código (Terraform); observabilidade e SLOs; programas de compliance e governança documentados. **Pendente:** lançamento comercial, receita, DPAs assinados, certificações, auditoria financeira.

## Tração
`[usuários, MRR, retenção, NDR — somente dados medidos; ver KPIS.md]`

## Riscos principais
Concentração em provedor de IA; custo de IA vs. preço; mudanças de API/termos das plataformas de publicação; regulação de IA e privacidade; direitos de imagem/autoria do conteúdo gerado.

## Uso dos recursos `[a definir]`
Prioridades técnicas já mapeadas em `docs/DEBT.md` (2º provedor, DR real, KYC/sanções reais, multi-região).
