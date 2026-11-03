# Chaos Mesh — experimentos

Aplicar **somente em staging** (namespace `nexusreel-staging`) até o primeiro game day aprovado; produção exige janela, comandante e abort criteria (docs/SRE/CHAOS.md).

```
kubectl apply -f infra/chaos/ -n nexusreel-staging   # cria os experimentos (suspensos por padrão)
kubectl annotate podchaos/worker-kill experiment.chaos-mesh.org/pause=false -n nexusreel-staging --overwrite   # inicia
```

Todos nascem `suspend: true`; o schedule mensal só roda após remover o suspend. Os manifestos NÃO foram aplicados em um cluster real nesta entrega (validação: YAML + dry-run do `kubectl` quando disponível).
