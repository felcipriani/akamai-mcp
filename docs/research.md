# Pesquisa técnica e decisão

Pesquisa documental realizada em **9 de outubro de 2026**, sem executar operações Akamai ou os servidores pesquisados. Foram consultados READMEs, licenças, metadados públicos GitHub, documentação oficial, especificações OpenAPI e metadados npm. Nenhuma afirmação de maturidade abaixo é resultado de teste próprio.

## Alternativas encontradas

| Alternativa e fonte primária | Mantenedor e licença | Cobertura documentada de WAF/CDN/properties | Autenticação e transporte | Infraestrutura e leitura |
| --- | --- | --- | --- | --- |
| [Akamai MCP Gateway](https://techdocs.akamai.com/quick-deploy-apps/docs/akamai-mcp) | Akamai; serviço gerenciado, não uma licença open source identificada | Integra ecossistema Akamai; a página consultada não comprova catálogo completo de PAPI/AppSec/SIEM requerido | JWT; URL HTTPS `mcp.akamai.com/mcp` | A receita Quick Deploy provisiona Linode. Essa receita não prova que todo uso do gateway exija VM, nem garante gratuidade ou stdio local. Restrição integral a leitura não demonstrada pela fonte consultada |
| [akamai-cloud-mcp](https://github.com/akamai-developers/akamai-cloud-mcp) | Organização oficial akamai-developers; Apache-2.0 | Akamai Cloud/Linode: inventário e conta; não o conjunto EdgeGrid PAPI/AppSec/SIEM | Token Linode; stdio e HTTP | Execução local possível; projeto se declara somente leitura. Produto e API distintos do escopo solicitado |
| [akamai-docs-mcp](https://github.com/akamai-developers/akamai-docs-mcp) | Organização akamai-developers; Apache-2.0 | Documentação Akamai Cloud/Linode; não demonstra os três catálogos de Edge Platform necessários | Documentos públicos; stdio ou HTTP | Python/uv e índice local, preview hospedado opcional. README o identifica como experimental; não cobre investigação de contas EdgeGrid |
| [akamai-functions-mcp-server](https://github.com/akamai-developers/akamai-functions-mcp-server) | Organização akamai-developers; MIT | Apps, logs e histórico de Functions; não PAPI/WAF/SIEM | Login `spin aka`; processo local stdio | Binário Go/local, plugin Spin. Inclui deploy/link/unlink, portanto excede política investigativa |
| [readonly-mcp-akamai](https://github.com/desty2k/readonly-mcp-akamai) | Comunitário, desty2k; MIT | PAPI: busca, detalhes, rules e ativações. DNS, EdgeWorkers e listas de rede. Catálogo não oferece AppSec/SIEM requerido | EdgeGrid próprio; Python; stdio/HTTP/SSE | Local, sem cloud obrigatória; se declara leitura. Índice de properties atualizado em memória. Boa referência parcial, mas extensão não manteria TypeScript/Node exigidos |
| [ALECS, fork gamittal-ak](https://github.com/gamittal-ak/alecs-mcp-server-akamai) | Comunitário; MIT | README descreve properties, DNS, certificados, purge e listas. Cobertura WAF/SIEM requerida não demonstrada pelo catálogo principal consultado | EdgeGrid/.edgerc; stdio, documentação de transportes remotos | Local possível; superfície CRUD, ativação e purge. Reutilizar exigiria remover e auditar grande superfície administrativa |

A pesquisa de repositórios oficiais incluiu especificamente os três servidores da organização akamai-developers listados acima. A descrição geral de um repositório ou seu README não comprova que cada endpoint funciona; claims de testes dos mantenedores não foram adotados como validação desta solução.

## Manutenção observada

Metadados `pushed_at` lidos da API pública GitHub, repositórios não arquivados na consulta. A data indica atividade de push, não garantia de suporte, atualização de todas as integrações ou qualidade.

| Repositório | Último push informado, UTC |
| --- | --- |
| akamai-developers/akamai-cloud-mcp | 2026-06-13 |
| akamai-developers/akamai-docs-mcp | 2026-08-31 |
| akamai-developers/akamai-functions-mcp-server | 2026-04-10 |
| desty2k/readonly-mcp-akamai | 2026-04-28 |
| gamittal-ak/alecs-mcp-server-akamai | 2025-06-28 |
| akamai/AkamaiOPEN-edgegrid-node | 2026-10-08 |
| modelcontextprotocol/typescript-sdk | 2026-10-08 |
| akamai/akamai-apis | 2026-10-05 |

As fontes para essas datas são os metadados de cada repositório no [GitHub REST, exemplo SDK Akamai](https://api.github.com/repos/akamai/AkamaiOPEN-edgegrid-node). O README do fork ALECS remete a `acedergren/alecs-mcp-server-akamai`; a abertura desse outro repositório não foi recuperada na pesquisa. A avaliação usa exclusivamente o fork acessível e não generaliza seu estado para todos os forks.

## SDKs e componentes reutilizáveis

O [SDK TypeScript oficial MCP](https://github.com/modelcontextprotocol/typescript-sdk) fornece registro de ferramentas e transporte stdio. A linha v2 é estável na documentação consultada. A [lista oficial de releases, incluindo 2.3.1](https://github.com/modelcontextprotocol/typescript-sdk/releases), publicada em 5/10/2026, e seu pacote npm foram consultados. A dependência usada é `@modelcontextprotocol/server`, com seu core transitivo; não é necessário instalar cliente MCP, middleware HTTP ou SDK de IA.

O [SDK EdgeGrid Node oficial](https://github.com/akamai/AkamaiOPEN-edgegrid-node) é Apache-2.0. O manifesto consultado contém versão 5.0.0, Node >=22 e dependências undici/pino. A API pública `send` acopla autenticação e execução HTTP; sua tipagem não expõe AbortSignal ou limite de corpo. A implementação própria precisa interromper download, restringir destinos e recusar redirects. Importar um módulo interno de assinatura seria depender de interface não pública. Por isso foi escrito um signer pequeno e independente com `node:crypto`, baseado no [protocolo EdgeGrid documentado](https://techdocs.akamai.com/developer/docs/edgegrid) e na estrutura canônica de [auth.js](https://github.com/akamai/AkamaiOPEN-edgegrid-node/blob/master/src/auth.js) e [helpers.js](https://github.com/akamai/AkamaiOPEN-edgegrid-node/blob/master/src/helpers.js). O signer só atende GET e o pequeno POST de busca permitido. Não houve execução comparativa de assinaturas.

Também foi inspecionada a referência [EdgeGrid Python](https://github.com/akamai/AkamaiOPEN-edgegrid-python/blob/master/akamai/edgegrid/edgegrid.py), usada para esclarecer canonicalização e assinatura HMAC. Não há dependência Python no servidor.

## Decisão A/B/C

**Alternativa A, usar servidor existente:** não escolhida. O Gateway não oferece, nas fontes recuperadas, evidência suficiente de custo incremental zero, distribuição local controlada e cobertura investigativa requerida. Os servidores oficiais Cloud/Functions trabalham com outros produtos. O servidor comunitário somente leitura cobre PAPI, mas falta AppSec/SIEM e usa Python.

**Alternativa B, estender uma base existente:** não escolhida. Adaptar a base Python violaria o stack obrigatório. Recortar ALECS introduziria auditoria e manutenção de operações administrativas e dependências fora do escopo. Sua superfície não pode ser tornada segura apenas com annotations MCP ou instruções ao modelo.

**Alternativa C, servidor próprio com componentes oficiais reutilizados:** escolhida. O protocolo, stdio e schemas usam o SDK oficial; as APIs são chamadas por operações fechadas provenientes dos contratos oficiais. Implementa somente a orquestração investigativa específica e um transporte HTTP limitado. Não recria protocolo MCP, parser TypeScript, framework HTTP ou modelo de IA.

Não há cloud contratada, banco, indexação persistente, API de busca paga, embeddings ou coleta contínua. O custo das APIs depende do contrato Akamai existente. Se um produto não estiver contratado, a capacidade fica indisponível; contratar não é requisito imposto pelo servidor.

## Levantamento das APIs e documentação

A base técnica principal foi o [repositório oficial akamai/akamai-apis](https://github.com/akamai/akamai-apis), árvore `4521f29ef4e3dba15bbd5617365ff65d00af5049` na consulta. Foram lidos os OpenAPI de `apis/papi/v1`, `apis/appsec/v1` e `apis/siem/v1`, incluindo schemas e parâmetros. Consulte [o inventário de contratos](apis.md) para paths, distinções de versões e limitações.

Para documentos, o MCP oficial Cloud pesquisado não demonstrou cobertura de PAPI/AppSec/SIEM. Em vez de adicionar Python ou depender do preview, o projeto usa os índices `llms.txt` publicados pelo próprio TechDocs e a representação `.md` documentada no [índice SIEM](https://techdocs.akamai.com/siem-integration/llms.txt), [índice PAPI](https://techdocs.akamai.com/property-mgr/llms.txt) e [índice AppSec](https://techdocs.akamai.com/application-security/llms.txt). Busca apenas links, títulos e descrições dessas fontes; recuperação lê uma página. Não há busca textual global documentada adotada, nem scraping generalizado.

Versões de dependências foram confirmadas em documentação e metadados públicos npm antes de instalação. Isso confirma disponibilidade declarada e requisitos do pacote, sem comprovar execução conjunta. Consulte [arquitetura](architecture.md) e [passagem para Fase 2](phase-2-handoff.md).
