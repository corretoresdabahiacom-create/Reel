import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { env, type Env } from '../src/config/env.js';
import { transcribeAudio } from '../src/modules/transcript/stt.js';

/**
 * Transcrição local gratuita (AI_STT_PROVIDER=whisper → tools/whisper/transcribe.py, faster-whisper).
 * - Contrato: com um script substituto que imprime palavras com tempo, confere leitura, ms, cena de cada palavra e erros.
 * - Biblioteca real (opcional, WHISPER_TEST_PYTHON = python com faster-whisper instalado): sem o modelo baixado, o erro sai
 *   claro e rápido (o modelo vem do Hugging Face no build do Docker; neste ambiente o download é bloqueado).
 */
const saved: Partial<Env> = {};
const set = (o: Partial<Env>) => { for (const [k, v] of Object.entries(o)) { (saved as Record<string, unknown>)[k] ??= (env as Record<string, unknown>)[k]; (env as Record<string, unknown>)[k] = v; } };
let dir: string; let wav: string;
const scenes = [{ index: 0, startMs: 0, endMs: 1000, text: 'olá' }, { index: 1, startMs: 1000, endMs: 3000, text: 'mundo' }];
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'stt-')); wav = join(dir, 'a.wav'); spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=2', '-y', wav]); set({ AI_STT_PROVIDER: 'whisper' }); });
afterAll(() => { for (const [k, v] of Object.entries(saved)) (env as Record<string, unknown>)[k] = v; rmSync(dir, { recursive: true, force: true }); });

describe('Whisper local', () => {
  it('lê as palavras com tempo, converte para ms e acha a cena de cada uma', async () => {
    const fake = join(dir, 'fake.py');
    writeFileSync(fake, 'import json,sys\nassert sys.argv[3]=="pt-BR"[:len(sys.argv[3])] or True\njson.dump({"language":"pt","words":[{"w":"Olá","start":0.1,"end":0.4,"conf":0.97},{"w":"mundo","start":1.25,"end":1.6,"conf":0.9},{"w":"","start":2,"end":2.1}]},sys.stdout)\n');
    set({ WHISPER_PYTHON: 'python3', WHISPER_SCRIPT: fake });
    const r = await transcribeAudio(wav, scenes, 'pt-BR');
    expect(r.provider).toBe('whisper');
    expect(r.words).toEqual([{ w: 'Olá', start: 100, end: 400, conf: 0.97, scene: 0 }, { w: 'mundo', start: 1250, end: 1600, conf: 0.9, scene: 1 }]);
  });
  it('saída inválida ou erro do processo viram erro claro (sem travar)', async () => {
    const bad = join(dir, 'bad.py'); writeFileSync(bad, 'print("isso não é json")\n'); set({ WHISPER_SCRIPT: bad });
    await expect(transcribeAudio(wav, scenes, 'pt-BR')).rejects.toThrow(/saída inválida/);
    const boom = join(dir, 'boom.py'); writeFileSync(boom, 'import sys\nprint("modelo ausente", file=sys.stderr)\nsys.exit(3)\n'); set({ WHISPER_SCRIPT: boom });
    await expect(transcribeAudio(wav, scenes, 'pt-BR')).rejects.toThrow(/whisper saiu com 3: modelo ausente/);
  });
  it.skipIf(!process.env.WHISPER_TEST_PYTHON)('faster-whisper de verdade sem o modelo: erro claro em segundos', async () => {
    set({ WHISPER_PYTHON: process.env.WHISPER_TEST_PYTHON!, WHISPER_SCRIPT: 'tools/whisper/transcribe.py', WHISPER_MODELS_DIR: join(dir, 'vazio') });
    const t0 = Date.now(); await expect(transcribeAudio(wav, scenes, 'pt-BR')).rejects.toThrow(/whisper saiu com 1: .*(LocalEntryNotFound|snapshot)/);
    expect(Date.now() - t0).toBeLessThan(60_000);
  }, 90_000);
});
