# Go-to-market

## Fases
1. **Waitlist** (`web/waitlist.html` + `POST /waitlist`): posição na fila, +5 posições por convidado (teto 50), `GET /waitlist/:code`. Feature flag `waitlist_open`. UTM capturado e ligado à atribuição. Convites em ondas pelo admin (`/admin/growth/overview`).
2. **Beta fechado** (50-200 usuários): onboarding assistido, grupo de feedback, métricas-alvo: ativação D7, vídeos/usuário, NPS. Experimentos só após ~1.000 usuários/semana (senão amostra insuficiente).
3. **Lançamento público**: PR, ASO, criadores parceiros, afiliados.

## UTM e rastreamento
Padrão: `utm_source` (canal), `utm_medium` (cpc|social|email|referral|pr|share), `utm_campaign` (aaaa-mm-nome), `utm_content` (criativo), `utm_term`. O app/landing envia `POST /attribution/touch` (anonId) e o cadastro herda a atribuição (`users.attribution_source`). Modelos: último não-direto (padrão), último toque, linear, em U (posição), decaimento temporal; relatório `/admin/attribution/report` **reconciliado com Stripe**. Links curtos de indicação: `/ref/:code`.

## Checklist ASO (App Store / Google Play)
- [ ] Título (<=30) com palavra-chave principal; subtítulo/descrição curta com benefício.
- [ ] Palavras-chave (iOS 100 chars) pesquisadas por país/idioma; localizar metadados em PT-BR, ES-MX, EN.
- [ ] Ícone testado (A/B de Store Listing/PPO); 5-8 screenshots com legenda do benefício; vídeo de preview de 15-30 s.
- [ ] Categoria (Foto e Vídeo); classificação etária; política de privacidade e declaração de dados (Data safety / Privacy Nutrition Labels) coerentes com `docs/PRIVACY.md`.
- [ ] Pedido de avaliação após o 1º vídeo publicado (momento de sucesso), nunca no erro.
- [ ] Deep links universais para `/ref/:code`; Smart App Banner no site.
- [ ] Monitorar ranking e conversão da página (impressão -> instalação) semanalmente.

## Kit de imprensa (PR kit)
Release de 1 página (problema, solução, números reais — **só publicar números verificados**), 3 screenshots + vídeo demo de 30 s, logo/ícone em alta, bio dos fundadores, FAQ (privacidade/IA), contato. Lista de 30 veículos/criadores por país; embargo opcional; página `/press`.

## Canais e metas iniciais (hipóteses)
Conteúdo orgânico em TikTok/Reels mostrando "antes/depois"; programa de criadores; SEO de templates; indicação; parcerias com agências. Orçamento de teste pago só após D7 >= meta e CAC payback estimado < 6 meses (usar `mart_attribution_channels`).

## Métricas do funil de GTM
Waitlist -> convite -> instalação -> 1º vídeo (D0) -> publicação (D7) -> pagante (D30). Dashboard **Growth**.
