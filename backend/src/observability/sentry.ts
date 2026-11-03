import * as Sentry from '@sentry/node';
import { env } from '../config/env.js';
let on = false;
export function initSentry(): void {
  if (!env.SENTRY_DSN || on) return;
  Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, tracesSampleRate: env.OTEL_SAMPLE_RATIO,
    beforeSend(ev) { if (ev.request?.headers) { delete ev.request.headers['authorization']; delete ev.request.headers['cookie']; } return ev; } });
  on = true;
}
export function captureError(e: unknown, ctx: { userId?: string; route?: string; traceId?: string } = {}): void {
  if (!on) return;
  Sentry.withScope((s) => { if (ctx.userId) s.setUser({ id: ctx.userId }); if (ctx.route) s.setTag('route', ctx.route); if (ctx.traceId) s.setTag('traceId', ctx.traceId); Sentry.captureException(e); });
}
