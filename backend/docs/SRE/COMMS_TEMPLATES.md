# Modelos de comunicação de incidentes

Cadência: Sev1/Sev2 a cada **30 min** até mitigar; Sev3 a cada **2 h**. O app aponta atrasos (`GET /admin/ops/incidents/overdue`, job `incident-sla`). Linguagem: fatos, sem culpa, sem previsão sem base.

## Investigando
> **[Investigando] {{título}}** — {{HH:MM UTC}}. Estamos investigando {{sintoma}} que afeta {{componentes}}. Próxima atualização às {{HH:MM}}.

## Identificado
> **[Identificado]** — {{HH:MM UTC}}. Identificamos a causa ({{resumo sem jargão}}) e estamos aplicando {{mitigação}}. Impacto atual: {{quem/o quê}}. Próxima atualização às {{HH:MM}}.

## Monitorando
> **[Monitorando]** — {{HH:MM UTC}}. A correção foi aplicada e os indicadores voltaram ao normal. Vamos monitorar por {{tempo}}.

## Resolvido
> **[Resolvido]** — {{HH:MM UTC}}. O serviço opera normalmente desde {{HH:MM}}. Duração do impacto: {{X}} min. Publicaremos um relatório em até 5 dias úteis (Sev1).

## E-mail/SMS a assinantes (curto)
> NexusReel: {{status}} — {{título}}. Detalhes: status.nexusreel.com. Para parar de receber, use o link do e-mail.

## Mensagem interna (canal #incidents)
> 🚨 {{sev}} aberto: {{título}}. IC: {{nome}}. Canal: {{#inc-id}}. Componentes: {{lista}}. Ver runbook: {{link}}.

## Cliente B2B afetado (SLA)
> Olá {{nome}}, identificamos que o incidente {{id}} afetou {{serviço}} entre {{início}} e {{fim}}. Calcularemos créditos conforme o adendo de SLA e enviaremos em até 30 dias.
