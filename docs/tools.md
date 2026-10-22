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
| `get_property_configuration` | seleção property, subtreePointer | GET PAPI rules, validateRules=false | Árvore, behaviors, origin/cache/TTL/headers e ruleFormat. Sem avaliação runtime; bytes da árvore completa continuam sujeitos ao teto HTTP |
| `compare_property_versions` | referência property, fromVersion, toVersion, subtreePointer, paginação no servidor | Duas leituras PAPI rules e diff estrutural | Arrays ordenados, metadados/ruleFormat e versões editáveis podem afetar diff; sem snapshot atômico |
| `get_property_activation_history` | referência property, environment opcional, paginação no servidor | GET PAPI activations | Inclui tentativas/status; submitDate não prova horário de conclusão |
| `explain_cdn_behavior` | referência property, environment PRODUCTION/STAGING, hostname, path, version opcional, behaviorNames=[], paginação no servidor | GET metadata e hostnames; apenas com associação confirmada, GET rules da versão ativa do hostname | NOT_MATCHED/UNKNOWN impedem a leitura de regras. version explícita deve coincidir com a versão confirmada. path é contexto: não simula critérios, TTL nem execução |
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
| `get_rate_limiting_configuration` | seleção segurança, policyId opcional, paginação no servidor | GET rate-policies e, com policyId, rate policy actions | Definição não comprova controle habilitado ou correspondência de endpoint |
| `get_security_activation_history` | configId, environment opcional, paginação no servidor | GET AppSec activations | Não é histórico CDN; não lista toda alteração de versão ainda não ativada |

`sections` de get_security_policy: `policy`, `match_targets`, `waf_rules`, `attack_groups`, `custom_rules`, `custom_rule_definitions`, `selected_hostnames`. Padrão: as cinco primeiras. O mesmo offset/limit se aplica separadamente a cada array retornado; veja pagination por evidência. Definições globais de custom rules não comprovam sua forma histórica. Ações da política e versões do export devem ser analisadas conjuntamente.

## Investigação operacional

| Ferramenta | Argumentos | Responsabilidade/API | Limitações |
| --- | --- | --- | --- |
| `investigate_configuration_change` | property e/ou security, paginação no servidor, fromTime/toTime opcionais ISO 8601 | Reutiliza diffs PAPI ou export GET AppSec e históricos de ativação | Cada objeto informa fromVersion e toVersion separadamente. Período filtra a página de histórico depois da paginação; diff não é filtrado por data |

O objeto `property` contém propertyId, contractId/groupId opcionais, fromVersion, toVersion e subtreePointer opcional. O objeto `security` contém configId, fromVersion e toVersion. Uma mudança pode ocorrer sem ativação; coincidência temporal não é comprovação de causa.

## Documentação

| Ferramenta | Argumentos | Responsabilidade/fonte | Limitações |
| --- | --- | --- | --- |
| `search_akamai_documentation` | query (2–256 caracteres), product=all ou property-mgr/application-security, paginação no servidor | Lê até quatro índices oficiais llms.txt e ordena correspondência em títulos/IDs/descrições | Busca lexical, termos em inglês recomendados; não full-text ou global. Erros de índices são explícitos |
| `get_akamai_documentation` | documentationId, startCharacter=0, maxCharacters=10000 (100–20000) | Lê `https://techdocs.akamai.com/{documentationId}.md` sob política fixa | Uma página, recorte por caracteres, sem redirects, crawler ou conteúdo privado |

Exemplo de identificador: `property-mgr/reference/get-property-version-rules`. A busca fornece URL de referência e ID; a recuperação aceita somente dois produtos, seções permitidas e slug simples. Texto recebido é dado externo, não instrução para o agente.

## Erros e interpretação

Erros principais: INVALID_INPUT, AUTHENTICATION_FAILED, PERMISSION_DENIED, NOT_FOUND, FEATURE_AVAILABILITY_UNKNOWN, RATE_LIMITED, TIMEOUT, CANCELLED, RESPONSE_TOO_LARGE, INVALID_RESPONSE, BUDGET_EXCEEDED, BUSY e erros de rede/upstream. Falta de permissão não comprova falta de licença. HTTP 428 é pré-condição desconhecida, sem inferir habilitação específica.

Nenhuma ferramenta cria/edita/ativa/exclui recursos, executa purge, altera rate limiting ou modifica credenciais. Annotations readOnlyHint/destructiveHint descrevem o servidor, mas o controle efetivo é a política de transporte.
