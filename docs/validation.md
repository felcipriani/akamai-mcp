# Relatório de testes e integração

Data: **9 de outubro de 2026**, America/Sao_Paulo. Timestamps das evidências estão em UTC. Nenhum recurso Akamai foi alterado, ativado, excluído, purgado ou habilitado; nenhum serviço pago foi introduzido.

## A. Resumo executivo e aderência

A implementação original foi preservada: camadas domain/application/infrastructure, schemas Zod, signer pequeno e SDK oficial. Foram corrigidos problemas de compilação, interoperabilidade MCP, respostas incompletas, consultas parciais, inicialização sem credenciais e sanitização. Não houve reescrita do projeto ou expansão de ferramentas administrativas.

As 21 ferramentas foram descobertas e chamadas por um cliente MCP real em processo separado, com fontes HTTP controladas. As capacidades incluem: leitura de properties/rules/versões/ativações, políticas/controles/rate policies AppSec, eventos SIEM, investigações compostas e TechDocs. Não há implementação presumida de avaliação runtime de rules, logs de origem/todas as requisições, trilha de edição não ativada, expansão EdgeWorkers/Cloudlets/includes ou retenção própria; esses itens são limitações explícitas do escopo original.

## B. Ambiente e dependências

| Item | Versão/condição observada |
| --- | --- |
| Sistema | Linux, ambiente gerenciado |
| Node.js | 24.19.0, dentro da faixa 24 LTS do projeto |
| npm | 11.9.0 |
| TypeScript | 5.9.3, strict e demais opções do projeto |
| MCP Server / Core / Client | 2.3.1 |
| Zod | 4.2.0 |
| tsx / tipos Node | 4.20.6 / 24.10.1 |
| ESLint / typescript-eslint | 10.12.0 / 8.71.1 |
| Rede | Proxy herdado e CA configurada; Node --use-env-proxy nas consultas reais |
| Credenciais | Quatro variáveis principais presentes; nenhum valor impresso/persistido |

O mecanismo de environment_status retornou observações atuais, mas prontidão de variáveis e política com estado `unknown`; isso não foi tratado como comprovação de acesso. A conectividade e autorização foram verificadas por requisições efetivas: TechDocs respondeu; PAPI/AppSec recusaram acesso. Não houve troca de identidade, login interativo, alteração de política ou tentativa de contornar o proxy.

A instalação final normal `npm ci` executou os scripts permitidos e reinstalou **110 pacotes** da plataforma. O lockfile fixa versões e integridades. SDK Client, ESLint e parser são dependências de desenvolvimento. [Inventário de licenças](evidence/dependency-licenses.json): MIT (81), Apache-2.0 (16), BSD-2-Clause (6), ISC (5), BSD-3-Clause (1), BlueOak-1.0.0 (1), todas permissivas nos pacotes instalados. Dependências opcionais de outras plataformas não foram executadas. ESLint 9 inicialmente avaliado estava depreciado; foi substituído por 10.12.0, sem supressões ou relaxamento da tipagem.

## C. Problemas encontrados e correções

| Criticidade | Problema, causa e impacto | Correção |
| --- | --- | --- |
| Alta | Build TS6196: import JsonValue não usado impedia compilação estrita | Remoção apenas do import; regras do compilador mantidas |
| Alta | Ausência de arrays PAPI/activationHistory virava lista vazia e podia sugerir inexistência de dados | Formatos ausentes retornam INVALID_RESPONSE; arrays vazios legítimos continuam aceitos |
| Média | Inicialização MCP tradicional não atendia server/discover 2026-07-28 | Entrada oficial serveStdio, compatível com initialize e discover; cancelamento separado por instância/probe |
| Média | get_security_policy interrompia o loop sem policyId e ignorava seções independentes posteriores | Descoberta única de catálogo; seções dependentes indisponíveis; demais seções continuam; status parcial |
| Média | Startup obrigatório com credenciais impedia toda testes e documentação pública sem acesso Akamai | Ausência completa aceita; operações autenticadas recusadas antes da rede; credenciais parciais/invalidas ainda rejeitadas |
| Média | Credencial em nome de campo ou segredo sobreposto podia escapar da sanitização | Chaves e valores sanitizados; segredos mais longos primeiro; objeto de saída sem protótipo |
| Baixa | Nomes herdados do protótipo podiam atravessar a verificação inicial da allowlist interna | Object.hasOwn antes da seleção; não há operação administrativa ou URL genérica exposta |
| Baixa | IDs não numéricos de property, configId/version zero e escapes Pointer inválidos passavam em alguns contratos internos | Validação de IDs positivos, prp_ opcional e JSON Pointer estrito |
| Média | Instruções antigas usavam caminho pessoal, não tinham comandos de teste e eram expressamente não verificadas | Instalação/execução e cliente gratuito verificados; README, arquitetura, segurança, integração e catálogo atualizados |

O primeiro teste de POST também identificou divergência **no material oficial de teste**: `POST inside limit` em test_data.json diverge do valor usado em test/test.js do mesmo commit. Foi selecionado o vetor público consistente `Post uses passed-max-body`, que corresponde ao POST com corpo completo. O esperado não foi recalculado pelo signer do projeto. A implementação de assinatura permaneceu igual; apenas recebeu parâmetros internos opcionais de timestamp/nonce para teste determinístico. Esses parâmetros não são expostos pelo MCP.

## D. Comandos executados e testes

| Comando | Resultado comprovado |
| --- | --- |
| npm ci --ignore-scripts --cache /workspace/.npm-cache (inspeção inicial) | Instalação; primeiro build identificou TS6196 |
| npm ci --cache /workspace/.npm-cache (instalação final normal) | Aprovado; [log](evidence/npm-ci.txt) |
| npm run typecheck | Aprovado; código e testes com configuração estrita |
| npm run lint | Aprovado; src, test e scripts |
| npm run build | Aprovado, imports/exports executáveis em Node 24 |
| npm run check | Aprovado: tipos, lint, build e **105 testes: 105 aprovados, 0 falhos, 0 cancelados, 0 ignorados** |
| npm audit --json --cache /workspace/.npm-cache | **0 vulnerabilidades conhecidas**, incluindo desenvolvimento; [JSON](evidence/npm-audit.json) |
| npm ls --depth=0 | Todas as versões diretas resolvidas, sem erro de árvore |
| node --import tsx src/index.ts com stdin fechado | Startup e término sem erro; stdout vazio e [log stderr](evidence/source-stderr.txt) |
| node scripts/mcp-smoke.mjs | initialize, tools/list e encerramento aprovados |
| node scripts/mcp-smoke.mjs --modern | discover, tools/list e encerramento aprovados |
| node scripts/mcp-smoke.mjs --modern --documentation | Chamada documental real aprovada |
| node --use-env-proxy scripts/akamai-smoke.mjs | Código 1: PAPI/AppSec 403; TechDocs aprovado; SIEM não consultado |
| git diff --check | Aprovado |

[Evidência completa do check](evidence/check.txt). A contagem 105 inclui 84 testes de nível superior e 21 subtestes individuais do catálogo MCP. Durante o desenvolvimento, a falha moderna foi corrigida pela entrada oficial e a divergência de fixture foi resolvida contra a fonte oficial, conforme seção C.

Os testes utilizam node:test, asserts, tsx e o cliente SDK. HTTP real em **loopback** valida download, timeout durante corpo e cancelamento. Outras respostas HTTP são mocks/fixtures deliberados; nenhuma execução da suíte consulta a conta Akamai. A suíte utiliza sockets de loopback e não exige credenciais ou serviços externos.

Cobertura verificada por cenários:

- Entradas inválidas/ausentes, defaults, IDNA, property/config IDs, paginação, limites e intervalos invertidos.
- Quatro vetores EdgeGrid GET, GET com query, POST com corpo e POST vazio publicados pela Akamai; nonce renovado e assinatura refeita em retry.
- URLs/query/headers PAPI, corpo exclusivo da busca POST, validateRules/validateHostnames=false, account switch e proibição de SIEM na conta incorreta.
- HTTP 401/403/404/416/428/429/500/502/503/504/302, falhas de rede, JSON inválido, retry, Retry-After numérico e HTTP-date, teto de espera e bytes.
- Separação de latest/produção/staging e de versões PAPI/AppSec; ausência de versão ativa sem fallback; múltiplas properties e escopos/páginas.
- Rules aninhadas com critérios ancestrais; diff estável de chaves, arrays ordenados e pointers escapados.
- Políticas, rate policies/actions, falhas parciais, catálogos e históricos incompletos.
- SIEM usando exemplo oficial, facets URL/base64, filtros, contexto final/total, corpo incompleto, paginação em memória/offset, retenção e espaçamento de chamadas.
- Cenários A–E do plano: deny correlacionado; 403 inconclusivo; diff/ativação sem causalidade; permissão parcial; histórico fora da retenção sem eventos inventados.
- Sanitização de chaves/valores, headers, dados omitidos SIEM, política de leitura, orçamento, BUSY, resposta excessiva e cancelamento MCP.
- Documentação: catálogo/ranking, falha parcial de índice, recorte e recusa de URL externa.

As fontes oficiais das fixtures e respectivos commits estão em [test/fixtures/README.md](../test/fixtures/README.md). Os contratos foram revisados no repositório oficial `akamai/akamai-apis`, commit `4521f29ef4e3dba15bbd5617365ff65d00af5049`, documentado em [apis.md](apis.md). O signer foi confrontado com vetores do commit `713e7c91833f4deeb358b9ca37dd863fc9c0630a` do SDK oficial Node.

## E. Evidências MCP

| Verificação | Evidência |
| --- | --- |
| Handshake initialize, protocolo 2025-11-25 | [mcp-legacy.json](evidence/mcp-legacy.json) |
| Descoberta moderna, protocolo 2026-07-28 | [mcp-modern.json](evidence/mcp-modern.json) |
| tools/list | 21 nomes, schemas de saída e annotations readOnly/destructive verificados |
| tools/call | Todas as 21 ferramentas chamadas no servidor compilado, fontes HTTP controladas; nenhum isError inesperado |
| Saída estruturada | Envelope JSON em structuredContent equivalente ao texto; validação pelo cliente SDK |
| Erros | Schema/nomes inválidos e falta de credenciais; sessão permanece utilizável |
| Stdout | Parsing pelo cliente sem erro; execução fonte com EOF teve zero bytes fora do protocolo |
| Stderr | Somente eventos JSON mínimos; sem argumentos, respostas ou credenciais |
| Encerramento | Processo termina ao fechar transporte; cancelamento libera concorrência e aborta HTTP |
| Chamada real moderna | [TechDocs por MCP](evidence/mcp-techdocs.txt) e [stderr](evidence/mcp-techdocs-stderr.txt) |

Nenhum Inspector pago, SDK de modelo ou cliente de IA contratado foi utilizado. O cliente SDK e sua configuração de execução encontram-se em [integration.md](integration.md). Referência mcpServers é documentada para adaptação; nenhuma instalação em GUI específica foi presumida.

## F. Integração real Akamai

[Evidência sanitizada](evidence/akamai-real.json), sem dados corporativos ou segredos. As credenciais foram consumidas pelo mecanismo já configurado, com assinatura EdgeGrid e TLS/proxy ativos.

| Fonte / operação efetivamente tentada | Resultado | Nível de confiança |
| --- | --- | --- |
| GET /papi/v1/groups | HTTP 403, PERMISSION_DENIED | Rede respondeu; nenhum grupo/property obtido |
| GET /papi/v1/groups, diagnóstico controlado adicional | HTTP 403, application/problem+json, type `https://problems.luna.akamaiapis.net/-/pep-authz/deny`, title Forbidden | [Diagnóstico](evidence/akamai-authz-diagnostic.json); não prova autenticação operacional completa |
| GET /appsec/v1/configs | HTTP 403, PERMISSION_DENIED | Nenhuma configuração/política obtida |
| TechDocs /property-mgr/reference/llms.txt e /property-mgr/docs/llms.txt | Sucesso na busca lexical | Conteúdo real, sem fixture |
| TechDocs /siem-integration/reference/get-config.md | Sucesso em consulta direta e via MCP | Conteúdo real, saída estruturada comprovada |
| SIEM GET /siem/v1/configs/{configIds} | Não executado | Nenhum configId autorizado descoberto; sem coleta fictícia ou massiva |
| Demais operações PAPI/AppSec e composição autenticada | Não executadas na conta | Testadas com fixtures/mocks e contratos oficiais |

Os 403 não são tratados como licença ausente, credenciais válidas universalmente ou evidência de bloqueio do tráfego da aplicação. A assinatura foi validada contra vetores oficiais, mas a aceitação operacional e os direitos de leitura na conta permanecem pendentes. Não foram inventados IDs/incidentes nem concedidos novos direitos para ultrapassar o impedimento.

## G. Segurança, resiliência e qualidade

Nenhuma operação administrativa está no catálogo. Único POST é a busca PAPI documentalmente somente leitura; export AppSec permanece GET síncrono. Destinos são HTTPS fixos sob a política da aplicação, sem URLs/headers/credenciais em argumentos. Redirects não são seguidos e TLS não foi desabilitado. Consultas investigam hostnames como dados, sem usá-los como destino de rede.

Credenciais conhecidas, nomes de campos e headers sensíveis são mascarados. SIEM omite headers, query, apiKey, ruleData, ruleSelectors e dados pessoais adicionais do exemplo oficial. Logs registram apenas evento/ferramenta/status/código. Fixtures contêm somente exemplos públicos ou dados sintéticos; não credenciais corporativas.

Foram mantidos e exercitados timeout de corpo/investigação, retry limitado, backoff, Retry-After, cancelamento, teto de bytes/complexidade/requests/resultados/concorrência e frequência SIEM. Não foi adicionado Redis, fila, banco, cache especulativo ou hospedagem. As portas existentes permitiram testar casos de uso sem acoplá-los ao MCP. Não há any, @ts-ignore, @ts-expect-error, eslint-disable ou supressões de segurança no código/testes.

A auditoria npm passou, mas sua conclusão limita-se às vulnerabilidades publicadas no instante da consulta. Sanitização por padrões não equivale a DLP universal; dados investigativos como IP/path/requestId permanecem na resposta quando necessários. Conteúdo de APIs/documentos continua externo e não deve ser tratado como instrução de execução.

## H. Pendências e limitações existentes

1. Corrigir/provisionar os direitos de leitura da identidade configurada na conta Akamai pelo procedimento corporativo e repetir o smoke. O MCP não modifica permissões ou credenciais. Não enviar secrets no chat.
2. Homologar consulta de uma property, versões ativas, rules/hostnames/ativações e AppSec config/políticas/regras/rate policies com dados reais; confirmar permissões e disponibilidade efetiva de cada endpoint.
3. Executar SIEM real apenas com configId acessível, produto/coleta já habilitados e `AKAMAI_SIEM_ENABLED` habilitado no servidor. Validar um período pequeno e a composição autenticada quando as fontes estiverem acessíveis.
4. Compatibilidade com aplicações gráficas específicas não foi testada; SDK oficial via stdio está verificado. O formato mcpServers fornecido é referência adaptável.
5. Limitações originais preservadas: sem logs de origem, avaliação runtime completa de rules, retenção própria, snapshot atômico ou expansão de includes/EdgeWorkers/Cloudlets; overview limitado a cinco recursos de cada grupo e filtros SIEM restritos aos eventos da página recebida. Empty SIEM não comprova ausência de bloqueio.

Não há falha de build, lint, tipos ou teste pendente. Não há necessidade de contratar novo serviço para concluir a homologação.

## I. Critérios de aceite e classificação

| Grupo | Resultado |
| --- | --- |
| Código, dependências e compilação | Aprovado |
| Testes unitários, HTTP em loopback, cenários de erro e composição | 105/105 aprovados |
| MCP initialize/discover/list/call/saída/encerramento | Aprovado com cliente oficial |
| Contratos e assinatura EdgeGrid | Revisados e vetores aprovados |
| Segurança e resiliência | Controles revisados/testados; audit sem vulnerabilidades conhecidas |
| Instalação, execução e configuração de referência | Verificadas; documentação atualizada |
| TechDocs real | Aprovado direto e por MCP |
| PAPI/AppSec/SIEM real | Homologação impedida por 403; dados de recursos e SIEM não verificados |
| Custo incremental | Nenhum serviço pago ou operação de contratação introduzido |
