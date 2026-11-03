# Fornecedores críticos e alternativas (≥ 2 por categoria)

Fonte: `vendor_contracts` (`GET/PUT /admin/ops/vendors`). **"Candidato" = não contratado**; hoje só o primário de cada categoria está integrado em código — a segunda via é plano, não capacidade. A lacuna mais relevante está em IA de vídeo.

| Categoria | Primário (integrado) | Alternativa | Situação da alternativa | Plano de saída/troca |
|---|---|---|---|---|
| <a id="cloud"></a>Nuvem | AWS | Google Cloud | candidato; Terraform só AWS | IaC portável parcial; DR cross-region AWS primeiro (`docs/SRE/DR.md`) |
| <a id="pagamentos"></a>Pagamentos | Stripe (+ Pix mock) | Mercado Pago | candidato; não integrado | interface `PaymentProvider` em `payments`; webhook assinado por provedor |
| <a id="ia-video"></a>IA de vídeo | Kling | Luma (também Runway) | candidato; **não integrado** | `VideoProvider` + `PROVIDER_MATRIX`; breaker já faz fallback — hoje cai no mock |
| <a id="ia-voz"></a>IA de voz (TTS) | ElevenLabs | Azure TTS | candidato; não integrado | `TtsProvider`; Azure também cobre região UE |
| <a id="cdn"></a>CDN | CloudFront | Cloudflare | candidato | URLs assinadas por provedor; troca por DNS |
| Moderação | OpenAI Moderation | heurística interna (mock) | parcial | `ModerationProvider` |
| E-mail transacional | a definir | a definir | — | `sendEmail` isolado em `emails` |
| KYC/sanções | stub | a definir | — | `KycProvider`/`SanctionsProvider` |

Critérios de avaliação (`operations:vendor-review`): SLA, residência, DPA/subprocessadores, custo, risco de concentração, saída (exportação de dados, prazo). Renovações: `renewal_date` preenchida no contrato real (hoje nula) com alerta em 90 dias.
