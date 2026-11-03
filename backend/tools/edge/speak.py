#!/usr/bin/env python3
"""Voz neural da Microsoft (Edge) via edge-tts: gratuita, sem chave, SERVIÇO NÃO OFICIAL (pode mudar/cair; use a voz reserva).

Uso (o backend chama): python3 speak.py <voz, ex.: pt-BR-FranciscaNeural> <saida.mp3>
O texto vem pela entrada padrão (nunca como argumento).
"""
import asyncio
import sys


async def main() -> int:
    if len(sys.argv) != 3:
        print("uso: speak.py <voz> <saida.mp3>", file=sys.stderr)
        return 2
    voice, out = sys.argv[1:]
    text = sys.stdin.read().strip()
    if not text:
        print("texto vazio", file=sys.stderr)
        return 2
    import edge_tts  # import tardio: erro claro se o pacote não estiver instalado
    await asyncio.wait_for(edge_tts.Communicate(text, voice, rate="+0%").save(out), timeout=60)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
