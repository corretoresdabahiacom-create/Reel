# Privacidade, LGPD e GDPR — NexusReel

> ⚠️ Os textos legais do app (Política de Privacidade e Termos de Uso em PT/EN/ES) são **modelos técnicos**. Devem ser revisados por advogado(a) antes da publicação. Este documento descreve o que o **código** implementa.

## Base legal e papéis
Controlador: NexusReel (preencher razão social/CNPJ). Encarregado (DPO): `privacidade@nexusreel.com` (a configurar). Bases: execução de contrato (gerar/publicar vídeos), consentimento (analytics, marketing, dublagem com IA) e legítimo interesse (segurança/antifraude).

## Consentimento granular
Tipos: `terms` (obrigatório; cobre Termos e Política), `cookies` (analytics/armazenamento opcional), `ai` (processamento de fotos/voz por IA), `marketing`. Cada registro (`ConsentRecord`) guarda `userId`, `type`, `version` (atual: **2026-10**), `acceptedAt`, `revokedAt`. Mostrado no onboarding; revogável em Configurações → Dados e privacidade. Mudança de versão exige novo aceite.

## Direitos do titular (LGPD art. 18 / GDPR arts. 15–20)
| Direito | Implementação |
|---|---|
| Acesso/portabilidade | Exportação JSON (perfil, projetos, publicações, consentimentos, transações; **sem tokens/senhas**). Limite 3 exportações/10 min |
| Eliminação | Exclusão de conta **agendada para 30 dias** (soft-delete); banner permanente, geração/publicação bloqueadas; **cancelável** a qualquer momento antes do prazo; job `runDeletionJob` remove definitivamente |
| Revogação | Botão por consentimento; efeito imediato |
| Informação | Política e Termos acessíveis em Perfil e Paywall |

## Segurança
- Tokens OAuth: **criptografados (TokenVault no servidor)** (AES-256-GCM, `src/services/security/crypto.ts`); **nunca em `localStorage`** (o protótipo só guarda idioma/região e preferências de UI).
- Senhas: **Argon2id** (m=64 MiB, t=3, p=1) — nota/stub em `crypto.ts`; implementação real na Fase 6.
- Rate limiting (`rateLimit.ts`) e limite de gerações por dia (15) como proteção de abuso; stubs de CAPTCHA/detecção de abuso.
- Logs estruturados com **redação** de tokens, e-mails e dados pessoais.
- Trilha de auditoria (`AuditLog`) para ações administrativas, mudança de plano, exportação e exclusão.

## Retenção
Ver `RETENTION.md`.

## Inventário de dados (para Apple Nutrition Label / Play Data Safety)
| Dado | Coletado | Vinculado à identidade | Finalidade | Opcional |
|---|---|---|---|---|
| E-mail, nome | Sim | Sim | Conta | Não |
| Fotos/vídeos do usuário | Sim | Sim | Funcionalidade do app | Não |
| Data de nascimento | Sim | Sim | Verificação de idade | Não |
| Identificadores de dispositivo/uso | Sim | Não* | Analytics | Sim (consentimento) |
| Diagnósticos de falha | Sim | Não | Estabilidade | Sim |
| Compras/transações | Sim | Sim | Cobrança | Não |
\* pseudonimizado.

## Transferência internacional
Multi-região (LATAM/UE/EUA): dados do titular ficam na região da conta (stub no protótipo; implementação real na Fase 6). Subprocessadores previstos: provedor de IA de vídeo/voz, CDN, Sentry, PostHog, gateway de pagamento — listar na política final.

## Pendências 🔧
Revisão jurídica · DPA com subprocessadores · RIPD/DPIA · cookie/consent banner na web pública · processo de resposta a incidentes (72h GDPR / prazo razoável ANPD).
