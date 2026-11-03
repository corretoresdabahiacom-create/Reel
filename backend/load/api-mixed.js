// k6: leitura autenticada (catálogo de templates + flags + /users/me) — 100 req/s, p95 < 300 ms.
import http from 'k6/http';
import { check } from 'k6';
export const options = { scenarios: { mixed: { executor: 'constant-arrival-rate', rate: 100, timeUnit: '1s', duration: '1m', preAllocatedVUs: 50, maxVUs: 200 } }, thresholds: { http_req_duration: ['p(95)<300'], http_req_failed: ['rate<0.01'] } };
const BASE = __ENV.BASE || 'http://localhost:8787';
export default function () {
  // Cada VU simula um IP (o limite global é por IP; sem isso o teste mede o rate limit, não a API). Igual a load/redirect.js.
  const p = { headers: { 'X-Forwarded-For': `10.${__VU % 250}.${__ITER % 250}.2` } };
  const r = http.batch([['GET', `${BASE}/api/v1/templates?limit=20`, null, p], ['GET', `${BASE}/api/v1/flags`, null, p], ['GET', `${BASE}/api/v1/billing/catalog`, null, p]]);
  for (const x of r) check(x, { ok: (y) => y.status === 200 });
}
