# Contratos oficiais utilizados

Levantamento documental em 9/10/2026. Os paths abaixo não foram invocados contra contas Akamai. Os nomes internos em `read-policy.ts` vinculam cada consulta à política autorizada.

Base principal: especificações oficiais [PAPI v1](https://github.com/akamai/akamai-apis/blob/4521f29ef4e3dba15bbd5617365ff65d00af5049/apis/papi/v1/openapi.json), [AppSec v1](https://github.com/akamai/akamai-apis/blob/4521f29ef4e3dba15bbd5617365ff65d00af5049/apis/appsec/v1/openapi.json) e [SIEM v1](https://github.com/akamai/akamai-apis/blob/4521f29ef4e3dba15bbd5617365ff65d00af5049/apis/siem/v1/openapi.json). Placeholders `version` no código correspondem a `propertyVersion` e `versionNumber` nas respectivas APIs.

## Property Manager API

Prefixo `/papi/v1`; `PAPI-Use-Prefixes: true`; `accountSwitchKey` opcional, fixado pelo operador.

| Método/path | Implementação e contrato |
| --- | --- |
| GET `/groups` | Descobre groupId e contractIds; pares ordenados para seleção de escopo |
| GET `/properties?contractId=…&groupId=…` | Lista no escopo; resposta `properties.items`. Sem paginação remota nessa operação; paginação local |
| POST `/search/find-by-value` | Corpo exclusivamente `{hostname}`. Busca documentada, sem mutação. Resposta `versions.items` |
| GET `/properties/{propertyId}` | `properties.items`, IDs e latestVersion/productionVersion/stagingVersion independentes |
| GET `/properties/{propertyId}/versions?offset=…&limit=…` | Histórico de versões paginado pelo PAPI |
| GET `/properties/{propertyId}/versions/{version}/rules?validateRules=false` | Árvore completa, ruleFormat e behaviors; sem solicitar validação de rules |
| GET `/properties/{propertyId}/hostnames?hostname=…&network=…&offset=…&limit=…` | Associação ativa de hostname por ambiente, incluindo modelo de hostname bucket quando aplicável |
| GET `/properties/{propertyId}/versions/{version}/hostnames?validateHostnames=false` | Operação interna autorizada para leitura de hostnames de uma versão, sem validação; não há ferramenta genérica para chamá-la |
| GET `/properties/{propertyId}/activations` | Histórico de ativações, redes, versões e status; paginação e filtro locais |

`contractId` e `groupId` são obrigatórios ao listar properties; nas rotas com propertyId podem ser opcionais quando o recurso pertence a um único escopo. O código aceita ambos para desambiguar.

Também foi identificado GET `/properties/{propertyId}/versions/latest?activatedOn=PRODUCTION|STAGING`, mas a implementação lê os três campos da própria property para evitar três consultas e preservar sua relação no retorno. A comparação lê duas árvores `rules` e faz diff local; não chama bulk update, patch ou endpoint fictício de diff de rules.

Origin, caching, TTL e headers são obtidos dos behaviors dentro da árvore. Behaviors disponíveis e schemas variam por produto/ruleFormat. A leitura não transforma todas as condições em um motor de execução. Critérios desconhecidos, ordenação, herança, includes e comportamentos externos permanecem relevantes. Fontes: [resumo PAPI](https://techdocs.akamai.com/property-mgr/reference/api-summary), [busca de properties](https://techdocs.akamai.com/property-mgr/reference/post-search-find-by-value), [consulta de property](https://techdocs.akamai.com/property-mgr/reference/get-property) e [rules](https://techdocs.akamai.com/property-mgr/reference/get-property-version-rules).

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

## SIEM Integration API

GET `/siem/v1/configs/{configIds}`. A API admite vários IDs separados por ponto e vírgula; o servidor limita a dez IDs e os codifica na rota. Não envia `accountSwitchKey`.

| Aspecto | Contrato e decisão |
| --- | --- |
| Consulta temporal | from/to inteiros epoch seconds e limit; nunca combinados com offset |
| Continuação | offset e limit; sem from/to. Token pode expirar e produzir HTTP 416 |
| Retenção | Replay documentado de 12 horas; to pelo menos 5 segundos antes do presente |
| Ordenação | Armazenamento de logs, que pode diferir de httpMessage.start; eventos podem chegar atrasados |
| Paginação | NDJSON: eventos por linha e última linha com offset/total e limit quando aplicável. O programa exige contexto final e total consistente |
| Volume | API documenta até 600.000 logs por consulta, limit aproximado e possível retorno ligeiramente maior. Servidor restringe apiLimit a 5.000 e limita bytes |
| Filtros | API não oferece filtros por IP, hostname, path, requestId, ação ou regra. O programa aplica esses filtros localmente à página |
| Frequência | Documento recomenda evitar mais de uma chamada por segundo. O servidor espaça todas as tentativas SIEM no processo e trata 429 com backoff |
| Coleta | Requer integração e coleta habilitadas, política/configuração correta e papel Manage SIEM; não são habilitados pelo MCP |
| Evidências | attackData: configId, policyId, clientIP, appliedAction e facets de regras. httpMessage: requestId, host, path, status, method, start e metadados de conexão |
| Decodificação | URL decode preservando `+`, split por `;`, base64 por facet; relaciona regras pela posição e sinaliza comprimentos desiguais |
| Conteúdo sensível | Não retorna headers, query, apiKey, ruleData ou ruleSelectors. Não persiste eventos |

A documentação de onboarding solicita nível de acesso SIEM READ-WRITE, apesar de a operação de consulta ser GET. A política local permanece estritamente leitura; nenhuma ferramenta habilita coleta ou altera permissões. O administrador deve verificar essa particularidade com os controles corporativos e evitar conceder direitos adicionais a outras APIs. Consulte [get started SIEM](https://techdocs.akamai.com/siem-integration/reference/api-get-started).

As respostas podem se tornar incompletas após a janela de streaming documentada de dois minutos. O timeout local padrão é menor e o limite de bytes aborta corpos grandes. Sem linha final o servidor retorna erro, sem liberar um offset enganoso. Reduza apiLimit e repita a consulta original. Não há coleta contínua para compensar retenção ou atraso.

Fontes: [fetch security events](https://techdocs.akamai.com/siem-integration/reference/get-config), [rate limits](https://techdocs.akamai.com/siem-integration/reference/rate-limits), [configuration rule data](https://techdocs.akamai.com/siem-integration/reference/configuration-rule), [SIEM API](https://techdocs.akamai.com/siem-integration/reference/api), [EdgeGrid e account switch](https://techdocs.akamai.com/developer/docs/edgegrid).

## Documentação pública

Somente HTTPS para `techdocs.akamai.com`, nos produtos property-mgr, application-security e siem-integration. Busca lê até seis índices de seção `llms.txt`; recuperação lê um slug `docs`, `reference` ou `changelog` com `.md`. Destinos não podem ser fornecidos como URL e redirects são recusados. A interface Markdown é descrita nos [índices oficiais](https://techdocs.akamai.com/siem-integration/llms.txt).

Isso não oferece busca global por toda a plataforma, verificação contratual, conteúdo privado de Control Center ou busca semântica. Erro de um índice é registrado como falha parcial, não substituído por resultados simulados. Nenhuma página inteira é baixada para construir índice ou embeddings.
