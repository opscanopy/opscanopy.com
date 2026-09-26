---
title: "Kubernetes Service has no endpoints: ache o bug do selector"
description: "Service do Kubernetes sem endpoints, ou Deployment com selector does not match template labels? Um bug, dois sintomas e como levar os dois até a correção."
pubDate: 2026-10-12
draft: true
tags: ["kubernetes", "containers", "debugging"]
lang: pt-br
translationOf: "kubernetes-service-has-no-endpoints"
relatedTool:
  name: "Kubernetes Label Selector Tester"
  href: "/kubernetes-label-selector-tester"
---

![Selector de um Service comparado aos labels dos pods: os que casam vão à EndpointSlice e recebem tráfego; um label divergente deixa o Service sem endpoints](/blog/kubernetes-service-has-no-endpoints-hero.svg)
<!-- keywords: primary: kubernetes service has no endpoints (<100, KD n/a) | secondaries: selector does not match template labels, kubernetes service no endpoints, endpoints none kubernetes, kubectl get pods label selector | source: ahrefs free (2026-09-26) -->
<!-- insight: not-Ready pods stay in the EndpointSlice with ready:false (only IP-less/terminal pods drop out); a zero-match Service still gets a placeholder slice showing <unset>, so the IP's location, not the slice's existence, tells selector bug from readiness | serp-checked: 2026-09-26 -->

Os pods estão Running. O Service existe. Toda requisição para ele trava ou é recusada, e nenhum log diz por quê. Você dá um describe no Service e encontra a única linha que importa:

```text
Endpoints:                <none>
```

Num kubectl atual, essa linha pode aparecer em branco em vez de `<none>`; é o mesmo problema. O seu Service do Kubernetes não tem endpoints, e nenhum componente trata isso como erro. A versão barulhenta do mesmo bug aparece quando você aplica o Deployment:

```text
The Deployment "checkout" is invalid: spec.template.metadata.labels: Invalid value: {"app":"check-out"}: `selector` does not match template `labels`
```

Dois erros, um bug só: um selector que não casa com nada.

> **TL;DR**
>
> - Um Service seleciona pods pelos labels. Se nenhum conjunto de labels de pod satisfaz todas as chaves de `spec.selector`, o Service fica sem endpoints e ninguém reclama.
> - Rastreie nesta ordem: o selector do Service, depois `kubectl get pods -l <selector>`, depois `kubectl get endpointslices -l kubernetes.io/service-name=<svc>` e, por fim, a condição `ready` de cada endpoint.
> - Nenhum IP de pod em lugar nenhum significa que o selector não casa com nada (ou que os pods ainda não têm IP). Um IP na slice com `ready: false` significa readiness, não labels.
> - O selector de um Deployment é imutável em `apps/v1`. Mudá-lo exige apagar e recriar, com `--cascade=orphan` se os pods precisarem continuar rodando.

## O que significa um Service do Kubernetes sem endpoints?

Um Service não sabe nada de Deployments. Ele guarda um mapa de labels em `spec.selector`, e o controller de EndpointSlice lista os pods do próprio namespace do Service cujos labels contêm todos os pares desse mapa. Os IPs desses pods viram os endpoints do Service.

![O spec.selector do Service é comparado aos labels de cada pod no mesmo namespace; os pods que casam e têm IP são gravados numa EndpointSlice, e cada endpoint traz uma condição ready que decide se ele recebe tráfego](/blog/kubernetes-service-has-no-endpoints-diagram.svg)

O selector de um Service só aceita igualdade: [a documentação de labels](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/#service-and-replicationcontroller) diz que apenas requisitos baseados em igualdade são suportados, e todos os pares são combinados com AND. Uma chave a mais, um valor digitado errado ou o namespace errado, e o conjunto de pods que casam fica vazio.

Um conjunto vazio é válido. O controller ainda grava uma EndpointSlice placeholder, sem portas e sem endpoints, então "existe uma slice" não prova nada. O sintoma silencioso é o modo de falha inteiro, e é por isso que demora tanto para achar. A [seção de Services do guia de Kubernetes](/learn/guides/kubernetes-for-devops/#services) explica o objeto em si, se você precisar do contexto.

## Como rastrear o selector até os pods?

Percorra a cadeia um elo por vez, começando pelo que o Service realmente pede, não pelo que você acha que ele pede:

```bash
kubectl get service checkout -n shop -o jsonpath='{.spec.selector}'
kubectl get pods -n shop -l app=checkout,tier=backend
kubectl get pods -n shop --show-labels
```

O segundo comando usa o selector do Service ao pé da letra, com os pares separados por vírgula. Se ele não retornar pods, o bug está nos labels ou no namespace, e você pode parar de olhar para a rede. O terceiro mostra os labels que os pods realmente têm, para você comparar chave por chave.

Para conferir os dois manifests antes que qualquer coisa chegue a um cluster, cole o Service na caixa Selector do [Kubernetes Label Selector Tester](/pt-br/kubernetes-label-selector-tester/) (modo selector YAML) e o Deployment em `resources.yaml`.

O tester lista o Deployment e o seu pod template como linhas separadas e aponta a cláusula que falha: na linha do pod template ele marca `tier=frontend` com ✗ e o motivo `label tier="backend" ≠ "frontend"`. Um limite, dito com honestidade: ele mostra o namespace de cada linha, mas nunca o compara, então um Service em `default` vai "casar" com um pod em `shop`.

> **Atenção:** leia a linha "Pod template", não a contagem do topo. Quando o selector do Service foi copiado dos `metadata.labels` do próprio Deployment, e eles diferem dos labels do template, o tester informa "1 of 2 resources matches" porque a linha do Deployment casa. A linha do Pod template falha, e é essa que um Service seleciona.

O último elo é a EndpointSlice. Ela é a saída real do controller, então encerra a discussão. Consulte-a pelo label que o controller carimba em toda slice, como faz a [tarefa debug-service](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/#does-the-service-have-any-endpointslices):

```bash
kubectl get endpointslices -n shop -l kubernetes.io/service-name=checkout
```

Para um Service que não casa com nada, você recebe uma linha, a do placeholder, e a coluna ENDPOINTS dela mostra `<unset>` em vez de `<none>`. Você não vai ver "No resources found".

`kubectl describe service` é menos direto do que parece. Desde o kubectl v1.31 ele lê EndpointSlices, e desde o v1.32 a linha `Endpoints:` pula os endpoints que não estão prontos. O kubectl mais antigo imprimia `<none>` para um objeto Endpoints vazio; no kubectl mais novo, a linha pode simplesmente ficar em branco.

Evite `kubectl get endpoints` para isso. Num API server v1.33 ou mais novo, ele responde primeiro com um aviso, porque a API v1 Endpoints foi [descontinuada em favor da EndpointSlice](https://kubernetes.io/blog/2025/04/24/endpoints-deprecation/):

```text
Warning: v1 Endpoints is deprecated in v1.33+; use discovery.k8s.io/v1 EndpointSlice
```

## O pod está na slice, mas não está Ready?

É aqui que a maioria dos checklists erra. Um pod que tem IP mas não está Ready não sai da EndpointSlice. Ele continua listado com `conditions.ready: false`, e consumidores como o kube-proxy não roteiam para ele. A [referência de condições](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/#conditions) descreve `ready`, `serving` e `terminating`.

Pods em Pending ainda sem IP, e pods que terminaram como Succeeded ou Failed, ficam totalmente de fora. Então o diagnóstico se divide conforme onde o IP aparece:

| O que você vê | Para onde aponta |
|---|---|
| Nenhum IP de pod na slice, nenhum pod em `get pods -l` | Selector ou namespace divergente |
| Nenhum IP de pod na slice, pods em Pending sem IP | Não agendados, ou o sandbox do pod ainda não foi criado |
| IP na slice, ausente em `describe svc` | Readiness: confira `conditions.ready` |

Imprima direto o endereço e a condição ready de cada endpoint:

```bash
kubectl get endpointslices -n shop -l kubernetes.io/service-name=checkout \
  -o jsonpath='{range .items[*].endpoints[*]}{.addresses[0]}{" ready="}{.conditions.ready}{"\n"}{end}'
```

Se os IPs estão lá com `ready=false`, os labels estão certos, e o que você precisa depurar é a sua [readiness probe](/learn/guides/kubernetes-for-devops/#health-probes).

## Quais erros de selector causam isso, e como corrigir cada um?

Confira nesta ordem. Cada um tem um sinal, uma correção e uma forma de confirmar.

**1. Erro de digitação ou drift de label.** Sinal: `get pods -l` não retorna nada, mas `--show-labels` mostra algo quase igual, como `app=Checkout` contra `app=checkout`. Os valores diferenciam maiúsculas de minúsculas. Correção: ajuste o lado que estiver errado, normalmente o que foi editado por último. Confirmação: `get pods -l` lista os pods.

**2. Selector copiado dos `metadata.labels` do Deployment.** Sinal: o selector do Service casa com os labels do objeto Deployment, não com os do pod template. Correção: copie de `spec.template.metadata.labels`. Confirmação: a linha Pod template do tester passa.

**3. Namespace errado.** Sinal: os pods existem, só que não no `metadata.namespace` do Service. O controller só lista pods do próprio namespace do Service. Correção: mova um dos dois. Confirmação: `get pods -n <service-namespace> -l ...` os retorna.

**4. Pods não Ready, ou ainda sem IP.** Sinal: os IPs aparecem com `ready=false`, ou os pods estão em Pending. Correção: a probe ou o problema de agendamento, não o selector. Confirmação: `ready=true` na slice.

**5. Uma chave a mais no selector.** Sinal: todas as chaves casam, menos uma, como `tier: frontend` contra pods com o label `tier: backend`. Correção: remova a chave ou adicione o label ao template. Confirmação: `get pods -l` com o selector completo lista os pods.

> **Na prática:** a [tarefa debug-service](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/) cita exatamente esse bug como um erro comum: um Service selecionando `app=hostnames` enquanto o Deployment, do jeito que versões antigas do `kubectl run` o criavam, especifica `run=hostnames`.

## Por que o Deployment rejeita o próprio selector?

O erro barulhento é a mesma divergência, pega um nível antes. O `spec.selector` de um Deployment precisa casar com o seu `spec.template.metadata.labels`, e o API server impõe isso na validação, então o `kubectl apply` falha seja qual for o client. Em `apps/v1` o selector não herda um padrão do template, então omiti-lo não é saída: `spec.selector` é obrigatório.

O valor inválido é impresso de forma diferente conforme a versão do API server. A partir do v1.34 ele aparece como JSON, como no início do post. Servidores mais antigos imprimem sintaxe Go:

```text
The Deployment "checkout" is invalid: spec.template.metadata.labels: Invalid value: map[string]string{"app":"check-out"}: `selector` does not match template `labels`
```

Dois vizinhos são erros diferentes. Um selector vazio gera `empty selector is invalid for deployment`, e um ausente é reportado como obrigatório em `spec.selector`. StatefulSets e DaemonSets emitem a mesma mensagem "does not match". A correção é sempre fazer os labels do template serem um superconjunto do selector; a [seção de Deployments](/learn/guides/kubernetes-for-devops/#replicasets-and-deployments) do guia mostra o par que casa.

## Dá para mudar o selector de um Deployment depois de criado?

Não. Em `apps/v1` o selector é imutável, e um update que o altera falha com `field is immutable`. Num servidor v1.34+, a mensagem é:

```text
The Deployment "checkout" is invalid: spec.selector: Invalid value: {"matchLabels":{"app":"checkout","tier":"backend"}}: field is immutable
```

A [documentação de Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#label-selector-updates) é explícita: `kubectl patch`, `kubectl edit`, `kubectl apply` e `helm upgrade` esbarram todos nisso. O caminho é apagar e recriar. Apagar um Deployment apaga os pods dele por padrão, o que significa indisponibilidade, então deixe-os órfãos:

```bash
kubectl delete deployment checkout -n shop --cascade=orphan
kubectl apply -f deployment.yaml
kubectl get replicasets -n shop
```

O ReplicaSet órfão mantém os pods atendendo enquanto o novo Deployment faz o rollout. Quando os pods novos estiverem Ready e na slice, apague qualquer ReplicaSet que nenhum Deployment possua.

> **Dica:** mude o selector do Service por último. Se você adicionar uma chave a ele antes de os pods novos terem esse label, o Service deixa de casar com qualquer coisa e os endpoints somem na hora.

## Corrigir o targetPort traz os endpoints de volta?

Esta é a correção que não corrige. Um `targetPort` numérico errado nunca esvazia a lista de endpoints: o controller copia o número e lista o pod mesmo assim. O tráfego então falha na porta, o que parece parecido visto de fora, mas é outro bug. Mudá-lo não vai encher uma slice vazia.

Um `targetPort` nomeado que o pod não declara é mais sutil. A EndpointSlice continua listando o endereço do pod, mas a porta é descartada, então a coluna PORTS mostra `<unset>`. O controller legado de Endpoints vai além e omite o pod daquele subset, então qualquer coisa que ainda leia Endpoints mostra o pod como ausente.

Reiniciar os pods ou recriar o Service não muda nenhum dos dois casos. Se você queria uma porta nomeada, confira se o container declara uma porta com exatamente esse nome, como pede o checklist do debug-service. Caso contrário, deixe o `targetPort` em paz e volte aos labels.

## O que conferir quando um Service do Kubernetes está sem endpoints?

Uma rotina curta que cobre todas as causas acima, e o erro barulhento também:

1. Imprima o `spec.selector` do Service com `-o jsonpath` e anote o namespace dele.
2. Rode `kubectl get pods -n <namespace> -l <selector>`. Vazio significa labels ou namespace.
3. Compare com `kubectl get pods --show-labels`, chave por chave, incluindo maiúsculas e minúsculas.
4. Confirme que o selector foi copiado de `spec.template.metadata.labels`, não dos labels do próprio Deployment.
5. Consulte `kubectl get endpointslices -l kubernetes.io/service-name=<svc>`. Endpoints `<unset>` são o placeholder, não um resultado.
6. Se houver IPs, leia `conditions.ready`; `false` manda você para a readiness probe.
7. Se um Deployment não aplica, faça o selector casar com os labels do template. Se o próprio selector precisar mudar, apague com `--cascade=orphan` e recrie.
8. Deixe o `targetPort` para o fim, e só desconfie dele quando o que falta é a porta, não o endpoint.

Para problemas de memória em vez de selector, o post irmão sobre [OOMKilled e exit code 137](/blog/kubernetes-oomkilled-exit-code-137/) segue a mesma rotina de confirmar e depois corrigir.

Cole o seu Service e o seu Deployment no [Kubernetes Label Selector Tester](/pt-br/kubernetes-label-selector-tester/) antes do próximo apply, e leia a linha Pod template.

Qual label saiu do lugar no seu cluster: um `app` renomeado, ou um `tier` que ninguém lembra de ter adicionado?
