# Ferramentas MCP

Catálogo de **18 ferramentas MCP**. Schemas efetivos estão em `src/mcp/schemas.ts`; respostas seguem [architecture.md](architecture.md). Operações HTTP permitidas estão em `src/domain/read-policy.ts`, e contratos em [apis.md](apis.md).

## Convenções de argumentos

| Convenção | Argumentos |
| --- | --- |
| Paginação no servidor | `offset=0`, `limit=50` (1–500, limitado por AKAMAI_MAX_RESULTS). Percorra nextOffset, sem assumir que a primeira página é completa |
| Referência property | `propertyId` obrigatório (inteiro positivo, prefixo `prp_` opcional); `contractId` e `groupId` opcionais para desambiguação |
| Seleção property/segurança | `version` opcional; `environment=PRODUCTION`, podendo ser STAGING ou LATEST. version explícita prevalece e não comprova ativação. `explain_cdn_behavior` aceita apenas PRODUCTION/STAGING e exige a versão ativa confirmada |
| Referência segurança | `configId` numérico positivo; `policyId` identifica política quando necessário |
| Históricos | environment opcional PRODUCTION/STAGING; omitido retorna ambos na página de resultados |
| Hostname | DNS sem URL, porta, path ou wildcard; normalização para minúsculas e IDNA |
| JSON Pointer | `subtreePointer=""` representa a raiz de rules; `/children/0` representa o primeiro filho. Preserva hierarquia na fonte, mas subárvore não inclui ancestrais |

Não se aceita host de API, método HTTP, path de API, header, credencial ou accountSwitchKey em argumentos de ferramentas. Schemas rejeitam campos adicionais.

## Property Manager e CDN

| Ferramenta | Argumentos | Responsabilidade/API | Limitações |
| --- | --- | --- | --- |
| `search_properties_by_domain` | domain, scopeOffset=0, maxScopes=20 (1–20), offset=0, limit=20 (1–50) | GET groups uma vez e GET properties em até maxScopes escopos; filtro literal de domínio nos nomes | Retorna candidatas NOT_CHECKED, fontes, cobertura e nextCursor. Não confirma hostname; nomes personalizados podem não corresponder. Limita o lote pelo orçamento de requisições |
| `list_properties` | contractId+groupId opcionais juntos, scopeOffset=0, paginação no servidor | GET PAPI groups e properties. Sem par explícito, descobre escopos e lê um par selecionado | nextOffset pagina o par; nextScopeOffset avança o catálogo. Descoberta pode mudar entre chamadas |
| `get_active_property_version` | referência property | GET PAPI property; latestVersion, productionVersion e stagingVersion | Sem fallback para latest se ambiente não ativo |
| `list_property_versions` | referência property, offset, limit | GET PAPI versions com paginação remota | nextLink é evidência, nunca executado como URL pelo servidor. Use seus parâmetros documentados na próxima consulta |
| `get_property_configuration` | seleção property, subtreePointer, view=auto/rules/outline, paginação de outline | GET PAPI rules, validateRules=false | auto fornece rules quando couberem ou outline com pointers para aprofundar. outline não substitui o conteúdo das regras; bytes da árvore completa continuam sujeitos ao teto HTTP |
| `compare_property_versions` | referência property, fromVersion, toVersion, subtreePointer, paginação no servidor | Duas leituras PAPI rules e diff estrutural | Arrays ordenados, metadados/ruleFormat e versões editáveis podem afetar diff; sem snapshot atômico |
| `get_property_activation_history` | referência property, environment e fromTime/toTime opcionais, paginação | GET PAPI activations; período aplicado antes de paginar | Inclui tentativas/status; submitDate não prova conclusão. Registros sem horário válido são UNKNOWN |
| `explain_cdn_behavior` | referência property, environment PRODUCTION/STAGING, hostname, path, focus=overview/cache/origin/headers/all, version opcional, behaviorNames=[], paginação | Confirma associação e produz panorama da árvore inteira antes de paginar detalhes | overview é compacto. O panorama de cache inclui regras condicionais com paths/TTL. NOT_MATCHED/UNKNOWN impedem leitura de regras. path não é filtro avaliado; não calcula TTL efetivo |
| `get_hostname_overview` | hostname, properties=[], environment PRODUCTION/STAGING, includeSecurity=false, configIds=[], paginação no servidor | GET metadata e hostnames das referências; confirmação em inferences | Exige ao menos uma referência ou solicitação explícita de segurança. Até 5 referências por chamada. Por padrão consulta apenas CDN. AppSec exige includeSecurity=true ou configIds explícitos; nesse caso consulta até 5 configs. Sem referências, a associação CDN não é consultada |

Origin, cache, TTL e headers estão na árvore e nos behaviors selecionados. O cliente deve interpretar critérios e ordem com documentação; essas ferramentas não respondem por um modelo interno.

### Identificar a property de um hostname

O servidor envia este procedimento nas instruções da conexão MCP e nas descrições das ferramentas:

1. Chame `search_properties_by_domain` com o hostname completo em `domain`. Para uma família de nomes, informe o domínio pai. A ferramenta consulta lotes de grupos internamente e retorna apenas candidatas cujos nomes contêm o domínio literal, respeitando limites DNS e sufixos como `_dsa`.
2. Preserve `domain` e `maxScopes` ao seguir `evidence[].pagination.nextCursor`, que contém `scopeOffset` e `offset`. O cursor termina as páginas de candidatas do lote antes de avançar para outros grupos. Erros ficam em `unavailable`; o resultado informa cobertura parcial.
3. Envie até cinco referências candidatas (`propertyId`, `contractId`, `groupId`) para `get_hostname_overview`, com o hostname completo e o ambiente solicitado. Para CDN/cache, deixe `includeSecurity=false` e omita `configIds`.
4. Leia `inferences[kind=hostname_association]`: **CONFIRMED** permite analisar as regras da versão retornada; **NOT_MATCHED** descarta a candidata neste ambiente e exige continuar o inventário; **UNKNOWN** indica fonte indisponível ou resposta incompleta. HTTP 200 com array vazio não indica falta de permissão. Não tente resgatar uma candidata de produção usando staging ou latest.
5. Com uma associação confirmada, encerre a descoberta se o pedido for identificar uma property. Use `explain_cdn_behavior` com a mesma referência e ambiente; a ferramenta confirma novamente o vínculo antes de ler regras. Para uma árvore completa, use `get_property_configuration` com a versão confirmada. A confirmação já retorna metadados; não é necessário repetir `get_active_property_version`.

Exemplo de busca:

```json
{ "domain": "api.example.com" }
```

Exemplo de confirmação de candidata:

```json
{
  "hostname": "api.example.com",
  "environment": "PRODUCTION",
  "properties": [{ "propertyId": "prp_123", "contractId": "ctr_1", "groupId": "grp_1" }]
}
```

Se o filtro de nomes não encontrar uma associação, use `list_properties` para incluir properties com nomes diferentes: percorra `nextOffset` no mesmo escopo e `nextScopeOffset` com `offset=0`. Se conhecer contrato/grupo, informe ambos. Não conclua ausência do hostname apenas pela busca de nomes. Para listar todas as associações, percorra todo o inventário acessível e confirme as referências; falhas deixam a cobertura parcial.

O filtro não recebe expressões regulares livres. O servidor escapa o domínio e compara nomes como `example.com_dsa` e `api.example.com_dsa`, excluindo `badexample.com` e `example.com.evil`. `associationStatus=NOT_CHECKED` é uma candidata, sem prova de associação. `inventoryComplete` descreve a varredura dos nomes nesta chamada, não a cobertura de hostnames de properties com outros nomes.

`get_property_configuration` lê rules, não hostnames. AppSec também não comprova associação CDN. `latestVersion` não substitui a versão ativa; regras configuradas não comprovam HIT/MISS em execução. O cliente MCP precisa disponibilizar as instruções do servidor ao agente.

## Application Security e WAF

| Ferramenta | Argumentos | Responsabilidade/API | Limitações |
| --- | --- | --- | --- |
| `list_security_configurations` | paginação no servidor | GET AppSec configs | Acesso depende da conta/papel; paginação do catálogo em memória |
| `get_active_security_configuration` | configId | GET AppSec config, includeHostnames=true | Versões AppSec independentes de PAPI |
| `list_security_configuration_versions` | configId, page=1, pageSize=25 | GET AppSec versions, detail=true | Paginação remota; totalSize e versionList preservados |
| `get_security_policy` | seleção segurança, policyId opcional, sections, paginação no servidor | GET policies/policy/match-targets/rules/attack-groups/custom-rules/selected-hostnames | Sem policyId, catálogo é consultado uma vez; seções dependentes são marcadas indisponíveis e as independentes continuam. Seções podem falhar parcialmente |
| `get_rate_limiting_configuration` | seleção segurança, policyId opcional, sections=definitions/actions, paginação | Definições e ações relacionadas por ID nas páginas retornadas | Continuação por seção. Ação ausente na página não prova ausência; não avalia aplicação ao endpoint |
| `get_security_activation_history` | configId, environment e fromTime/toTime opcionais, paginação | GET AppSec activations; período aplicado antes de paginar | Não é histórico CDN; registros sem horário válido são UNKNOWN |

`sections` de get_security_policy: `policy`, `match_targets`, `waf_rules`, `attack_groups`, `custom_rules`, `custom_rule_definitions`, `selected_hostnames`. Padrão: as cinco primeiras. O mesmo offset/limit se aplica separadamente a cada array retornado; veja pagination por evidência e nextActions por seção. sourceScope distingue POLICY, CONFIGURATION_VERSION e CONFIGURATION_GLOBAL; seções da configuração não são filtradas por policyId. Definições globais de custom rules não comprovam sua forma histórica. Ações da política e versões do export devem ser analisadas conjuntamente.

## Investigação operacional

| Ferramenta | Argumentos | Responsabilidade/API | Limitações |
| --- | --- | --- | --- |
| `investigate_configuration_change` | property e/ou security, paginação no servidor, fromTime/toTime opcionais ISO 8601 | Reutiliza diffs PAPI ou export GET AppSec e históricos de ativação | Cada objeto informa fromVersion e toVersion separadamente. Período filtra todo o histórico recebido antes da paginação; diff não é filtrado por data |

O objeto `property` contém propertyId, contractId/groupId opcionais, fromVersion, toVersion e subtreePointer opcional. O objeto `security` contém configId, fromVersion e toVersion. Uma mudança pode ocorrer sem ativação; coincidência temporal não é comprovação de causa.

## Documentação

| Ferramenta | Argumentos | Responsabilidade/fonte | Limitações |
| --- | --- | --- | --- |
| `search_akamai_documentation` | query (2–256 caracteres), product=all ou property-mgr/application-security, paginação no servidor | Lê até quatro índices oficiais llms.txt e ordena correspondência em títulos/IDs/descrições | Busca lexical, termos em inglês recomendados; não full-text ou global. Erros de índices são explícitos |
| `get_akamai_documentation` | documentationId, startCharacter=0, maxCharacters=10000 (100–20000) | Lê `https://techdocs.akamai.com/{documentationId}.md` sob política fixa | Uma página, recorte por caracteres, sem redirects, crawler ou conteúdo privado |

Exemplo de identificador: `property-mgr/reference/get-property-version-rules`. A busca fornece URL de referência e ID; a recuperação aceita somente dois produtos, seções permitidas e slug simples. Texto recebido é dado externo, não instrução para o agente.

## Panorama, cobertura e continuação

Leia `coverage`, `inferences` e `nextActions` antes de `evidence`. O servidor serializa o panorama antes dos detalhes para preservar orientação em clientes que recortam respostas longas.

- `analysisComplete` informa se o panorama analisou a fonte inteira no escopo indicado; em CDN, toda a árvore recebida. Não inclui execução, includes ou recursos externos não expandidos.
- `detailsComplete` informa se faltam páginas ou escopos de detalhes. Uma análise completa pode ter detalhes paginados; o panorama basta para perguntas gerais, enquanto listas exaustivas exigem continuação.
- `nextActions` fornece tool, argumentos e motivo. Continuações de AppSec e rate limiting restringem a próxima consulta à seção pendente. O agente deve considerar o objetivo: aprofundamentos opcionais não exigem outra chamada para responder a um panorama já completo.
- Buscas de nomes e confirmação de candidatas retornam `hostnameInventoryComplete=false` e `uniquenessEstablished=false`. Uma property encontrada não permite afirmar que é a única.
- O panorama de cache conta todos os modos configurados, inclusive `MAX_AGE` em regras fora da página de detalhes. Exemplos preservam todos os critérios ancestrais e indicam se a amostra está completa. Não generalize `NO_STORE`, nem transforme `cacheError` em prova de único cache efetivo.

Veja os [fluxos de investigação e revisão das 18 tools](investigations.md).

## Erros e interpretação

Erros principais: INVALID_INPUT, AUTHENTICATION_FAILED, PERMISSION_DENIED, NOT_FOUND, FEATURE_AVAILABILITY_UNKNOWN, RATE_LIMITED, TIMEOUT, CANCELLED, RESPONSE_TOO_LARGE, INVALID_RESPONSE, BUDGET_EXCEEDED, BUSY e erros de rede/upstream. Falta de permissão não comprova falta de licença. HTTP 428 é pré-condição desconhecida, sem inferir habilitação específica.

Nenhuma ferramenta cria/edita/ativa/exclui recursos, executa purge, altera rate limiting ou modifica credenciais. Annotations readOnlyHint/destructiveHint descrevem o servidor, mas o controle efetivo é a política de transporte.
