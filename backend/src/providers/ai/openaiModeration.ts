import { env } from '../../config/env.js';
import type { ModerationProvider } from './types.js';
/** OpenAI Moderation (omni-moderation-latest; aceita texto e imagem). Gratuita. ⚠ Não testada contra a API real nesta fase. */
export class OpenAIModeration implements ModerationProvider {
  name = 'openai';
  async moderate(text: string, imageUrls: string[]) {
    if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY ausente'); const t0 = Date.now();
    const input = [{ type: 'text', text }, ...imageUrls.slice(0, 4).map((u) => ({ type: 'image_url', image_url: { url: u } }))];
    const r = await fetch('https://api.openai.com/v1/moderations', { method: 'POST', headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'omni-moderation-latest', input }) });
    if (!r.ok) throw new Error(`openai moderation ${r.status}`);
    const j = (await r.json()) as { results: { flagged: boolean; categories: Record<string, boolean> }[] };
    const f = j.results[0]!; return { allowed: !f.flagged, categories: Object.entries(f.categories).filter(([, v]) => v).map(([k]) => k), usage: { provider: 'openai', operation: 'moderation', costCents: 0, latencyMs: Date.now() - t0 } };
  }
}
