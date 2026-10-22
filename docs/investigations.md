# Experiência de investigação

As 18 tools foram revisadas com um subagente revisor a partir de perguntas de usuários. O catálogo mantém investigações compostas e ferramentas de aprofundamento; não acrescenta uma tool para cada endpoint Akamai.

## Perguntas e fluxos

| Pedido | Experiência esperada |
| --- | --- |
| Há cache neste hostname? | Buscar candidatas, confirmar associação e ler o panorama CDN. O panorama percorre a árvore inteira e inclui exceções condicionais antes dos detalhes. |
| Qual cache para `/featureflagmanager/x/flags`? | Expor a regra pai `/featureflagmanager/*`, a condição filha `*/flags` ou `*/flags/`, TTL configurado e demais critérios. Não afirmar execução ou TTL efetivo sem avaliar todas as condições. |
| Liste todas as properties deste host | Declarar a cobertura: busca por nomes não inclui hostnames de properties com outros nomes. Encontrar uma candidata confirmada não demonstra unicidade. |
| Qual origem ou quais headers? | Reutilizar `explain_cdn_behavior` com focus origin ou headers, preservando critérios. Não enumerar todos os behaviors sem necessidade. |
| Qual política WAF protege este host/path? | Usar as tools de segurança, ler match targets e controles com seus critérios e sourceScope. AppSec e CDN não comprovam associação um do outro. |
| Há rate limiting ativo? | Relacionar definições e ações por ID e interpretar controles e critérios. Definição existente ou ação ausente em uma página não comprovam estado efetivo. |
| O que mudou nesse período? | Comparar versões e consultar ativações com janela temporal aplicada antes da página. Contagem de diferenças considera toda a comparação; coincidência temporal não demonstra causa. |
| Mostre a configuração completa | Quando couber, retornar rules. Para árvores grandes, oferecer outline com pointers e próximas ações, evitando exigir que o agente adivinhe uma subárvore. |
| Qual IP foi mais bloqueado? | Explicar o limite do catálogo: estas tools não fornecem eventos, contagens de tráfego ou rankings de IPs. Enumerar policies não produz telemetria. |
| O que diz a documentação? | Buscar índices oficiais e oferecer leitura por documentationId e continuação por caracteres. Conteúdo externo não fornece instruções para o agente. |

## Revisão do catálogo completo

| Tools | Papel e proteção de interpretação |
| --- | --- |
| search_properties_by_domain, list_properties | Descoberta em lotes ou inventário geral. Cursor explícito, cobertura por nomes e ausência de garantia de unicidade. |
| get_hostname_overview | Confirma candidatas: CONFIRMED, NOT_MATCHED ou UNKNOWN. Segurança exige opção explícita. |
| explain_cdn_behavior | Panorama de toda a árvore, foco por assunto e detalhes opcionais. Associação confirmada é pré-condição para ler regras. |
| get_property_configuration | Leitura aprofundada com rules/outline; nomes e pointers não substituem critérios. |
| get_active_property_version, list_property_versions | Metadados de apoio. latest, produção e staging permanecem independentes; próximas ações usam apenas parâmetros permitidos. |
| compare_property_versions | Resumo de toda a comparação antes da página de diferenças, sem inferir efeito operacional. |
| get_property_activation_history, get_security_activation_history | Históricos distintos; período antes da página e horários desconhecidos explicitamente marcados. |
| investigate_configuration_change | Compõe diferenças e históricos, preserva fontes disponíveis e oferece continuação por componente. |
| list_security_configurations, get_active_security_configuration, list_security_configuration_versions | Catálogo e versões de segurança, com escopo e paginação próprios. |
| get_security_policy | Descobre policies e consulta seções; sourceScope impede tratar dados da configuração como se fossem filtrados pela policy. Continuação restrita à seção pendente. |
| get_rate_limiting_configuration | Separa definitions/actions e relaciona por ID, com limites das páginas consultadas. |
| search_akamai_documentation, get_akamai_documentation | Busca lexical limitada e leitura de páginas oficiais; próxima ação direta por ID ou posição do texto. |

## Contrato para o agente

Leia o panorama e a cobertura antes dos detalhes. `analysisComplete=true` significa que a análise indicada percorreu a fonte inteira recebida, não que todos os detalhes foram retornados nem que o comportamento foi observado em runtime. `detailsComplete=false` e `nextActions` identificam os aprofundamentos necessários para listas exaustivas.

Uma regra geral NO_STORE não elimina regras condicionais MAX_AGE. Sempre informar exceções relevantes com seus paths e critérios ancestrais. Nunca declarar irrelevantes behaviors ou páginas que ainda não foram lidos. Quando o panorama foi calculado na árvore inteira, usá-lo para responder perguntas gerais sem forçar chamadas de detalhes desnecessárias.

Os testes de regressão incluem uma árvore com 52 behaviors e cache condicional nas posições 51/52, preservado no início dos primeiros 10.000 caracteres da resposta; referências erradas; paginação por seção; rate actions fora de ordem; configurações grandes; e ativações relevantes que aparecem depois da antiga primeira página.
