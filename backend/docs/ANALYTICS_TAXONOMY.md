# Taxonomia de eventos de analytics — v1

> **Gerado** por `npx tsx scripts/gen-taxonomy-doc.ts` a partir de `src/modules/analytics/taxonomy.ts`. Não edite à mão: o CI roda `--check`.

## Regras
- **Origem**: `client` = só pelo app (`POST /analytics/events`); `server` = só emitido pelo backend (um evento de servidor vindo do cliente é rejeitado); `both` = ambos.
- **Desconhecidos** entram em quarentena (`schema_version` 0, fora dos marts). Em eventos conhecidos, propriedades fora do esquema são descartadas; tipo errado ou obrigatória ausente → rejeitado.
- **PII proibida**: chaves como e-mail, telefone, CPF/CNPJ, nome, endereço, IP, token ou senha — e valores com formato de e-mail/CPF/telefone — fazem o evento ser rejeitado. O `user_id` é pseudonimizado (HMAC com `ANALYTICS_PSEUDO_SALT`) antes de sair para o warehouse.
- **Consentimento**: sem consentimento ativo de métricas (`cookies`), o evento é gravado **sem** `user_id` (só conta no agregado). Eventos de servidor seguem a mesma regra, exceto quando o código força identificação para registro financeiro. O envio do app é *fire-and-forget* e nunca bloqueia a UI.
- **Versionamento**: mudar nome, tipo ou obrigatoriedade = nova versão (`TAXONOMY_VERSION`), nunca edição retroativa.

Propriedades comuns aceitas em todo evento: `locale`, `region`, `country`, `plan`, `utm_source`, `utm_medium`, `utm_campaign`, `experiment_key`, `variant`, `surface`.

## acquisition

| Evento | Origem | Descrição | Propriedades específicas | Obrigatórias |
|---|---|---|---|---|
| `user_signed_up` | server | Conta criada | `method`:string, `referred`:boolean, `partner_code`:string | — |
| `waitlist_joined` | server | Entrada na waitlist | `has_referral`:boolean | — |

## activation

| Evento | Origem | Descrição | Propriedades específicas | Obrigatórias |
|---|---|---|---|---|
| `onboarding_completed` | both | Onboarding concluído | `goal`:string, `steps_seen`:number, `duration_ms`:number | — |
| `video_assembled` | server | Vídeo final montado (ativação) | `project_id`:string, `duration_sec`:number, `is_first`:boolean | `project_id` |

## affiliates

| Evento | Origem | Descrição | Propriedades específicas | Obrigatórias |
|---|---|---|---|---|
| `affiliate_conversion` | server | Conversão de afiliado confirmada | `link_id`:string, `platform`:string, `amount_cents`:number, `commission_cents`:number | — |
| `affiliate_link_clicked` | server | Clique em link de afiliado (amostrado/agregado) | `link_id`:string, `platform`:string | — |

## compliance

| Evento | Origem | Descrição | Propriedades específicas | Obrigatórias |
|---|---|---|---|---|
| `consent_given` | server | Consentimento registrado/revogado | `consent_type`:string, `accepted`:boolean | `consent_type` |

## creation

| Evento | Origem | Descrição | Propriedades específicas | Obrigatórias |
|---|---|---|---|---|
| `photo_idea_used` | client | PhotoCoach: ideia usada | `idea_id`:string, `category`:string | — |
| `photo_idea_viewed` | client | PhotoCoach: ideia exibida | `idea_id`:string, `category`:string | — |
| `project_created` | server | Projeto criado | `project_id`:string, `category`:string, `template_id`:string, `photos`:number | `project_id` |
| `scene_generated` | server | Cena gerada | `project_id`:string, `scene_index`:number, `provider`:string | `project_id` |
| `scene_regenerated` | server | Cena regenerada | `project_id`:string, `scene_index`:number | `project_id` |
| `storyboard_generated` | server | Storyboard gerado | `project_id`:string, `scenes`:number | `project_id` |
| `video_dubbed` | server | Vídeo dublado | `project_id`:string, `target_locale`:string | `project_id` |

## distribution

| Evento | Origem | Descrição | Propriedades específicas | Obrigatórias |
|---|---|---|---|---|
| `publication_failed` | server | Publicação falhou | `project_id`:string, `platform`:string, `error_code`:string | `platform` |
| `video_published` | server | Vídeo publicado em uma plataforma | `project_id`:string, `platform`:string, `publication_id`:string | `platform` |

## experimentation

| Evento | Origem | Descrição | Propriedades específicas | Obrigatórias |
|---|---|---|---|---|
| `experiment_converted` | server | Conversão atribuída a um experimento | `event`:string | `experiment_key`, `variant` |
| `experiment_exposed` | server | Exposição a uma variante | — | `experiment_key`, `variant` |

## growth

| Evento | Origem | Descrição | Propriedades específicas | Obrigatórias |
|---|---|---|---|---|
| `referral_clicked` | server | Clique em link de indicação | `code`:string | — |
| `referral_converted` | server | Indicação ativada e recompensada | `code`:string, `credits`:number | — |
| `share_card_created` | both | Card social gerado | `project_id`:string, `channel`:string | — |

## marketplace

| Evento | Origem | Descrição | Propriedades específicas | Obrigatórias |
|---|---|---|---|---|
| `template_purchased` | server | Template comprado | `template_id`:string, `price_credits`:number | `template_id` |
| `template_used` | both | Template usado em um projeto | `template_id`:string, `category`:string | `template_id` |
| `template_viewed` | client | Template visualizado | `template_id`:string, `category`:string, `position`:number | `template_id` |

## monetization

| Evento | Origem | Descrição | Propriedades específicas | Obrigatórias |
|---|---|---|---|---|
| `checkout_started` | server | Checkout iniciado | `kind`:string, `amount_cents`:number, `currency`:string, `method`:string | — |
| `credits_purchased` | server | Créditos comprados | `credits`:number, `amount_cents`:number, `currency`:string, `method`:string | — |
| `paywall_viewed` | both | Paywall/oferta exibido | `trigger`:string, `offer`:string, `blocking`:boolean | `trigger` |
| `refund_requested` | server | Reembolso solicitado | `kind`:string | — |
| `revenue_recorded` | server | Receita reconhecida (value = centavos BRL equivalentes) | `kind`:string, `amount_cents`:number, `currency`:string | — |
| `subscription_started` | server | Assinatura ativada | `amount_cents`:number, `currency`:string | — |

## retention

| Evento | Origem | Descrição | Propriedades específicas | Obrigatórias |
|---|---|---|---|---|
| `notification_clicked` | client | Notificação clicada | `campaign_key`:string, `channel`:string | — |
| `notifications_disabled` | server | Usuário desligou notificações | `channel`:string | — |

Total: 32 eventos.
