-- Funil di?rio por usu?rios distintos (eventos de servidor; s? usu?rios com analytics consentido t?m pseudo_id).
select event_date,
  {% for s in ['user_signed_up', 'project_created', 'video_assembled', 'video_published', 'subscription_started'] %}
  count(distinct case when event_name = '{{ s }}' then pseudo_id end) as {{ s }}{% if not loop.last %},{% endif %}
  {% endfor %}
from {{ ref('stg_events') }} where pseudo_id is not null group by event_date
