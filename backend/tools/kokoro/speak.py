#!/usr/bin/env python3
"""Voz aberta Kokoro-82M (Apache-2.0) via kokoro-onnx — roda no próprio servidor, sem custo e sem enviar nada para fora.

Uso (o backend chama): python3 speak.py <modelo.onnx> <vozes.bin> <voz, ex.: pf_dora> <idioma: pt-br|en-us|es> <saida.wav>
O texto vem pela entrada padrão (nunca como argumento). Saída: WAV mono 16 bits.
"""
import sys
import wave


def main() -> int:
    if len(sys.argv) != 6:
        print("uso: speak.py <modelo> <vozes> <voz> <idioma> <saida.wav>", file=sys.stderr)
        return 2
    model, voices, voice, lang, out = sys.argv[1:]
    text = sys.stdin.read().strip()
    if not text:
        print("texto vazio", file=sys.stderr)
        return 2
    import numpy as np  # import tardio: erro claro se o pacote não estiver instalado
    from kokoro_onnx import Kokoro
    samples, rate = Kokoro(model, voices).create(text, voice=voice, speed=1.0, lang=lang)
    pcm = (np.clip(samples, -1.0, 1.0) * 32767).astype(np.int16)
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())
    return 0


if __name__ == "__main__":
    sys.exit(main())
