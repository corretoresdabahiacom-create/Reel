# Módulo 11 — Acessibilidade + Teleprompter

**Flags:** `ff_accessibility` e `ff_teleprompter`, ambas desligadas por padrão.
- **Com a flag desligada:** as rotas respondem **404**, inclusive o envio da gravação, conferido antes de ler o corpo. O player fica igual.
- **Correções de WCAG:** as do app inteiro (contraste, alvo de toque, foco) valem para todos, porque não são funcionalidade nova.

**Migration:** `0020_accessibility_teleprompter` · **Teste:** `tests/33-accessibility-teleprompter.test.ts`.

**Bibliotecas novas:** nenhuma no backend (libass já vem no FFmpeg). A imagem Docker ganha `fonts-dejavu-core` (fonte das legendas gravadas).

## Legendas animadas por palavra (`generateAnimatedCaptions`)
- **Idiomas:** pt-BR, en e es. Gera **um arquivo por idioma**, pela fila `accessibility-generate` (idempotente).
- **Tempos das palavras:** vêm da transcrição do Módulo 9 quando ela existe e está atual. Senão, o texto das cenas é distribuído na duração da fala. Para outros idiomas usa a mesma tradução do módulo de dublagem (`mockTranslate`; `ai_usage caption_translate`).
- **Karaokê:** arquivo ASS com `\kf`. Cada palavra é preenchida com a cor de destaque no tempo em que é falada.
- **Saída:**
  - **vídeo novo** com a legenda gravada (`projects/<id>/a11y/captions-<id>.mp4`, metadados removidos);
  - o `.ass`, para uso como faixa.
  - O original não muda.
- **Estilos acessíveis** (`padrao`, `alto_contraste`, `grande`, `dislexia`):
  - texto em caixa;
  - fonte sem serifa, sem itálico;
  - tamanho de 1× a 2×;
  - posição embaixo ou em cima.
- **Contraste medido (WCAG 1.4.3):** precisa ser ≥ **4,5:1** entre texto e caixa e entre destaque e caixa, considerando o pior caso de fundo claro atrás de caixa semitransparente. Abaixo disso dá 422.
- **Verificado no teste:** o quadro do vídeo tem a cor de destaque acesa na palavra falada.

## Audiodescrição revisável (`generateAudioDescription`)
- **Geração:** descreve cada cena (provedor `mock` local, a partir do que foi pedido para a cena).
- **Filtro (`describe.ts/sanitize`), aplicado na geração e de novo na revisão:**
  - retira contatos e documentos: e-mail, telefone, CPF/CNPJ, cartão, URL, @perfil, placa;
  - retira **características sensíveis** atribuídas a pessoas: origem étnica, religião, saúde, deficiência, orientação sexual, gravidez, política, idade.
- **Revisão humana obrigatória:**
  - a geração para em `pending_review`;
  - `POST /accessibility/assets/:id/review` com `approve: true` aceita edições, que passam pelo filtro de novo;
  - só então é gerada a narração: TTS (`ai_usage tts_inline`) por cima do áudio original abaixado para 25%, mais o WebVTT `descriptions`;
  - **regra no banco:** audiodescrição `ready` exige `reviewed_at`.

## Transcrição completa + SRT/VTT assinado (`exportTranscript`)
- **Formatos:** SRT, VTT ou TXT, com falas de até 12 palavras, 84 caracteres e 7 s.
- **Assinatura:** **HMAC-SHA256** do conteúdo exato (`v1.<base64url>`), com chave derivada da chave de dados. Também guarda o `sha256`.
  - `POST /accessibility/transcripts/verify` confere o arquivo; qualquer caractere mudado dá 422.
- **Download:** por **URL assinada**.
- **Retenção:** **90 dias** (`TRANSCRIPT_RETENTION_DAYS`), com o job diário `accessibility-retention` apagando arquivo e registro.

## Teleprompter (`startSession`, `recordSession`)
- **Sessão:** roteiro (até 20 mil caracteres) e ajustes: 60–220 palavras/min, tamanho 1–3×, espelhamento, contagem de 0–10 s e linha-guia. A resposta traz o tempo estimado.
- **Câmera e microfone:** pedidos pelo app **só** quando a pessoa toca em "Permitir", depois de uma explicação. Nada disso passa pelo servidor.
- **A gravação fica no aparelho.** O envio ao projeto (`POST …/recording`):
  - exige **`x-upload-opt-in: true`**, conferido em `onRequest`, **antes de ler o corpo**. Sem ele dá 422, **nenhum byte é lido nem guardado**;
  - aceita só WebM ou MP4 (pelos bytes), até `TELEPROMPTER_MAX_BYTES` (150 MB);
  - é feito uma vez só (repetir dá 409);
  - pede Idempotency-Key no cabeçalho, sem guardar hash do vídeo.
- **Regra no banco:** gravação no servidor exige `upload_opt_in_at`.
- **Exclusão:** apagar a sessão apaga a gravação enviada.
- **`ai_usage`:** nenhum, porque o teleprompter não chama provedor.

## WCAG 2.2 AA no app (frontend)
- **CI:** `axe-core` 4.13.0 roda em **Chromium real** (`npm run a11y`, workflow `frontend-ci.yml`).
- **Cobertura:** 44 telas e estados (390 px e 1280 px), com as flags dos módulos desligadas e ligadas.
- **Teclado:** 22 checagens: foco visível em cada elemento alcançado por Tab, abas por setas, atalhos do teleprompter.
- **Correções feitas:**

  | Item | Correção |
  |---|---|
  | Botão "Continuar com Meta" (4,23:1) | `#166FE5` (4,73:1) |
  | Selo do TikTok (3,65:1) | `#E11D48` (4,70:1) |
  | Seleção roxa com texto branco | `#6D28D9` (7,1:1) |
  | Segmentos do player com 18 px | 24 px (WCAG 2.5.8) |
  | Carrossel da apresentação | Alcançável por teclado (`tabindex`, região rotulada) |
  | Campos de texto | Contorno visível no foco por teclado |

- **Leitor de tela:** o roteiro do teste manual está em `docs/ACCESSIBILITY.md` (frontend). **Ele não foi executado nesta sessão** (não há leitor de tela aqui) — **não verificável**.

## LGPD e logs
- **Texto cifrado:** legendas, descrições e transcrições ficam cifrados (`content_json`).
- **Logs e auditoria:** só ids e contagens. O teste confere que não aparecem roteiro, texto de legenda, descrição nem e-mail.
- **Exportação:** traz os textos decifrados só ao titular, e as sessões com o roteiro.
- **Exclusão de conta:** apaga tudo.

## Riscos e limites
- **Tradução das legendas en/es — PARCIAL:**
  - não há provedor de tradução no projeto; o módulo de dublagem usa o mesmo `mockTranslate`;
  - a faixa en/es é gerada com tempos, estilo e karaokê, mas **o texto continua no idioma original** até plugar um tradutor real;
  - o ponto de troca é `wordsFor()` em `accessibilityService.ts`, e o `ai_usage caption_translate` já é registrado.
- **Audiodescrição:** o provedor `mock` descreve a partir do que foi pedido para a cena (prompt), não dos quadros reais. Um modelo de visão entra em `describe.ts` com o mesmo filtro e a mesma revisão.
- **Leitor de tela:** o teste manual (VoiceOver, TalkBack, NVDA) tem roteiro, mas **não foi executado** — **não verificável aqui**.
- **Teleprompter com câmera real:** só foi testado com câmera simulada (E2E). `getUserMedia` e `MediaRecorder` em iPhone, Android e desktop **não foram verificados**. No iOS, o WebView do Capacitor exige as permissões `NSCameraUsageDescription` e `NSMicrophoneUsageDescription`.
- **Imagem Docker:** ganhou `fonts-dejavu-core`, mas o build não foi rodado aqui (sem Docker).
- **Também não verificável:** staging e produção.

## Critérios de aceite → evidência
| Critério | Teste |
|---|---|
| Legendas animadas pt-BR e en | 2 arquivos prontos; `\kf` = nº de palavras; quadro com a palavra acesa; tradução en (`caption_translate`); original intacto |
| Audiodescrição | Filtrada, em `pending_review`, aprovação humana, faixa narrada (2 TTS) + VTT `descriptions`; o banco barra `ready` sem revisão |
| Exportar SRT/VTT | Formato válido, assinatura confere, alterado = 422, `sha256` confere, 90 dias, job apaga |
| Teleprompter mobile/desktop | API (sessão, ajustes) + UI (E2E `drive-a11y`, auditoria em 390 e 1280 px) |
| Teclado nas telas críticas | 22 checagens sem problemas (`evidence/axe-report.json`) |
| axe-core sem erros críticos no CI | 0 critical, 0 serious, 0 moderate, 0 minor |
| Grava só após permissão; local até opt-in | Testes de API (422 sem opt-in, nada guardado; regra no banco) + E2E (câmera só após "Permitir"; 0 chamadas de rede ao gravar) |
| Flags desligadas = app idêntico | 404 em todas as rotas; player sem os botões |
