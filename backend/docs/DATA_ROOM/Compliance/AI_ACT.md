# EU AI Act — classificação e mitigações

> Análise técnica interna; **não é parecer jurídico**. Revisar com advogado especializado antes do lançamento na UE.

## Papel e classificação
NexusReel é **implantador (deployer)** de modelos de IA de terceiros (Kling, ElevenLabs, moderação) e **provedor** da aplicação que gera conteúdo sintético. Casos de uso (geração de vídeos publicitários/sociais a partir de texto e fotos do próprio usuário, dublagem, moderação) **não constam** das categorias de alto risco do Anexo III nem das práticas proibidas do art. 5. Classificação adotada: **risco limitado — obrigações de transparência (art. 50)**. Registro em `ai_act_registrations` (`GET /admin/ops/compliance/ai-act`, sync automático dos provedores integrados).

## Obrigações e implementação
| Obrigação | Como atendemos | Onde |
|---|---|---|
| Rotular conteúdo sintético (art. 50(2)/(4)) | metadado `ai_generated` no MP4 + manifesto sidecar C2PA-style por vídeo + **marca visível "Gerado por IA"** para usuários da UE (flag `ai_disclosure_visible`, regiões {EU}) | `src/modules/compliance/aiDisclosure.ts`, `src/providers/ai/router.ts` |
| Informar que interage com IA | consentimento específico `type=ai` antes da geração | `consents` |
| Deepfake / semelhança de pessoas | moderação de roteiro/imagens; política de uso proíbe imitar pessoas reais sem consentimento | termos + moderação |
| Alfabetização em IA (art. 4) | treinamento interno anual + política de uso interno de IA | `docs/GOVERNANCE/POLICIES/INTERNAL_AI_USE.md` |
| Dados de treino de terceiros | cláusula de **não treinar** com dados do usuário nos contratos | DPA (`docs/legal/DPA.md`) |
| Registro e DPIA por provedor | DPIA em rascunho por provedor; **aprovação humana pendente** | `docs/COMPLIANCE/DPIA/` |

## Limitações a registrar
- O manifesto C2PA é um **sidecar sem assinatura criptográfica** (não é uma credencial C2PA verificável). Assinar com certificado e embutir no contêiner é pendência para conformidade forte.
- Marca visível aplicada por *drawtext* do FFmpeg apenas para a UE; remoção de marca em outras regiões é decisão de produto/jurídica.
- Provedores sem DPA assinado constam como `pending_dpa` — bloqueio de produção até assinatura é regra de governança, não imposta em código.
- Mudanças regulatórias (códigos de prática, atos delegados) exigem revisão semestral (calendário de BCP: cenário `regulatory_change`).
