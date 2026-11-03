{# teste gen?rico: combina??o ?nica de colunas (sem depender de dbt_utils, que exige download de pacote) #}
{% test unique_combination(model, columns) %}
select {{ columns | join(', ') }}, count(*) as n from {{ model }} group by {{ columns | join(', ') }} having count(*) > 1
{% endtest %}
