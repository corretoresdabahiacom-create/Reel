# syntax=docker/dockerfile:1.7
# ---- deps: instala dependências de produção (cache de camada separado) ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

# ---- build: compila TypeScript ----
# Parte do estágio deps (mesmo apt): os estágios rodam em SEQUÊNCIA, não em paralelo — um PC com 8 GB não aguenta
# apt + npm ci + npm ci + pip ao mesmo tempo (achado ao montar no computador da instalação gratuita).
FROM deps AS build
WORKDIR /app
RUN --mount=type=cache,target=/root/.npm npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- voz, transcrição e música abertas (instalação gratuita) ----
# Piper e Kokoro (vozes neurais), faster-whisper (transcrição). Modelos: da pasta models/ do contexto, se existir
# (baixe uma vez com tools/models/baixar.py; build sem internet), senão do Hugging Face/GitHub durante o build.
# Desligue com --build-arg OPEN_AI_MODELS=0 (imagem menor; a voz cai para o espeak-ng; use AI_STT_PROVIDER=mock).
# Só vozes com licença compatível com uso comercial (ou marcadas para revisão) — ver src/providers/ai/voices.ts.
# Parte da imagem base (não do estágio build): mudar o código TypeScript não refaz o apt/pip de ~10 min.
FROM node:22-bookworm-slim AS open-models
ARG OPEN_AI_MODELS=1
# BUNDLE_MODELS=0: instala os programas, mas os modelos ficam FORA da imagem (pasta models/ montada no contêiner;
# docker-compose.free.yml faz isso) — imagem menor e build sem mandar ~800 MB de contexto.
ARG BUNDLE_MODELS=1
ARG PIPER_VOICES="pt/pt_BR/faber/medium/pt_BR-faber-medium pt/pt_BR/cadu/medium/pt_BR-cadu-medium pt/pt_BR/jeff/medium/pt_BR-jeff-medium en/en_US/ljspeech/medium/en_US-ljspeech-medium en/en_US/kristin/medium/en_US-kristin-medium en/en_US/norman/medium/en_US-norman-medium es/es_ES/davefx/medium/es_ES-davefx-medium es/es_MX/claude/high/es_MX-claude-high es/es_MX/ald/medium/es_MX-ald-medium"
ARG WHISPER_MODEL=base
COPY models/ /tmp/models/
RUN mkdir -p /opt/venv /opt/piper/voices /opt/whisper /opt/kokoro && if [ "$OPEN_AI_MODELS" = "1" ]; then \
      apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates curl && rm -rf /var/lib/apt/lists/* \
      && python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir piper-tts==1.8.0 faster-whisper==1.2.1 av==16.1.0 kokoro-onnx==0.4.9 edge-tts==7.3.1 \
      && if [ "$BUNDLE_MODELS" = "1" ]; then for v in $PIPER_VOICES; do n=$(basename $v); \
           if [ -f /tmp/models/piper/$n.onnx ]; then cp /tmp/models/piper/$n.onnx /tmp/models/piper/$n.onnx.json /opt/piper/voices/; \
           else (curl -fsSL -o /opt/piper/voices/$n.onnx https://huggingface.co/rhasspy/piper-voices/resolve/main/$v.onnx && curl -fsSL -o /opt/piper/voices/$n.onnx.json https://huggingface.co/rhasspy/piper-voices/resolve/main/$v.onnx.json) || echo "AVISO: voz $n não baixada"; fi; done \
      && for f in kokoro-v1.0.int8.onnx voices-v1.0.bin; do \
           if [ -f /tmp/models/kokoro/$f ]; then cp /tmp/models/kokoro/$f /opt/kokoro/; \
           else curl -fsSL -o /opt/kokoro/$f https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/$f || echo "AVISO: Kokoro ($f) não baixado"; fi; done \
      && if [ -f /tmp/models/whisper-$WHISPER_MODEL/model.bin ]; then cp -r /tmp/models/whisper-$WHISPER_MODEL /opt/whisper/$WHISPER_MODEL; \
         else (/opt/venv/bin/python -c "from faster_whisper.utils import download_model; download_model('$WHISPER_MODEL', output_dir='/opt/whisper/$WHISPER_MODEL')" || echo "AVISO: modelo do Whisper não baixado"); fi; \
         fi; \
    fi; rm -rf /tmp/models

# ---- runtime: imagem final enxuta, usuário não-root, FFmpeg para montagem/adaptação, espeak-ng (voz aberta leve) ----
FROM node:22-bookworm-slim AS runtime
ARG WHISPER_MODEL=base
ENV NODE_ENV=production PORT=8787 LOCAL_STORAGE_DIR=/data/storage \
    PIPER_BIN=/opt/venv/bin/piper PIPER_VOICES_DIR=/opt/piper/voices \
    WHISPER_PYTHON=/opt/venv/bin/python WHISPER_SCRIPT=/app/tools/whisper/transcribe.py WHISPER_MODEL=/opt/whisper/$WHISPER_MODEL WHISPER_MODELS_DIR=/opt/whisper \
    KOKORO_PYTHON=/opt/venv/bin/python KOKORO_SCRIPT=/app/tools/kokoro/speak.py KOKORO_MODEL=/opt/kokoro/kokoro-v1.0.int8.onnx KOKORO_VOICES=/opt/kokoro/voices-v1.0.bin \
    MUSIC_SOUNDFONT=/usr/share/sounds/sf2/FluidR3_GM.sf2
# fluidsynth + fluid-soundfont-gm (FluidR3_GM, licença MIT): instrumentos reais do compositor de trilhas
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core tini ca-certificates curl espeak-ng python3 fluidsynth fluid-soundfont-gm && rm -rf /var/lib/apt/lists/* \
 && groupadd -r nexus && useradd -r -g nexus -d /app nexus && mkdir -p /data/storage && chown -R nexus:nexus /data
COPY --from=open-models /opt/venv /opt/venv
COPY --from=open-models /opt/piper /opt/piper
COPY --from=open-models /opt/whisper /opt/whisper
COPY --from=open-models /opt/kokoro /opt/kokoro
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY templates ./templates
COPY slo ./slo
COPY docs/openapi.yaml ./docs/openapi.yaml
COPY tools/whisper ./tools/whisper
COPY tools/kokoro ./tools/kokoro
COPY tools/edge ./tools/edge
COPY infra/free/music-cc0.json ./infra/free/music-cc0.json
COPY package.json ./
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
USER nexus
EXPOSE 8787 9464
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 CMD curl -fsS http://127.0.0.1:${PORT}/healthz || exit 1
ENTRYPOINT ["/usr/bin/tini", "--"]
# API por padrão. Workers: `node dist/worker.js` (WORKER_QUEUES=… para dedicar pods). Migrações: `node dist/db/migrate.js up`.
CMD ["node", "--import", "./dist/instrumentation.js", "dist/server.js"]
