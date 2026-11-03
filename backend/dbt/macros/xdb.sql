{# Macros entre bancos (Postgres validado; BigQuery implementado mas n?o executado aqui). #}
{% macro generate_schema_name(custom_schema_name, node) -%}
  {%- if custom_schema_name is none -%}{{ target.schema }}{%- else -%}{{ custom_schema_name | trim }}{%- endif -%}
{%- endmacro %}

{% macro xdb_date(ts) %}{{ return(adapter.dispatch('xdb_date', 'nexusreel')(ts)) }}{% endmacro %}
{% macro default__xdb_date(ts) %}({{ ts }} at time zone 'UTC')::date{% endmacro %}
{% macro bigquery__xdb_date(ts) %}DATE({{ ts }}, 'UTC'){% endmacro %}

{# diferen?a em dias: b - a (datas) #}
{% macro xdb_days_between(a, b) %}{{ return(adapter.dispatch('xdb_days_between', 'nexusreel')(a, b)) }}{% endmacro %}
{% macro default__xdb_days_between(a, b) %}(({{ b }})::date - ({{ a }})::date){% endmacro %}
{% macro bigquery__xdb_days_between(a, b) %}DATE_DIFF({{ b }}, {{ a }}, DAY){% endmacro %}

{% macro xdb_add_days(d, n) %}{{ return(adapter.dispatch('xdb_add_days', 'nexusreel')(d, n)) }}{% endmacro %}
{% macro default__xdb_add_days(d, n) %}(({{ d }})::date + ({{ n }})::int){% endmacro %}
{% macro bigquery__xdb_add_days(d, n) %}DATE_ADD({{ d }}, INTERVAL {{ n }} DAY){% endmacro %}

{% macro xdb_trunc_week(d) %}{{ return(adapter.dispatch('xdb_trunc_week', 'nexusreel')(d)) }}{% endmacro %}
{% macro default__xdb_trunc_week(d) %}date_trunc('week', {{ d }})::date{% endmacro %}
{% macro bigquery__xdb_trunc_week(d) %}DATE_TRUNC({{ d }}, ISOWEEK){% endmacro %}

{% macro xdb_trunc_month(d) %}{{ return(adapter.dispatch('xdb_trunc_month', 'nexusreel')(d)) }}{% endmacro %}
{% macro default__xdb_trunc_month(d) %}date_trunc('month', {{ d }})::date{% endmacro %}
{% macro bigquery__xdb_trunc_month(d) %}DATE_TRUNC({{ d }}, MONTH){% endmacro %}

{% macro xdb_json_text(col, key) %}{{ return(adapter.dispatch('xdb_json_text', 'nexusreel')(col, key)) }}{% endmacro %}
{% macro default__xdb_json_text(col, key) %}({{ col }} ->> '{{ key }}'){% endmacro %}
{% macro bigquery__xdb_json_text(col, key) %}JSON_VALUE({{ col }}, '$.{{ key }}'){% endmacro %}

{% macro xdb_json_num(col, key) %}{{ return(adapter.dispatch('xdb_json_num', 'nexusreel')(col, key)) }}{% endmacro %}
{% macro default__xdb_json_num(col, key) %}(({{ col }} ->> '{{ key }}')::numeric){% endmacro %}
{% macro bigquery__xdb_json_num(col, key) %}SAFE_CAST(JSON_VALUE({{ col }}, '$.{{ key }}') AS NUMERIC){% endmacro %}

{% macro xdb_now() %}{{ return(adapter.dispatch('xdb_now', 'nexusreel')()) }}{% endmacro %}
{% macro default__xdb_now() %}now(){% endmacro %}
{% macro bigquery__xdb_now() %}CURRENT_TIMESTAMP(){% endmacro %}

{# lista de strings para IN (...) a partir de var #}
{% macro in_list(items) %}({% for i in items %}'{{ i }}'{% if not loop.last %}, {% endif %}{% endfor %}){% endmacro %}
