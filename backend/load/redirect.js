// k6: meta = 500 req/s no redirecionamento de afiliados com p95 < 150 ms e erro < 1%.
// Uso: k6 run -e BASE=http://localhost:8787 -e LINK_ID=<uuid de um affiliate_link> load/redirect.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: { redirect: { executor: 'constant-arrival-rate', rate: 500, timeUnit: '1s', duration: '2m', preAllocatedVUs: 200, maxVUs: 600 } },
  thresholds: { http_req_duration: ['p(95)<150'], http_req_failed: ['rate<0.01'], checks: ['rate>0.99'] },
};
const BASE = __ENV.BASE || 'http://localhost:8787';
const LINK = __ENV.LINK_ID;
export function setup() { if (!LINK) throw new Error('Informe -e LINK_ID=<uuid>'); }
export default function () {
  // Cada VU simula um IP distinto (a API confia em X-Forwarded-For atrás do proxy; em staging o rate limit por IP deve estar relaxado para o teste).
  const r = http.get(`${BASE}/r/${LINK}`, { redirects: 0, headers: { 'X-Forwarded-For': `10.${__VU % 250}.${__ITER % 250}.1` } });
  check(r, { 'status 302': (x) => x.status === 302, 'tem Location': (x) => !!x.headers['Location'] });
}
