import { pino } from 'pino';
import { env } from '../config/env.js';

/** Logs JSON estruturados com redaction de tokens/PII. Nunca usar console.log. */
export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  base: { service: 'nexusreel-api', region: env.REGION },
  redact: { paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.accessToken', '*.refreshToken', '*.access_token', '*.refresh_token',
    '*.token', '*.client_secret', '*.code', '*.email', '*.totp', 'headers.authorization'], censor: '[redacted]' },
  timestamp: pino.stdTimeFunctions.isoTime,
});
export type Logger = typeof logger;
