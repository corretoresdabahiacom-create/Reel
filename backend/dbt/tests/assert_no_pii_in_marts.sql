-- Nenhum valor em dim_users deve parecer e-mail ou UUID (so pseudo_id opaco).
select pseudo_id from {{ ref('dim_users') }} where pseudo_id like '%@%' or pseudo_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-'
