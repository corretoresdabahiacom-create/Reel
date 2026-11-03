# Modelos abertos (opcional)

Pasta usada pelo build do Docker para não baixar os modelos de novo (e para build sem internet).
Baixe uma vez com `python3 tools/models/baixar.py models`. O conteúdo não vai para o Git (só este arquivo).

- `piper/` — vozes Piper (`.onnx` + `.onnx.json` + `MODEL_CARD`)
- `kokoro/` — `kokoro-v1.0.int8.onnx` e `voices-v1.0.bin`
- `whisper-base/`, `whisper-small/` — modelos do faster-whisper (`model.bin`, `config.json`, `tokenizer.json`, `vocabulary.txt`)

Licenças das vozes: `src/providers/ai/voices.ts` e os `MODEL_CARD` de cada voz.
