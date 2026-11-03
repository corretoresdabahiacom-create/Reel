# Módulo 9 — Transcrição, edição pelo texto e agente

**Flags:** `ff_transcript` (transcrição e edição pelo texto) e `ff_agent` (edição agêntica). As duas vêm desligadas.
Com elas desligadas, todas as rotas abaixo respondem **404**, nada é enfileirado e o projeto fica idêntico (teste "flags desligadas").

**Migration:** `0018_transcript_agent` · **Teste:** `tests/31-transcript-agent.test.ts` · **Biblioteca nova:** nenhuma.

## Fluxo
1. **Transcrever:** `POST /projects/:id/transcript` (fila `transcript-generate`, job `transcribe`).
   - Extrai o áudio do vídeo final e chama o STT, que devolve palavras com início/fim em ms e a cena de cada uma.
2. **Editar pelo texto:** `POST /projects/:id/transcript/edits` com operações por índice de palavra.
   - `delete`: vira um corte no vídeo, no ponto médio entre as palavras vizinhas, para não comer sílabas.
   - `replace`: gera TTS da frase nova (Módulo 1: `synthesizeSpeech` + `audioMixer.spliceSpeech`). O áudio original fica mudo só naquele trecho, e a fala nova é ajustada ao tempo com `atempo` (0,5–2×).
   - Gera uma **prévia** (staging). O projeto não muda.
3. **Aplicar:** `POST …/edits/:editId/apply`.
   - Cria uma **versão nova**: uma cena nova com `derived_from_scene_id` para cada cena afetada, mais um vídeo final novo. O vídeo anterior fica no storage (R1).
   - A transcrição passa a valer para o vídeo novo (provedor `derived`) sem chamar o STT de novo.
   - Se o vídeo mudou entre a prévia e a aplicação, a resposta é 409 `source_changed`.
4. **Agente:** comando em linguagem natural (pt/en/es), em três passos.
   - `POST /agent/plan` monta o plano em staging e grava em `agent_runs`.
   - `POST /agent/runs/:id/execute` gera a prévia (fila `agent-execute`).
   - `POST /agent/runs/:id/apply` exige `{"confirm": true}`. Sem isso responde **422 `confirmation_required`** e nada muda.
   - Comandos que o agente entende:
     - cortar os primeiros/últimos N s;
     - remover a cena N;
     - deixar com N s;
     - remover pausas;
     - remover a palavra/frase "X";
     - trocar "X" por "Y".
   - No máximo 20 passos. Comando não entendido gera plano vazio, e executar dá 422 `plan_empty`.
   - O planejador `mock` é determinístico. Um LLM entra no lugar dele com a mesma saída (`Plan`), e a validação continua no motor de edição.

## Segurança e LGPD
- **Transcrição é dado sensível:**
  - `segments_json` é cifrado (AES-256-GCM, mesma chave de dados do app) e a prévia (`result_json`) também;
  - retenção de **90 dias** (`TRANSCRIPT_RETENTION_DAYS`), com o job diário `transcript-retention`;
  - é apagada **junto com o projeto** (no soft delete e no job) e na exclusão de conta.
- **Nunca em log:**
  - os logs registram só ids, contagens e tempos;
  - erros do provedor viram `stt_failed` sem corpo;
  - a auditoria guarda contagens de cortes e substituições, nunca o texto nem o comando.
  - **Evidência:** o teste espiona todos os níveis do logger, despeja as linhas em `TRANSCRIPT_LOG_EVIDENCE` e procura palavras-marcador que só existem na transcrição. Também varre `audit_logs` e os jobs das filas.
- **Sem treino (opt-out):**
  - Deepgram com `mip_opt_out=true`;
  - OpenAI (API) não treina com dados enviados pela API por padrão;
  - `GET /transcript/config` devolve `trainingOptOut: true`.
- **O agente nunca aplica sozinho:** é preciso uma prévia pronta e `confirm: true`, e toda aplicação cria versão nova.
- **Rate limit (429):**
  - transcrever: **20/h por usuário** (mais 60/h por IP);
  - executar o agente: **10/h por usuário** (mais 30/h por IP);
  - editar e planejar: 60/h por usuário e por IP.
- **Idempotency-Key** é obrigatório em todos os POST.
- **`ai_usage`:** `stt`, `tts_inline`, `agent_plan` e `video_edit`.
- **RLS:** as três tabelas são só do dono (`user_id = app_uid()`).
- **Exportação LGPD:** a transcrição volta decifrada, só para o titular, junto com edições e `agent_runs`.

## Provedores
| `AI_STT_PROVIDER` | Uso |
|---|---|
| `mock` (padrão) | Alinha o texto das cenas às janelas com energia no áudio (determinístico, para dev e testes) |
| `openai` | whisper-1, `verbose_json`, granularidade por palavra (`OPENAI_API_KEY`) |
| `deepgram` | nova-2, `mip_opt_out=true` (`DEEPGRAM_API_KEY`) |

## Variáveis de ambiente
| Variável | Padrão | Uso |
|---|---|---|
| `AI_STT_PROVIDER` | `mock` | Provedor de transcrição: `mock`, `openai` ou `deepgram` |
| `DEEPGRAM_API_KEY` | — | Chave do Deepgram (só no servidor) |
| `AI_AGENT_PROVIDER` | `mock` | Planejador do agente |
| `TRANSCRIPT_RETENTION_DAYS` | `90` | Validade da transcrição |
| `EDIT_URL_TTL_SEC` | `86400` | Validade das URLs assinadas das prévias |

## Critérios de aceite → evidência
| Critério | Teste |
|---|---|
| Transcrever com timestamps | Palavras em ordem, `end > start`, cena em cada palavra, `ai_usage stt`, texto cifrado no banco |
| Apagar frase e ver o corte | Prévia mais curta; o projeto só muda ao aplicar; duração nova ≈ original − corte; cenas derivadas |
| Substituir palavra e ouvir TTS | `ai_usage tts_inline` +1; a duração se mantém; a palavra nova aparece na transcrição e no texto da cena |
| Agente: prévia e versão nova | plan → execute → apply; sem `confirm` dá 422; com `confirm` gera cenas derivadas e vídeo novo |
| `agent_runs` com plano e aplicação | `command`, `plan_json`, `applied`, `applied_by`, `applied_at` |
| 429 | 21ª transcrição e 11ª execução do agente |
| Flags desligadas = app idêntico | Todas as rotas dão 404 e o projeto não muda |

## Riscos e limites
- **STT real (Whisper/Deepgram):** não verificável aqui, porque não há rede nem chaves; só o mock foi exercitado.
- **Qualidade do mock:** o alinhamento por energia é aproximado. Com STT real os tempos vêm do provedor.
- **TTS substituído:** a voz é a do provedor de TTS, não a do locutor original. A clonagem de voz (Módulo 1) exige consentimento e não é usada automaticamente.
- **Cortes:** são precisos ao quadro, porque o vídeo é recodificado. Cortes muito curtos (< 20 ms) são recusados.
