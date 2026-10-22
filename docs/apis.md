# Contratos oficiais utilizados

Os nomes internos em `read-policy.ts` vinculam cada consulta à política de operações permitidas.

Base principal: especificações oficiais [PAPI v1](https://github.com/akamai/akamai-apis/blob/4521f29ef4e3dba15bbd5617365ff65d00af5049/apis/papi/v1/openapi.json) e [AppSec v1](https://github.com/akamai/akamai-apis/blob/4521f29ef4e3dba15bbd5617365ff65d00af5049/apis/appsec/v1/openapi.json). Placeholders `version` no código correspondem a `propertyVersion` e `versionNumber` nas respectivas APIs.

## Property Manager API

Prefixo `/papi/v1`; `PAPI-Use-Prefixes: true`; `accountSwitchKey` opcional, fixado pelo operador.

| Método/path | Implementação e contrato |
| --- | --- |
| GET `/groups` | Descobre groupId e contractIds; pares ordenados para seleção de escopo |
| GET `/properties?contractId=…&groupId=…` | Lista no escopo; resposta `properties.items`. Sem paginação remota nessa operação; paginação no servidor |
| GET `/properties/{propertyId}` | `properties.items`, IDs e latestVersion/productionVersion/stagingVersion independentes |
| GET `/properties/{propertyId}/versions?offset=…&limit=…` | Histórico de versões paginado pelo PAPI |
| GET `/properties/{propertyId}/versions/{version}/rules?validateRules=false` | Árvore completa, ruleFormat e behaviors; sem solicitar validação de rules |
| GET `/properties/{propertyId}/hostnames?hostname=…&network=…&offset=…&limit=…` | Associação ativa de hostname por ambiente, incluindo modelo de hostname bucket quando aplicável |
| GET `/properties/{propertyId}/versions/{version}/hostnames?validateHostnames=false` | Operação interna autorizada para leitura de hostnames de uma versão, sem validação; não há ferramenta genérica para chamá-la |
| GET `/properties/{propertyId}/activations` | Histórico de ativações, redes, versões e status; paginação e filtro aplicados pelo servidor |

`contractId` e `groupId` são obrigatórios ao listar properties; nas rotas com propertyId podem ser opcionais quando o recurso pertence a um único escopo. O código aceita ambos para desambiguar.

Também foi identificado GET `/properties/{propertyId}/versions/latest?activatedOn=PRODUCTION|STAGING`, mas a implementação lê os três campos da própria property para evitar três consultas e preservar sua relação no retorno. A comparação lê duas árvores `rules` e calcula o diff estrutural em memória; não chama bulk update, patch ou endpoint fictício de diff de rules.

Para identificar uma property, liste grupos e properties e confirme a associação do hostname por ambiente nas referências identificadas, conforme o [procedimento das ferramentas](tools.md#identificar-a-property-de-um-hostname). Todas as operações PAPI implementadas utilizam GET.

Origin, caching, TTL e headers são obtidos dos behaviors dentro da árvore. Behaviors disponíveis e schemas variam por produto/ruleFormat. A leitura não transforma todas as condições em um motor de execução. Critérios desconhecidos, ordenação, herança, includes e comportamentos externos permanecem relevantes. Fontes: [resumo PAPI](https://techdocs.akamai.com/property-mgr/reference/api-summary), [consulta de property](https://techdocs.akamai.com/property-mgr/reference/get-property) e [rules](https://techdocs.akamai.com/property-mgr/reference/get-property-version-rules).

## Application Security API

Prefixo `/appsec/v1`; `accountSwitchKey` opcional, fixado pelo operador. Todas as operações implementadas são GET.

| Path | Contrato utilizado |
| --- | --- |
| `/configs` | Lista `configurations` com id, nome e versões |
| `/configs/{configId}?includeHostnames=true` | Versões independentes e productionHostnames |
| `/configs/{configId}/versions?page=…&pageSize=…&detail=true` | `versionList`, totalSize e versões ativas; paginação remota |
| `/configs/{configId}/versions/{version}` | Leitura básica autorizada na infraestrutura; levantamento de metadados por versão |
| `/configs/{configId}/versions/{version}/selected-hostnames` | `hostnameList`, candidatos selecionados pela versão |
| `/configs/{configId}/versions/{version}/match-targets` | `matchTargets`, critérios e vínculos com políticas |
| `/configs/{configId}/versions/{version}/security-policies` | `policies`, descoberta de policyId |
| `/configs/{configId}/versions/{version}/security-policies/{policyId}` | Metadados e policySecurityControls |
| `/configs/{configId}/versions/{version}/security-policies/{policyId}/rules` | `ruleActions`, ações de regras WAF |
| `/configs/{configId}/versions/{version}/security-policies/{policyId}/attack-groups` | `attackGroupActions` |
| `/configs/{configId}/versions/{version}/security-policies/{policyId}/custom-rules` | `customRules` e ações; pode incluir regras não associadas com action=none |
| `/configs/{configId}/custom-rules` | Definições de regras globais da configuração, sem afirmar versão histórica |
| `/configs/{configId}/versions/{version}/rate-policies` | `ratePolicies`, condições, thresholds e identificadores |
| `/configs/{configId}/versions/{version}/security-policies/{policyId}/rate-policies` | `ratePolicyActions`, vínculos e ações da política |
| `/configs/{configId}/activations` | `activationHistory` com version/network/status/activationDate |
| `/export/configs/{configId}/versions/{version}` | Export **síncrono GET**, usado para comparação estrutural entre versões |

Não se utiliza POST `/configs/{configId}/versions/{version}/export`: esse contrato cria tarefa de export assíncrona e está fora da allowlist. A existência de um path na documentação não concede autorização ou licença. O conjunto depende de App & API Protector, Kona Site Defender, Web Application Protector e funcionalidades contratadas, inclusive Client Reputation/Bot Manager quando presentes. Modelos WAF podem apresentar ações em grupos ou motores distintos; a solução preserva respostas e falhas parciais, sem inventar um campo uniforme.

Fontes: [resumo Application Security](https://techdocs.akamai.com/application-security/reference/api-summary), [rate policies](https://techdocs.akamai.com/application-security/reference/get-rate-policies), [ações de rate policies](https://techdocs.akamai.com/application-security/reference/get-rate-policies-actions), [metadados de versão](https://techdocs.akamai.com/application-security/reference/get-version-number), [export síncrono](https://techdocs.akamai.com/application-security/reference/get-export-config-version).

## Documentação pública

Somente HTTPS para `techdocs.akamai.com`, nos produtos property-mgr e application-security. Busca lê até quatro índices de seção `llms.txt`; recuperação lê um slug `docs`, `reference` ou `changelog` com `.md`. Destinos não podem ser fornecidos como URL e redirects são recusados. A interface Markdown é descrita nos [índices oficiais](https://techdocs.akamai.com/property-mgr/llms.txt).

Isso não oferece busca global por toda a plataforma, verificação contratual, conteúdo privado de Control Center ou busca semântica. Erro de um índice é registrado como falha parcial, não substituído por resultados simulados. Nenhuma página inteira é baixada para construir índice ou embeddings.
