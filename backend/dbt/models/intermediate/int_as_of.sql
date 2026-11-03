-- Data de refer?ncia da maturidade de coortes: var as_of_date ou o ?ltimo evento carregado.
select {% if var('as_of_date') %}cast('{{ var("as_of_date") }}' as date){% else %}max(event_date){% endif %} as as_of_date from {{ ref('stg_events') }}
