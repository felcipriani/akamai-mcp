# Akamai Investigation MCP

Servidor MCP local, TypeScript/Node.js, com **21 ferramentas exclusivamente de leitura** para CDN/Property Manager, Application Security, SIEM e documentação oficial. Não exige hospedagem, banco, serviços de IA ou infraestrutura paga.

**Status: VALIDADO LOCALMENTE.** Build, tipos, lint e testes locais aprovados. Consultas reais PAPI e AppSec retornaram HTTP 403; a homologação desses produtos e do SIEM permanece pendente. Busca e recuperação pública TechDocs foram executadas com sucesso, inclusive por MCP. Veja [o relatório](docs/validation.md).

## Instalação e validação local

Requisitos: Node.js **24 LTS** e npm. Clone o repositório e, na pasta do projeto:

```sh
npm ci
npm run check
npm run smoke:mcp
```

`check` executa TypeScript estrito (incluindo testes), ESLint, build e a suíte. Os testes não utilizam credenciais reais ou serviços externos: usam vetores oficiais, fixtures, HTTP em loopback e processos MCP reais. `smoke:mcp` inicia o servidor compilado pelo cliente SDK oficial gratuito, negocia MCP, lista as ferramentas e encerra o processo. Nenhuma API Akamai é consultada nesse comando.

O servidor inicia **sem credenciais** para descoberta e documentação pública. Chamadas de APIs autenticadas nesse modo retornam `CONFIGURATION_ERROR`, sem requisições externas. Um conjunto parcial ou inválido de credenciais impede o startup, sem imprimir os valores.

## Configuração segura e consultas reais

Use o mecanismo de variáveis secretas da organização ou configure um `.env` local protegido, não versionado:

```sh
cp .env.example .env
chmod 600 .env
```

Preencha localmente `AKAMAI_HOST`, `AKAMAI_CLIENT_TOKEN`, `AKAMAI_CLIENT_SECRET` e `AKAMAI_ACCESS_TOKEN`. Host deve ser somente o hostname sob `akamaiapis.net`, sem esquema, porta ou path. O programa não lê `.edgerc` nem carrega `.env` automaticamente; o Node fornece `--env-file`.

```sh
npm run build
node --use-env-proxy --env-file=.env dist/index.js
```

O processo aguarda mensagens MCP no stdin; silêncio no stdout é normal. Em um cliente MCP, configure Node e `dist/index.js` com caminhos absolutos conforme [integration.md](docs/integration.md). `--use-env-proxy` respeita HTTP_PROXY, HTTPS_PROXY e NO_PROXY no Node 24, mantendo a confiança TLS configurada.

`AKAMAI_ACCOUNT_SWITCH_KEY` é fixado pelo operador. SIEM não aceita esse parâmetro: nesse caso, configure o conjunto completo `AKAMAI_SIEM_*` da conta de destino. SIEM fica desabilitado por padrão; habilite `AKAMAI_SIEM_ENABLED` somente se coleta, permissões e produto já estiverem disponíveis.

Com credenciais já injetadas, execute opcionalmente:

```sh
npm run smoke:mcp -- --documentation
npm run smoke:akamai
```

O primeiro comando consulta uma página pública por MCP. O segundo realiza leituras reais limitadas de um escopo/property e uma configuração de segurança, seguindo apenas IDs efetivamente retornados. Não ativa, modifica ou habilita recursos. SIEM consulta no máximo 60 segundos e solicita 10 eventos apenas se estiver habilitado localmente e um configId acessível tiver sido descoberto. O script imprime status e contagens; respostas corporativas e segredos são omitidos. Código de saída 1 indica falha de alguma consulta real. Também pode carregar o `.env` com `node --use-env-proxy --env-file=.env scripts/akamai-smoke.mjs`.

## Catálogo e interpretação

| Área | Capacidades |
| --- | --- |
| PAPI/CDN | Properties por hostname, versões latest/produção/staging, rules, origin/cache/TTL/headers, diferenças estruturais e ativações |
| AppSec | Configurações e versões próprias, políticas, match targets, regras WAF, custom rules, rate policies e ativações |
| SIEM | Uma página por consulta, filtros locais, requestId, ação final e facets decodificados, continuação explícita |
| Operação | Overview de hostname, evidências de HTTP 403 e alterações de configuração sem atribuição automática de causa |
| TechDocs | Busca lexical em índices oficiais de três produtos e recuperação Markdown por identificador |

Leia `evidence`, `inferences`, `unavailable`, `limitations` e `pagination` em conjunto. Última versão não significa versão ativa. Ausência de eventos não comprova ausência de bloqueio. Um 403 da API de gestão representa falha de acesso à consulta, sem atribuir um 403 da aplicação ao WAF ou à origem.

Não existe proxy HTTP arbitrário. Todas as operações são GET, exceto a busca PAPI documentada por POST com corpo fechado `{hostname}`. Redirects são recusados. Logs mínimos seguem para stderr; stdout é reservado ao protocolo MCP.

## Limites padrão

| Variável | Padrão |
| --- | --- |
| AKAMAI_REQUEST_TIMEOUT_MS | 30000 por tentativa, incluindo corpo |
| AKAMAI_TOOL_TIMEOUT_MS | 120000 por investigação |
| AKAMAI_MAX_RETRIES | 2, para rede e HTTP 429/502/503/504 |
| AKAMAI_MAX_RETRY_DELAY_MS | 10000; Retry-After maior retorna erro |
| AKAMAI_MAX_RESPONSE_BYTES | 8388608 após descompressão |
| AKAMAI_MAX_TOOL_BYTES | 131072 incluindo texto e structuredContent |
| AKAMAI_MAX_RESULTS | 100 |
| AKAMAI_MAX_REQUESTS_PER_TOOL | 30 incluindo tentativas |
| AKAMAI_MAX_CONCURRENT_TOOLS | 4; excedentes recebem BUSY |

SIEM espaça chamadas/tentativas em um segundo por processo. Corpos grandes geram `RESPONSE_TOO_LARGE`; diminua páginas/seções ou selecione subárvore. Subárvore local não reduz o download da árvore PAPI. Cancelamento MCP e SIGINT/SIGTERM interrompem operações pendentes. Não há cache histórico, retenção própria, coleta contínua ou motor de execução de rules.

## Documentação

- [Validação e evidências](docs/validation.md)
- [Catálogo e contratos das 21 ferramentas](docs/tools.md)
- [Arquitetura](docs/architecture.md)
- [Segurança](docs/security.md)
- [Integração local gratuita](docs/integration.md)
- [Contratos oficiais das APIs](docs/apis.md)
- [Pesquisa histórica da Fase 1](docs/research.md)

Dependências e licença MIT do projeto estão no manifesto/lockfile. Ferramentas de teste e o cliente de referência são open source, sem modelo de IA obrigatório. Clientes de IA de terceiros podem ter custos próprios, independentes do servidor. As APIs continuam sujeitas às permissões e produtos do contrato Akamai existente.
