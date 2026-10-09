# Akamai Investigation MCP

Servidor MCP local, em TypeScript, para investigação de CDN, Property Manager, Application Security e eventos SIEM da Akamai. O cliente MCP fornece o modelo de IA e interpreta as evidências. O servidor não contém modelo, banco, hospedagem ou serviço comercial adicional.

**Status: Fase 1 — Implementação concluída, ainda não testada ou validada.**

Foram implementadas 21 ferramentas de leitura, assinatura EdgeGrid, transporte stdio, paginação explícita, limites de recursos, cancelamento e documentação. Não foram executados builds, verificações de tipos, linters, testes, Inspector, inicialização do servidor ou operações das APIs Akamai. A instalação de dependências ocorreu com scripts desabilitados. Não há arquivos, frameworks ou mocks de testes.

## Requisitos

- Node.js **24 LTS**, npm e um cliente MCP que execute processos locais por stdio. A escolha do runtime segue o [ciclo oficial Node.js](https://nodejs.org/en/about/previous-releases).
- Credenciais EdgeGrid corporativas, permissões de leitura e acesso aos contratos/grupos envolvidos.
- Acesso HTTPS ao hostname do cliente Akamai e a `techdocs.akamai.com`. SIEM pode exigir hostname `cloudsecurity.akamaiapis.net` fornecido no provisionamento.
- Application Security e SIEM dependem dos produtos contratados, permissões e habilitação de coleta. Não há pressuposto de licenciamento universal.

O ambiente usado para instalar dependências informou Node 22.22.0. Isso não foi alterado nem usado para executar a solução. O programa exige Node 24 ao iniciar; o responsável pela Fase 2 deve selecionar esse runtime antes de qualquer execução.

## Instalação e configuração

Os comandos abaixo são instruções para o responsável pela próxima fase; registrar um servidor em um cliente pode inicializá-lo. Não os execute enquanto estiver sob a restrição da Fase 1.

```sh
cd /Users/felcipriani/Desktop/akamai-mcp
npm ci
cp .env.example .env
chmod 600 .env
```

Preencha `.env` localmente. Não envie credenciais ao agente como argumentos de ferramentas. Alternativamente, injete as mesmas variáveis pelo ambiente do processo usando o mecanismo seguro disponível na organização. O programa não carrega `.env` implicitamente e não lê `.edgerc`; o Node carrega o arquivo quando recebe `--env-file`.

As quatro variáveis `AKAMAI_HOST`, `AKAMAI_CLIENT_TOKEN`, `AKAMAI_CLIENT_SECRET` e `AKAMAI_ACCESS_TOKEN` são obrigatórias. `AKAMAI_HOST` deve conter somente o hostname de API sob `akamaiapis.net`, sem esquema, porta ou path.

`AKAMAI_SIEM_ENABLED=false` é o padrão. Habilite somente após confirmar a coleta existente. Se especificar credenciais `AKAMAI_SIEM_*`, forneça as quatro variáveis, sem mistura parcial com as credenciais principais. Sem essas variáveis, SIEM utiliza o cliente principal. SIEM não admite `accountSwitchKey`: ao definir `AKAMAI_ACCOUNT_SWITCH_KEY`, forneça credenciais SIEM próprias da conta de destino para habilitar essas consultas.

## Execução futura

Após iniciar a Fase 2, a execução a partir do código-fonte pode usar:

```sh
node --env-file=/Users/felcipriani/Desktop/akamai-mcp/.env --import tsx /Users/felcipriani/Desktop/akamai-mcp/src/index.ts
```

A alternativa compilada, também reservada à Fase 2:

```sh
npm run build
node --env-file=/Users/felcipriani/Desktop/akamai-mcp/.env /Users/felcipriani/Desktop/akamai-mcp/dist/index.js
```

`npm run dev` / `npm run start:source` executam `tsx src/index.ts` e requerem variáveis já injetadas. `npm start` executa a versão compilada. Nenhum desses scripts foi executado nesta entrega; `dist/` não foi gerado.

O canal stdout pertence exclusivamente ao JSON-RPC. Logs mínimos seguem para stderr. SIGINT, SIGTERM e cancelamento MCP interrompem operações em andamento.

## O que pode ser investigado

| Área | Evidências previstas |
| --- | --- |
| PAPI/CDN | Properties, associação de hostname por ambiente, versões independentes, árvore rules, origin/cache/TTL/headers, critérios ancestrais, diffs e ativações |
| Segurança | Configurações, versões, políticas e controles, match targets, ações de regras e grupos WAF, custom rules, rate policies e ativações |
| SIEM | Uma página de eventos por chamada, filtros locais, requestId, ação final, facets decodificados e contexto de continuação |
| Operação | Consolidação de hostname, evidências para 403 e diferenças entre configurações sem atribuição automática de causa |
| Documentação | Busca lexical em índices oficiais de três produtos e leitura de uma página Markdown por identificador |

Não há ferramenta de requisição HTTP arbitrária. O único POST permitido é a busca de hostname documentada pelo PAPI. Não existe código para criação, edição, ativação, purge, exclusão ou administração.

## Limites padrão

| Variável | Padrão | Finalidade |
| --- | --- | --- |
| `AKAMAI_REQUEST_TIMEOUT_MS` | 30000 | Prazo por tentativa HTTP, incluindo leitura do corpo |
| `AKAMAI_TOOL_TIMEOUT_MS` | 120000 | Prazo total da investigação |
| `AKAMAI_MAX_RETRIES` | 2 | Repetições limitadas de falhas de rede e HTTP 429/502/503/504 |
| `AKAMAI_MAX_RETRY_DELAY_MS` | 10000 | Maior espera automática; Retry-After maior retorna erro |
| `AKAMAI_MAX_RESPONSE_BYTES` | 8388608 | Limite do corpo HTTP após descompressão |
| `AKAMAI_MAX_TOOL_BYTES` | 131072 | Limite da resposta MCP serializada, incluindo texto e structuredContent |
| `AKAMAI_MAX_RESULTS` | 100 | Teto das páginas locais e das listas paginadas pela API |
| `AKAMAI_MAX_REQUESTS_PER_TOOL` | 30 | Orçamento HTTP incluindo tentativas e documentos |
| `AKAMAI_MAX_CONCURRENT_TOOLS` | 4 | Teto de investigações simultâneas; excedentes recebem BUSY |

SIEM é espaçado em pelo menos um segundo por tentativa no processo. Não há coordenação entre processos independentes.

Respostas excessivas falham explicitamente com `RESPONSE_TOO_LARGE`; o servidor não declara cobertura completa de dados truncados. Use páginas menores, `subtreePointer`, seleção de seções e consulta documental em partes. Uma árvore maior que o limite HTTP precisa de ajuste autorizado dos limites ou de redução de escopo na próxima fase; seleção local de subárvore não reduz o download PAPI.

## Documentação e continuidade

- [Pesquisa e decisão](docs/research.md)
- [Arquitetura e contratos](docs/architecture.md)
- [Catálogo das 21 ferramentas](docs/tools.md)
- [Segurança e credenciais](docs/security.md)
- [Integração com clientes MCP](docs/integration.md)
- [Contratos das APIs e fontes](docs/apis.md)
- [Passagem para a Fase 2](docs/phase-2-handoff.md)

Dependências diretas fixadas: SDK oficial MCP Server 2.3.1 (Apache-2.0), Zod 4.2.0 (MIT), TypeScript 5.9.3 (Apache-2.0), tsx 4.20.6 e tipos Node 24.10.1 (MIT). O lockfile registra as resoluções transitivas. Nenhuma licença paga ou trial é requisito; consumo das APIs continua sujeito ao contrato corporativo existente.

O projeto usa licença MIT. Acesso público à documentação não transfere direitos autorais da Akamai. Esta entrega não afirma funcionamento ou adequação a produção.
