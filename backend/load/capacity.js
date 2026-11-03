// k6 — teste de capacidade mensal (docs/SRE/CAPACITY.md). Rodar em STAGING com dados sintéticos.
//   k6 run -e BASE=https://staging-api.nexusreel.com -e TOKEN=... -e STAGE=2x load/capacity.js
// Cenários: leitura (feed/projetos) 70%, escrita leve 20%, redirect de afiliado 10%. Thresholds espelham os SLOs (p95 leitura <300 ms, escrita <1 s, erro <0,1%).
import http from 'k6/http';
import { check, sleep } from 'k6';
const BASE = __ENV.BASE || 'http://localhost:3000'; const TOKEN = __ENV.TOKEN || '';
const MULT = { '1x': 1, '2x': 2, '5x': 5, '10x': 10 }[__ENV.STAGE || '1x'] || 1;
export const options = {
  scenarios: { ramp: { executor: 'ramping-arrival-rate', startRate: 10 * MULT, timeUnit: '1s', preAllocatedVUs: 50 * MULT, maxVUs: 500 * MULT,
    stages: [{ target: 50 * MULT, duration: '3m' }, { target: 50 * MULT, duration: '10m' }, { target: 0, duration: '1m' }] } },
  thresholds: { 'http_req_duration{kind:read}': ['p(95)<300'], 'http_req_duration{kind:write}': ['p(95)<1000'], http_req_failed: ['rate<0.001'] },
};
const H = { headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' } };
export default function () {
  const r = Math.random();
  if (r < 0.7) { const res = http.get(`${BASE}/api/v1/projects?limit=20`, { ...H, tags: { kind: 'read' } }); check(res, { 'read 200': (x) => x.status === 200 }); }
  else if (r < 0.9) { const res = http.patch(`${BASE}/api/v1/users/me`, JSON.stringify({ locale: 'pt-BR' }), { ...H, tags: { kind: 'write' } }); check(res, { 'write ok': (x) => x.status < 400 }); }
  else { const res = http.get(`${BASE}/api/v1/status`, { tags: { kind: 'read' } }); check(res, { 'status 200': (x) => x.status === 200 }); }
  sleep(0.1);
}
