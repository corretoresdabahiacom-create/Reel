import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_PRICE_CENTS } from '../src/services/admin/metrics';
import { PRICE_BRL_CENTS } from '../src/services/i18n/format';

// Auditoria X5 — fonte da verdade: backend payments.service.ts (PLANS) e seed 0005 pricing_regions BR.
const BACKEND_BRL = { pro: 4900, business: 19900 } as const;

test('paridade de preços: métricas admin = backend', () => {
  assert.equal(PLAN_PRICE_CENTS.pro, BACKEND_BRL.pro);
  assert.equal(PLAN_PRICE_CENTS.business, BACKEND_BRL.business);
});
test('paridade de preços: preço regional BRL = backend', () => {
  assert.deepEqual({ ...PRICE_BRL_CENTS }, { ...BACKEND_BRL });
});
