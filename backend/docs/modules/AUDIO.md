# Módulo 1 — Áudio (música, voz, SFX, mixagem)

**Flag:** `ff_audio` (desligada por padrão). Com a flag desligada, todas as rotas abaixo respondem **404**, o preview final não mostra o botão de áudio e a publicação usa exatamente o vídeo de sempre.
**Migration:** `0010_audio` · **Testes:** `tests/23-audio.test.ts` (15) e `tests/e2e/drive-audio.cjs` no frontend (31 verificações) · **Fila:** `audio-mix` (+ `audio-mix-dlq`).

## Objetivo
- **Biblioteca de trilhas licenciadas por região:** humor, gênero, BPM e duração.
- **Música original por IA:** gerada a partir do tom descrito pelo usuário.
- **SFX contextuais:** com timing sugerido pelos cortes de cena.
- **Voz clonada do próprio usuário:** só com consentimento verificado.
- **Mixagem automática:**
  - ducking da trilha quando a voz entra;
  - normalização em **-14 LUFS**;
  - stems separados (voz, música e SFX);
  - um **vídeo novo**: o MP4 original nunca é sobrescrito.

## Arquitetura
```
App (AudioOverlay, atrás de ff_audio)
  │  GET /audio/config · /audio/tracks · POST /projects/:id/audio/mix (Idempotency-Key) …
  ▼
audio.routes.ts ──► audio.service.ts ──► fila BullMQ "audio-mix" (retry 3× exponencial, DLQ, métricas)
  │                     │                        │
  │                     ├─ musicLibrary.ts       ▼
  │                     ├─ sfxSuggester.ts   worker → audioMixer.mixTracks()  (FFmpeg)
  │                     ├─ voiceClone.ts           ├─ extractAudio + detectVoice (VAD)
  │                     └─ providers.ts            ├─ sidechaincompress (ducking)
  │                         (breaker R14 + ai_usage R11)
  │                                                ├─ loudnorm 2 passadas → -14 LUFS
  │                                                └─ mux (vídeo copiado) + 3 stems → storage
  ▼
Postgres (RLS): music_tracks · audio_versions · voice_models · consents (voice_clone) · projects.active_audio_version_id
```
- **Wrapper, não alteração:** `assembleVideo` não muda. O mixer parte do vídeo final pronto e grava os arquivos novos em `projects/<id>/audio/<versão>/`.
- **Publicação:** `audioService.effectiveVideoRef` publica o vídeo mixado ativo só se todas as condições valerem:
  - `ff_audio` ligada para o usuário;
  - a versão é da montagem atual. Se o vídeo for remontado, volta sozinho para o vídeo novo.
  - Qualquer erro cai no comportamento atual.
- **Assinatura pedida no prompt:** `mixTracks({ voiceUrl?, musicUrl, sfxEvents })` devolve `{ mixedUrl, stems: { voiceUrl | null, musicUrl, sfxUrl } }`, mais `videoUrl` e `loudnessLufs`.
  - Sem `voiceUrl`, a voz é extraída do vídeo (`extractAudio`).
  - Sem fala detectável (VAD), `stems.voiceUrl = null`.
- **Voz clonada, fluxo linear** (`voiceClone.ts`), um passo por chamada:
  1. `requestConsent` → frase única;
  2. `uploadConsentSample` → amostra **criptografada** (AES-256-GCM), uma por consentimento;
  3. `verifyConsent` → duração 5–60 s, fala (VAD) e SNR ≥ 15 dB, depois marca `verified_at`. Se reprovar, apaga a amostra para regravar;
  4. `cloneVoice` → **403 sem `verified_at`**.
  - Revogar apaga a amostra e desativa os modelos na hora.

## Endpoints (todos com login; 404 se `ff_audio` estiver desligada)
| Método | Rota | Notas |
|---|---|---|
| GET | `/audio/config` | Banner "Seu áudio será processado por…", provedores, humores, SFX, mensagens (pt-BR/en/es) |
| GET | `/audio/tracks` | Filtros: `mood`, `genre`, `bpmMin`, `bpmMax`, `minDurationSec`, `maxDurationSec`. Só licenças da região do usuário e as trilhas geradas por ele |
| GET | `/audio/tracks/:id/preview` | URL assinada de 24 h |
| POST | `/audio/tracks/generate` | **Idempotency-Key obrigatória**; limite de 20/h por usuário e por IP |
| POST | `/projects/:id/audio/sfx-suggestions` | `{ timestampSec, sfxId, reason }[]` |
| POST | `/projects/:id/audio/mix` | **Idempotency-Key obrigatória**; 202 + `audioVersionId`; limite de 30/h por usuário e por IP |
| GET | `/projects/:id/audio/versions` | `videoUrl`, `mixedUrl` e `stems.{voiceUrl, musicUrl, sfxUrl}` assinadas por 24 h |
| POST | `/projects/:id/audio/versions/:versionId/activate` | Usa a versão no preview e na publicação |
| POST | `/projects/:id/audio/revert` | "Reverter para áudio original" (só volta o ponteiro) |
| GET/POST | `/audio/voice/consents` | Lista; abre consentimento (Idempotency-Key) |
| PUT | `/audio/voice/consents/:id/sample` | Áudio cru, ≤5 MB |
| POST | `/audio/voice/consents/:id/verify` | 422 com `reasons`: `too_short`, `too_long`, `no_speech`, `too_noisy` |
| POST | `/audio/voice/clone` | **403 `voice_consent_required`** sem consentimento verificado |
| DELETE | `/audio/voice/consents/:id` | Revoga |

## Migrations (`0010_audio`, só acréscimos)
- **`music_tracks`:** id, title, mood, genre, bpm, duration, license_region[], file_url, owner_user_id, source.
  - Seed de 8 faixas **sintéticas de demonstração** (`builtin:*`, geradas por FFmpeg, sem direitos de terceiros).
  - Exemplos de licença regional: "Lo-fi" só LATAM; "Grande Final" só US/EU.
- **`audio_versions`:** id, project_id, scene_id, voice_url, music_url, sfx_url, **voice_stem_url, music_stem_url, sfx_stem_url** (três colunas, sem `stems_url`), status, created_at e mais:
  - `source_video_key`, `mixed_url`, `video_url`, `loudness_lufs`;
  - `settings`, `sfx_events`, `voice_source`, `voice_model_id`, `music_track_id`;
  - `error_code`, `updated_at`.
- **`voice_models`:** id, user_id, consent_id, provider, provider_voice_id, status, created_at, deleted_at.
- **Colunas novas em tabelas existentes:**
  - `projects.active_audio_version_id`: nula, FK `NOT VALID`, sem varrer `projects`;
  - `consents.challenge_hash`: hash da frase do desafio; a frase em claro não é guardada.
- **RLS:**
  - `audio_versions` herda do projeto;
  - `voice_models` só para o dono;
  - `music_tracks`: a biblioteca é leitura pública, a trilha gerada só o dono vê, e só system/admin escreve.
- **Rollback:** `npm run migrate:down`. **Recusa** reverter se houver mixagens, vozes ou trilhas geradas por usuários, para não apagar dados em silêncio.

## Regras globais atendidas
| Regra | Como |
|---|---|
| R1 flag | `requireAudio()` em todas as rotas; frontend com `ffOn()` estrito (flag ausente conta como desligada) |
| R2 original intacto | O mix gera MP4 novo; o teste compara o hash do original antes e depois |
| R3 fila | `audio-mix` com retry exponencial 3×, DLQ e as métricas `queue_depth`, `job_duration_ms` e `job_failures_total` (genéricas) |
| R4 server-side | Provedores só no servidor; o cliente recebe só URLs assinadas |
| R5 URLs assinadas | `AUDIO_STEM_URL_TTL_SEC=86400` (24 h); o teste confere `exp` de cerca de 24 h |
| R6 consentimento | `voice_clone` com timestamp, versão, hash de IP/UA, prova e `verified_at`; sem verificação → 403. `external_provider` é exigido quando o provedor configurado é externo (os mocks rodam local) |
| R7 logs | Só IDs, status, latência, LUFS e provedor; sem transcrição, e-mail ou nome |
| R8 aditivo | Só `CREATE`/`ADD COLUMN` nula; FK `NOT VALID`; `lock_timeout` de 5 s |
| R9 testes | Mock (FFmpeg) com Postgres e Redis reais; Testcontainers **não verificável aqui** (mesmo esquema do resto do projeto) |
| R11 ai_usage | `music_generate`, `voice_clone_create`, `voice_clone_tts`, `voice_clone_delete` e `sfx_suggest` (local), com `status` ok/erro |
| R12 idempotência | Gerar trilha, abrir consentimento, clonar e mixar: chave obrigatória, replay idêntico, 422 se o corpo mudar |
| R13 rate limit | Por usuário **e** por IP nas rotas de voz, geração e mixagem |
| R14 breaker | 3 falhas em 5 min abrem o circuito do provedor (chave própria `cb:open:music:*`, separada da do vídeo); o usuário recebe 503 com a mensagem "escolha uma faixa da biblioteca" |
| R15 LGPD | Arquivos em `projects/<id>/` e `uploads/<user>/`, apagados na exclusão de conta; exportação inclui versões, modelos de voz e trilhas geradas (teste 23); versões não usadas somem após `AUDIO_VERSION_RETENTION_DAYS` (90) |

## Critérios de aceite → evidência
| Critério | Verificado por |
|---|---|
| Com `ff_audio` ON: trilha, volumes, mixagem, nova versão mixada | teste 23 "mixagem…" + E2E "mixagem e versões" |
| Stems acessíveis por URL assinada | teste 23: as 3 URLs respondem 200 e têm `exp` de cerca de 24 h |
| Voz clonada exige `verified_at` | teste 23: 403 antes, 201 depois; após revogar, 403 de novo |
| Com `ff_audio` OFF: app idêntico | teste 23: 8 rotas → 404, `GET /projects/:id` sem campos novos; publicação usa o vídeo original; E2E sem o botão; suíte completa verde |
| Idempotency-Key no POST de mixagem | teste 23: 400 sem chave; replay com o mesmo `audioVersionId` e `idempotent-replay`; 422 com outro corpo; uma linha só |
| `ai_usage` em cada chamada | teste 23 confere as linhas por operação, inclusive as de erro |
| -14 LUFS e ducking | teste 23 mede de novo o arquivo (±1 LU) e a trilha fica ≥4 dB mais baixa com a voz |

**Desempenho medido:** vídeo de 60 s em 1080x1920@30 mixado em **10,8 s** numa máquina de 2 vCPU. O vídeo é copiado sem recodificar.

## Riscos e limites
- **Provedores reais não plugados:**
  - **Música:** só o mock, que gera trilhas sintéticas. O catálogo licenciado real exige contrato e importação por região.
  - **Voz clonada:** só o mock. O provedor real exige contrato com **opt-out de treino global**; isso **não é verificável** aqui.
  - Com `AI_*_PROVIDER` real, o consentimento `external_provider` passa a ser exigido.
- **Frase do desafio:** conferir se a amostra contém a frase exige transcrição (Módulo 9). Hoje a verificação cobre duração, fala e ruído; o hash da frase fica guardado para essa conferência.
- **VAD heurístico:** sem modelo; calibrado para separar fala de trilha e tom contínuo. Pode ser trocado por Silero ou WebRTC VAD sem mudar a interface.
- **Escolha de SFX:** os cortes de cena valem para cortes visíveis (limiar 0,15). Sem corte detectável, usa as fronteiras das cenas.
- **Prévia no app:** usa Web Audio sintético (leve, sem baixar arquivos), não o mix real. O mix real fica nas URLs das versões.
- **Prod:** manter `ff_audio` desligada até plugar provedores reais e catálogo licenciado.

## Como ligar (staging)
```sql
UPDATE feature_flags SET enabled = true, rollout_percent = 10 WHERE key = 'ff_audio';   -- ou pelo painel admin de flags
```
**Rollback de comportamento:** `enabled = false`, com efeito imediato (cache de flags de 60 s).
