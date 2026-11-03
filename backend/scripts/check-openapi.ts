import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import { liveRoutes } from './gen-openapi.js';
/** Falha (exit 1) se docs/openapi.yaml divergir das rotas reais registradas no Fastify. Roda no CI. */
const spec = YAML.parse(readFileSync('docs/openapi.yaml', 'utf8')) as { openapi: string; paths: Record<string, Record<string, { responses?: object; tags?: string[]; summary?: string }>> };
const errors: string[] = []; if (!spec.openapi?.startsWith('3.1')) errors.push('openapi deve ser 3.1.x');
const inSpec = new Set<string>(); for (const [p, ops] of Object.entries(spec.paths)) for (const [m, o] of Object.entries(ops)) { const full = p.startsWith('/healthz') || p.startsWith('/readyz') || p.startsWith('/metrics') || p.startsWith('/__debug') || p.startsWith('/r/') || p.startsWith('/admin/queues') ? p : `/api/v1${p}`; inSpec.add(`${m.toUpperCase()} ${full}`); if (!o.responses || !o.tags?.length || !o.summary) errors.push(`operação incompleta: ${m} ${p}`); }
const live = await liveRoutes(); const ignore = (k: string) => k.includes('/storage/') || k.includes('{path}');
for (const k of live) if (!ignore(k) && !inSpec.has(k)) errors.push(`rota real sem documentação: ${k}`);
for (const k of inSpec) if (!live.has(k) && !k.includes('/admin/queues')) errors.push(`documentado mas inexistente: ${k}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); } console.log(`OpenAPI ok: ${inSpec.size} operações conferidas contra as rotas reais.`); process.exit(0);
