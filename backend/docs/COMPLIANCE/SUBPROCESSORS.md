# Subprocessadores

Fonte: tabela `subprocessors` (`GET/PUT /admin/ops/compliance/subprocessors`). Mudanças exigem aviso de **30 dias** a clientes B2B (DPA), com direito de objeção. Status inicial de todos: **`pending_dpa`** — nenhum DPA foi assinado ainda (nada foi contratado por esta entrega).

| Subprocessador | Finalidade | Localização | Status |
|---|---|---|---|
| AWS | Hospedagem (RDS, S3, ECS, ElastiCache) | sa-east-1 / us-east-1 / eu-west-1 | pending_dpa |
| Stripe | Pagamentos e assinaturas | EUA/UE | pending_dpa |
| Kling | IA de geração de vídeo | global (provedor) | pending_dpa |
| ElevenLabs | IA de síntese de voz | global (provedor) | pending_dpa |
| OpenAI | Moderação de conteúdo | EUA | pending_dpa |
| E-mail transacional | Envio de e-mails | a definir | pending_dpa |
| KYC | Verificação de identidade (saques) | a definir | pending_dpa |

Processo de inclusão: (1) avaliação de segurança, (2) DPIA se tratar dados pessoais com risco, (3) DPA com cláusula de não treinamento, (4) registro aqui + aviso, (5) atualização do ROPA.
