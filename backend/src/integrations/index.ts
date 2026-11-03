import type { PlatformId } from '../utils/validate.js';
import type { PlatformModule } from './types.js';
import { oauth as tiktokO } from './tiktok/oauth.js'; import { publish as tiktokP } from './tiktok/publish.js'; import { webhooks as tiktokW } from './tiktok/webhooks.js';
import { oauth as youtubeO } from './youtube/oauth.js'; import { publish as youtubeP } from './youtube/publish.js';
import { oauth as instagramO } from './instagram/oauth.js'; import { publish as instagramP } from './instagram/publish.js'; import { webhooks as instagramW } from './instagram/webhooks.js';
import { oauth as shopeeO } from './shopee/oauth.js'; import { publish as shopeeP } from './shopee/publish.js'; import { webhooks as shopeeW } from './shopee/webhooks.js';
import { oauth as temuO } from './temu/oauth.js'; import { publish as temuP } from './temu/publish.js';
import { oauth as olxO } from './olx/oauth.js'; import { publish as olxP } from './olx/publish.js';
import { oauth as meliO } from './mercadolivre/oauth.js'; import { publish as meliP } from './mercadolivre/publish.js'; import { webhooks as meliW } from './mercadolivre/webhooks.js';

export const INTEGRATIONS: Record<PlatformId, PlatformModule> = {
  tiktok: { id: 'tiktok', oauth: tiktokO, publish: tiktokP, webhooks: tiktokW }, youtube: { id: 'youtube', oauth: youtubeO, publish: youtubeP },
  instagram: { id: 'instagram', oauth: instagramO, publish: instagramP, webhooks: instagramW }, shopee: { id: 'shopee', oauth: shopeeO, publish: shopeeP, webhooks: shopeeW },
  temu: { id: 'temu', oauth: temuO, publish: temuP }, olx: { id: 'olx', oauth: olxO, publish: olxP }, mercadolivre: { id: 'mercadolivre', oauth: meliO, publish: meliP, webhooks: meliW },
};
export type { PlatformModule };
