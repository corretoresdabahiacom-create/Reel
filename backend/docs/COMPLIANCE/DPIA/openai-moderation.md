# DPIA — OpenAI Moderation

> **rascunho — não publicar sem revisão humana** — Revisão humana obrigatória (DPO/jurídico) antes de aprovar.

## 1. Finalidade
Moderação de roteiro e imagens

## 2. Base legal
Execução de contrato (gerar vídeo solicitado) + consentimento específico para IA (type=ai)

## 3. Dados e titulares
- Categorias: texto, imagens
- Titulares: Usuários (criadores/vendedores); Terceiros presentes em mídias enviadas

## 4. Destinatários
- OpenAI Moderation
- Provedores de IA (vídeo/TTS/moderação)
- AWS S3

## 5. Retenção
- Geração de vídeos por IA: Cenas brutas 90 d; vídeo final Free 365 d / Pro 730 d; logs 30 d

## 6. Transferências
Fora da região: sim. Rotas de residência: BR/ai_inference→global, BR/media→sa-east-1, BR/primary_db→sa-east-1, CA/ai_inference→global, CA/media→ca-central-1, CA/primary_db→ca-central-1, EU/ai_inference→eu, EU/media→eu-west-1, EU/primary_db→eu-west-1, US/ai_inference→global, US/media→us-east-1, US/primary_db→us-east-1

## 7. Necessidade e proporcionalidade
Dados limitados ao necessário para a finalidade; sem reutilização para treino de modelos de terceiros (exigir em contrato).

## 8. Riscos e mitigações
- **R2** [medio] Transferência internacional de dados pessoais (prob. media, grav. media)
  - SCC/cláusulas-padrão + avaliação de impacto da transferência (TIA)
  - Roteamento por residência (data_residency_routes)
  - Criptografia em trânsito e em repouso
- **R3** [alto] Provedor sem DPA assinado (prob. alta, grav. alta)
  - Bloquear uso em produção até assinatura do DPA
  - Registrar em subprocessors com status pending_dpa
- **R7** [medio] Conteúdo sintético enganoso (deepfake) ou violação de direitos de imagem (prob. media, grav. media)
  - Rotulagem AI Act art. 50 (marca visível + metadados C2PA-style)
  - Moderação de roteiro e imagens
  - Canal de denúncia/remoção

**Risco residual:** medio

## 9. Jurisdições
- US: Leis estaduais (CCPA/CPRA, VCDPA, CPA…) + COPPA (<13) — DSAR 45 d — matriz: in_progress

## 10. Revisão
anual e a cada mudança significativa (novo provedor, jurisdição ou tipo de dado)


> STATUS: RASCUNHO (template) — aguarda revisão do DPO.
