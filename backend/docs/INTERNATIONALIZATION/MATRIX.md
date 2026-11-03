# Matriz de internacionalização

> GERADO por `tools/i18n-check/docs.ts` de `src/modules/i18n-deep/profile.ts` (endpoint `GET /api/v1/i18n/profile?locale=es-MX&country=MX`). Perfis são **configuração a validar localmente** (jurídico, fiscal, pagamentos, parceiros) antes de lançar em cada país. Pacotes de música são **identificadores de pacotes a licenciar** — nenhuma música está incluída.

| Idioma/país | Formatos de vídeo | Plataformas dominantes | Música (pacotes) | Pagamentos / imposto | Residência | DSAR | Suporte | Regulação de IA/dados |
|---|---|---|---|---|---|---|---|---|
| pt-BR / BR | 9:16 1080x1920 ≤60s; 1:1 1080x1080 ≤60s (marketplaces) | tiktok, instagram, youtube, shopee, mercadolivre, olx | br-pop-instrumental, br-funk-instrumental, br-sertanejo-instrumental | pix, cartao, boleto · BRL · ISS/PIS/COFINS | BR | 15 d | chat/email/whatsapp · 1ª resposta 4 h | LGPD art. 20 (revisão de decisões automatizadas); PL 2338/2023 (marco de IA) — acompanhar |
| es-MX / MX | 9:16 1080x1920 ≤60s; 1:1 1080x1080 ≤60s (marketplaces) | tiktok, instagram, youtube, mercadolivre | mx-regional-instrumental, latin-pop-instrumental | oxxo, spei, tarjeta · MXN · IVA 16% | US | 20 d | chat/email/whatsapp · 1ª resposta 4 h | LFPDPPP (lei federal de proteção de dados; reformada em 2025 — validar texto e autoridade vigentes com advogado local); Sem lei de IA em vigor conhecida — acompanhar iniciativas legislativas |
| es / ES | 9:16 1080x1920 ≤60s; 1:1 1080x1080 ≤60s (marketplaces) | tiktok, instagram, youtube | es-pop-instrumental | tarjeta, sepa, bizum · EUR · IVA 21% | EU | 30 d | chat/email · 1ª resposta 4 h | EU AI Act art. 50 (transparência) — marca visível "Gerado por IA"; GDPR / DSA |
| en / US | 9:16 1080x1920 ≤60s; 1:1 1080x1080 ≤60s (marketplaces) | tiktok, instagram, youtube, temu | us-pop-instrumental, us-hiphop-instrumental | card, apple_pay, google_pay · USD · Sales tax (por estado) | US | 45 d | chat/email · 1ª resposta 8 h | CCPA/CPRA; Leis estaduais de IA (ex.: Colorado AI Act) — acompanhar; FTC: disclosure de endorsements |
| en / GB | 9:16 1080x1920 ≤60s; 1:1 1080x1080 ≤60s (marketplaces) | tiktok, instagram, youtube | uk-pop-instrumental | card, apple_pay, bacs · GBP · VAT 20% | EU | 30 d | chat/email · 1ª resposta 8 h | UK GDPR; Online Safety Act |

## Notas culturais

**pt-BR/BR**
- Feriados: Black Friday, Dia das Mães, Dia dos Namorados
- Tom informal; evitar espanhol neutro nas legendas

**es-MX/MX**
- Buen Fin (nov), Día de Muertos, Día de las Madres (10 mai)
- Marketplace foco: Mercado Libre México; confirmar disponibilidade de Shopee/OLX/Temu no MX antes do lançamento (não assumir)

**es/ES**
- Rebajas (jan/jul), Black Friday

**en/US**
- Black Friday/Cyber Monday, Prime Day, Back to School

**en/GB**
- Boxing Day, Black Friday

## Países sem perfil dedicado

Herdam o perfil do idioma, mas com residência de dados e prazo de DSAR da jurisdição real do país (`resolveProfile`), e recebem a nota "revisar localmente". Países fora de qualquer jurisdição da matriz de compliance usam o padrão (residência US, DSAR 30 d).
