INSERT INTO feature_flags (key, description, enabled, rollout_percent, regions, plans) VALUES
 ('generation_enabled','Kill switch: geração de vídeos',true,100,'{}','{}'),
 ('publish_tiktok','Kill switch: publicação TikTok',true,100,'{}','{}'),
 ('publish_youtube','Kill switch: publicação YouTube',true,100,'{}','{}'),
 ('publish_instagram','Kill switch: publicação Instagram',true,100,'{}','{}'),
 ('publish_shopee','Kill switch: publicação Shopee',true,100,'{}','{}'),
 ('publish_temu','Kill switch: publicação Temu',true,100,'{}','{}'),
 ('publish_olx','Kill switch: publicação OLX',true,100,'{}','{}'),
 ('publish_mercadolivre','Kill switch: publicação Mercado Livre',true,100,'{}','{}'),
 ('affiliates_enabled','Afiliados',true,100,'{}','{}'),
 ('dubbing_enabled','Dublagem automática',true,100,'{}','{}'),
 ('new_player_hls','Player HLS',true,100,'{LATAM,US}','{}')
ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('platform', '{"marketplaceFeePct":20,"affiliateFeePct":10,"minPayoutCents":5000,"autoApproveBelowCents":50000,"creditValueCents":38,"planLimits":{"free":3,"pro":30,"business":100}}') ON CONFLICT DO NOTHING;
