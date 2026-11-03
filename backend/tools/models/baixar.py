#!/usr/bin/env python3
"""Baixa os modelos ABERTOS de voz e transcrição para a pasta models/ (uma vez; o build do Docker reaproveita).

Uso: python3 tools/models/baixar.py models [--whisper base,small]
Só biblioteca padrão do Python. Retoma de onde parou (arquivo .part). Fontes: Hugging Face (rhasspy/piper-voices,
Systran/faster-whisper-*) e GitHub (thewh1teagle/kokoro-onnx). Nada é enviado: só downloads.
"""
import os
import sys
import time
import urllib.request

HF = "https://huggingface.co/rhasspy/piper-voices/resolve/main/"
VOICES = ["pt/pt_BR/faber/medium/pt_BR-faber-medium", "pt/pt_BR/cadu/medium/pt_BR-cadu-medium", "pt/pt_BR/jeff/medium/pt_BR-jeff-medium",
          "en/en_US/ljspeech/medium/en_US-ljspeech-medium", "en/en_US/kristin/medium/en_US-kristin-medium", "en/en_US/norman/medium/en_US-norman-medium",
          "es/es_ES/davefx/medium/es_ES-davefx-medium", "es/es_MX/claude/high/es_MX-claude-high", "es/es_MX/ald/medium/es_MX-ald-medium"]


def jobs(whisper):
    out = []
    for v in VOICES:
        n = v.rsplit("/", 1)[1]
        d = v.rsplit("/", 1)[0]
        out += [(HF + v + ".onnx", f"piper/{n}.onnx"), (HF + v + ".onnx.json", f"piper/{n}.onnx.json"), (HF + d + "/MODEL_CARD", f"piper/{n}.MODEL_CARD")]
    for m in whisper:
        for f in ("config.json", "model.bin", "tokenizer.json", "vocabulary.txt"):
            out.append((f"https://huggingface.co/Systran/faster-whisper-{m}/resolve/main/{f}", f"whisper-{m}/{f}"))
    for f in ("kokoro-v1.0.onnx", "kokoro-v1.0.int8.onnx", "voices-v1.0.bin"):  # completo (melhor voz) + reduzido (reserva)
        out.append((f"https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/{f}", f"kokoro/{f}"))
    return out


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    root = sys.argv[1]
    whisper = ["base"]
    if "--whisper" in sys.argv:
        whisper = sys.argv[sys.argv.index("--whisper") + 1].split(",")
    failed = 0
    for url, rel in jobs(whisper):
        out = os.path.join(root, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        if os.path.exists(out) and os.path.getsize(out) > 100:
            print("já existe", rel, flush=True)
            continue
        for attempt in range(4):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "nexusreel-models"})
                with urllib.request.urlopen(req, timeout=60) as r, open(out + ".part", "wb") as f:
                    while True:
                        b = r.read(1 << 20)
                        if not b:
                            break
                        f.write(b)
                os.replace(out + ".part", out)
                print("ok", rel, os.path.getsize(out), flush=True)
                break
            except Exception as e:  # rede instável: tenta de novo
                print("erro", rel, attempt + 1, str(e)[:120], flush=True)
                time.sleep(3)
        else:
            failed += 1
    print("FIM", "com falhas:" if failed else "sem falhas", failed or "", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
