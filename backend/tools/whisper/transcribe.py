#!/usr/bin/env python3
"""Transcrição local e gratuita com faster-whisper (Whisper, código aberto), com tempo por palavra.

Uso (o backend chama): python3 transcribe.py <audio.wav> <modelo|pasta> <idioma: pt|en|es|...>
Saída (stdout): {"language": "pt", "words": [{"w": "...", "start": 0.12, "end": 0.40, "conf": 0.93}, ...]}
O modelo (ex.: "small") é baixado no build do Docker para WHISPER_MODELS_DIR; nada é enviado para fora do servidor.
"""
import json
import os
import sys

def main() -> int:
    if len(sys.argv) != 4:
        print("uso: transcribe.py <audio> <modelo> <idioma>", file=sys.stderr)
        return 2
    audio, model, language = sys.argv[1], sys.argv[2], sys.argv[3][:2]
    from faster_whisper import WhisperModel  # import tardio: erro claro se o pacote não estiver instalado
    m = WhisperModel(model, device="cpu", compute_type="int8", download_root=os.environ.get("WHISPER_MODELS_DIR"), local_files_only=True)
    segments, info = m.transcribe(audio, language=language, word_timestamps=True, vad_filter=True)
    words = [{"w": w.word.strip(), "start": round(w.start, 3), "end": round(w.end, 3), "conf": round(w.probability, 3)}
             for s in segments for w in (s.words or []) if w.word.strip()]
    json.dump({"language": info.language, "words": words}, sys.stdout, ensure_ascii=False)
    return 0

if __name__ == "__main__":
    sys.exit(main())
