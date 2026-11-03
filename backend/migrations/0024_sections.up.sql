-- Seções de até 15 s (foto + o que a imagem faz + o que falar). Só acréscimo; tudo atrás de `ff_sections` (desligada).
SET LOCAL lock_timeout = '5s';

INSERT INTO feature_flags (key, description, enabled, rollout_percent, regions, plans) VALUES
 ('ff_sections','Edição por seções de até 15 s: foto, movimento da foto, texto falado e divisão automática',false,0,'{}','{}')
ON CONFLICT (key) DO NOTHING;
