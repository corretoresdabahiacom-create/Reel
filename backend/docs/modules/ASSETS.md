# Módulo 6 — Assets derivados (GIF, figurinha, wallpapers, multimídia automotiva, screensaver)

**Flag:** `ff_assets` (desligada por padrão). Com a flag desligada:
- as rotas abaixo respondem **404**;
- o player não mostra o botão;
- a resposta dos projetos não ganha campo nenhum.

**Migration:** `0015_assets` · **Testes:** `tests/28-assets.test.ts` (15) e, no frontend, `tests/e2e/drive-assets.cjs` (26 verificações) · **Fila:** `assets-derive` (o `assets:derive` do spec; o BullMQ não aceita `:`), com DLQ · **Job diário:** `assets-retention`.

**Tudo local:** as conversões rodam no backend com FFmpeg, e nada vai a provedor externo. O `ai_usage` registra `provider='local'` (operações `asset_<tipo>` e `asset_<tipo>_cache`) só para medir.

## Entregáveis
| Arquivo | O quê |
|---|---|
| `src/modules/assets/derivedAssetsService.ts` | `toGif`, `toSticker`, `toWallpaper`, `toCarMultimedia`, `toScreensaver`, mais `request`, `process` (worker), `status`, `list`, `profiles` e `purgeExpired` |
| `src/modules/assets/engine.ts` | Comandos FFmpeg: loop perfeito, preenchimento com fundo desfocado, GIF com paleta, WebP animado, Live Photo, perfil automotivo, quadros do screensaver |
| `src/config/deviceProfiles.ts` | iPhone (Live Photo), Android FHD+/QHD+, PC 1080p/1440p/4K, screensaver Windows/macOS |
| `src/config/carProfiles.ts` | Genérico USB, Volkswagen, Toyota, Chevrolet, Hyundai/Kia e Fiat, **todos em H.264 Baseline** |
| `migrations/0015_assets` | `derived_assets (id, user_id, source_project_id, type, device_profile, file_url, size_bytes, cache_key, created_at)`, mais `output_config`, `status`, `error_code`, `mime`, `file_name`, `cache_hit`, `info`, `expires_at`. RLS por dono |

## O que cada tipo gera
| Tipo | Saída | Regras |
|---|---|---|
| `gif` | `.gif` | **Loop perfeito** (a cauda funde com a cabeça; o teste mede a emenda ≈ diferença entre quadros vizinhos), **≤10 s, ≤10 MB**. Se passar do tamanho, reduz largura, FPS e cores até caber |
| `sticker` | `.webp` animado 512×512 | **Fundo transparente** (a cor da borda vira alfa, como no Módulo 2), loop, alvo ≤500 KB (padrão de figurinha animada), ≤6 s |
| `wallpaper` + `iphone_live` | `.zip` com `.mov` + `.jpg` + `live.json` | MOV QuickTime (H.264 + AAC) com `com.apple.quicktime.content.identifier`, JPEG do quadro-chave e manifesto com o mesmo identificador, 3 s, 1080×1920 |
| `wallpaper` + `android_fhd` / `android_qhd` | `.mp4` | Loop, sem áudio, 1080×2400 / 1440×3200 |
| `wallpaper` + `pc_1080` / `pc_1440` / `pc_4k` | `.mp4` (H.264) ou `.webm` (VP9) | Loop; o vídeo vertical encaixa sobre uma versão desfocada dele mesmo (sem barras pretas) |
| `car` + marca | `.mp4` | **H.264 Constrained Baseline**, sem B-frames, nível 3.1, `yuv420p`, AAC-LC estéreo 44,1 kHz, `faststart` |
| `screensaver` + `windows` / `macos` | `.zip` | 12 JPEG (1920×1080 / 2560×1600) numa pasta para o **protetor de tela nativo de fotos**, o vídeo em loop e um `LEIA-ME.txt` (pt/en/es). **Nenhum executável** (.scr/.saver): esses arquivos sem assinatura são bloqueados pelo SmartScreen/Gatekeeper e seriam um risco |

## Cache isolado por usuário
- **Chave:** `cache_key = sha256("nexusreel-asset", user_id, source_project_id, sha256 do vídeo de origem, output_config canônico)`. O `output_config` inclui `ENGINE_VERSION`: mudar a conversão invalida o cache.
- **Busca:** `WHERE user_id = <dono> AND cache_key = …`, sob o RLS do dono. Além disso, o arquivo reaproveitado precisa estar em `derived/<user_id>/`.
- **Arquivo:** `derived/<user_id>/<cache_key>.<ext>`, no bucket de vídeos.
- **Teste explícito** ("ISOLAMENTO DO CACHE"):
  - B tem um vídeo **byte a byte igual** ao de A e pede a mesma configuração: a chave é diferente, não há cache, e o arquivo vai para `derived/<B>/`;
  - **ataque simulado:** a linha de A recebe exatamente a chave que B calcula, e mesmo assim B não reaproveita;
  - B recebe 404 ao ler o asset de A e ao gerar a partir do projeto de A.
- O mesmo pedido do **mesmo** usuário reaproveita o arquivo na hora (`cache_hit=true`), sem converter de novo.

## Segurança
- **URLs:** só assinadas (24 h), com `Content-Disposition` e o nome padronizado.
- **Nome do arquivo:** `nexusreel-<tipo>[-<perfil>]-<id>.<ext>`. **Nunca leva o título** do projeto (o teste confere).
- **Metadados da origem** (localização, aparelho, título) não passam para o asset (`-map_metadata -1`). O teste coloca localização e um nome na origem e confere a saída.
- **Origem só lida:** o hash do vídeo e a linha do projeto continuam iguais.
- **RLS:** `derived_assets` só para o dono; projeto de outro usuário dá 404.
- **R13:** 30 pedidos por hora por usuário e por IP. A Idempotency-Key é obrigatória.
- **LGPD:**
  - a exportação da conta lista os assets (sem `cache_key` nem caminho);
  - a exclusão da conta apaga `derived/<user_id>/` e as linhas.
- **Retenção:** 30 dias (`ASSETS_TTL_DAYS`). O job só apaga o arquivo quando nenhum asset válido do mesmo usuário ainda o usa pelo cache (testado).

## Endpoints (login; 404 sem `ff_assets`)
| Método | Rota | Notas |
|---|---|---|
| GET | `/assets/profiles` | Tipos, perfis de aparelho e automotivos (`verified: false`) e limites |
| POST | `/projects/:projectId/assets` | **Idempotency-Key obrigatória**; 202. Corpo: `type`, `profile`, `format` (`mp4`/`webm` no PC), `startSec`, `durationSec`. Perfil inválido devolve 422 com a lista permitida |
| GET | `/assets` (`?projectId=`) · `/assets/:assetId` | Estado, medidas, `cacheHit`, instrução de uso e URL assinada |

O plugin é registrado antes de `projectsRoutes`. `/projects/assets` continua sendo só um id inválido (400).

## Critérios de aceite → evidência
| Critério | Teste |
|---|---|
| GIF | Loop (emenda medida), ≤10 s, ≤10 MB, decodifica |
| Sticker transparente | WebP 512×512, alfa 0 no canto e 255 no centro, várias imagens, ≤500 KB |
| Wallpaper iPhone | Zip com MOV (brand `qt`, identificador igual ao do `live.json`) + JPEG 1080×1920 |
| Wallpaper Android e PC | MP4 1080×2400, MP4 1080p e WebM VP9 4K, sem áudio, decodificam |
| Multimídia de 2 marcas | Volkswagen 1280×720 e Toyota 800×480: **Constrained Baseline**, `has_b_frames=0`, nível ≤3.1, AAC-LC |
| Screensaver Windows | 12 JPEG 1920×1080 + MP4 + LEIA-ME, sem executável, zip íntegro (`unzip -t`) |
| A não acessa o asset de B pelo cache | "ISOLAMENTO DO CACHE" (acima) |
| Flag desligada = app idêntico | 404, projeto igual, nada gravado, E2E sem botão |

**Desempenho medido** (2 vCPU, origem 360×640 de 12 s):

| Asset | Tempo |
|---|---|
| GIF de 10 s | cerca de 9 s |
| Sticker | cerca de 1 s |
| Live Photo | cerca de 2 s |
| Android de 5 s | cerca de 4,5 s |
| WebM 4K de 3 s | cerca de 7 s |
| Carro de 12 s | cerca de 3 s |
| Screensaver | cerca de 5 s |

## Riscos e limites
- **Live Photo:** o servidor entrega o par MOV + JPEG com o identificador no MOV e no `live.json`. Para as Fotos do iPhone reconhecerem o par, o identificador também precisa estar no JPEG (MakerApple, tag 17). O app iOS grava esse dado ao salvar (PHAssetCreationRequest com `.photo` + `.pairedVideo`). **Não verificável aqui:** não há iPhone, e esse código nativo não existe no repositório.
- **Perfis automotivos:** são conservadores (`verified: false`) e não foram confirmados em manual de cada marca. O codec Baseline foi verificado; a reprodução em uma central real **não é verificável aqui**.
- **Android:** o papel de parede animado depende de um app ou serviço de live wallpaper (nem todo launcher aceita vídeo direto).
- **Screensaver:** usa o protetor de fotos nativo (slideshow dos quadros). O vídeo em loop vai junto para quem usa apps de protetor com vídeo.
- **Sticker:** o recorte usa a cor da borda (como o Módulo 2) e funciona melhor com fundo liso. Um recorte por segmentação exigiria um modelo, fora do escopo "só local, sem provedor".
- **Também não verificável:** staging e produção.

## Como ligar (staging)
```sql
UPDATE feature_flags SET enabled = true, rollout_percent = 10 WHERE key = 'ff_assets';
```
