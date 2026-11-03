import { Redis } from 'ioredis';
import { env } from '../config/env.js';
export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: false });
/** Conexão dedicada para BullMQ (exige maxRetriesPerRequest=null). */
export const makeRedis = () => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
export const closeRedis = async () => { await redis.quit().catch(() => undefined); };
