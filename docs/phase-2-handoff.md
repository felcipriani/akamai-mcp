# Verificação e operação

Procedimentos para verificar a integração com clientes MCP e APIs Akamai e configurar o ambiente de operação.

## Componentes

- Projeto TypeScript com Node 24 LTS, SDK oficial MCP 2.3.1, Zod 4.2.0 e lockfile.
- 21 ferramentas, integrações PAPI/AppSec/SIEM/TechDocs, transporte stdio e respostas estruturadas.
- Política de operações fechada, EdgeGrid, cancelamento, retry, paginação, limites, sanitização e erros.
- Documentação de pesquisa, APIs, arquitetura, ferramentas, configuração, segurança e integração.

Use Node 24 LTS, conforme `package.json` e `.nvmrc`, e instale as dependências com `npm ci`.

## Informações necessárias

Solicitar ao responsável corporativo, através do canal seguro já usado pela organização:

1. Credenciais EdgeGrid do API client destinado à investigação, hostname e escopo de conta.
2. Acesso autorizado a grupos/contratos PAPI, propriedades e versões de referência.
3. Produtos AppSec existentes, configIds/policyIds, motores de proteção e redes disponíveis.
4. Confirmação de SIEM/coleta já habilitados, configIds corretos, hostname/credenciais SIEM e papel; esclarecer o nível READ-WRITE solicitado pela documentação.
5. Um incidente recente dentro da retenção SIEM, timestamps em UTC, hostname/path/IP/requestId e logs de origem se a pergunta envolver atribuição de 403.
6. Cliente MCP alvo, runtime Node 24, permissões de execução e acesso HTTPS/proxy/TLS corporativo.

Não é necessário contratar hospedagem, API IA, banco ou busca. Falta de licença/permissão não deve ser contornada por endpoint alternativo arbitrário nem interpretada automaticamente como ausência do recurso.

## Procedimentos de verificação

Ao configurar ou atualizar a integração, verifique os seguintes comportamentos:

- Compilação estrita e compatibilidade real entre Node, TypeScript, Zod e SDK MCP; scripts de build já preparados.
- Inicialização stdio e negociação MCP com cliente alvo; structuredContent/outputSchema e erros de schema.
- Signer EdgeGrid: timestamp, nonce, hash de corpo do POST de busca, query e canonicalização, confronto com SDK/protocolo oficial.
- Identificadores com prefixos PAPI, ambiguidade de contrato/grupo, properties sem ativação e distinção latest/produção/staging.
- Paginação remota de versões, listas paginadas em memória e transição entre escopos; campos nextLink/totalSize atuais.
- Hostname bucket e associação ativa por rede; cobertura de busca para propriedades disponíveis no contrato.
- AppSec: shapes de políticas, ações, attack groups, custom rules globais/versionadas, match targets e rate limiting nos produtos reais.
- Export AppSec síncrono GET, disponibilidade contratual e volume de diffs; não substituir por job POST fora da política sem nova decisão de escopo.
- SIEM: NDJSON completo/incompleto, contexto final, facets base64/URL, limit aproximado, filtros aplicados pelo servidor, retenção, latência, offset expirado e mudança de conteúdo entre releituras.
- 403: correlação exata, ação final versus ação de regra, casos sem eventos/sem permissão e confirmação por logs de origem quando disponíveis.
- Retry-After, 429, 502/503/504, timeouts durante download/espera, cancelamento, concorrência, budgets e encerramento.
- Limites de bytes/complexidade, resposta excessiva e erros que preservem a segurança sem tratar truncamento como resposta completa.
- Mascaramento de credenciais/headers/options e dados livres; dados corporativos não podem vazar para logs.
- Índices llms.txt por produto/seção, conteúdo Markdown, ranking lexical, falhas parciais e paginação documental.
- Política de leitura: tentar somente em ambiente e condições autorizados verificar que operações fora da allowlist e URLs externas sejam recusadas, sem realizar mutações reais.

Registre a versão do servidor, o ambiente, o cliente MCP, os cenários executados e os resultados para facilitar o diagnóstico de falhas e a comparação entre atualizações.

## Limitações operacionais

Cobertura documental limita-se a três produtos e busca em catálogo. Não há motor de avaliação de rules nem expansão de includes/EdgeWorkers/Cloudlets. Não há retenção própria, coleta SIEM contínua, snapshot transacional ou logs de todas as requisições/origem. A busca por requestId/IP se restringe aos eventos da página SIEM recebida. Overview limita consolidação a cinco recursos por grupo. Histórico de ativação não é trilha completa de edição não ativada. O transporte Node 24 utiliza o proxy do ambiente com `--use-env-proxy`; preserve a configuração de CA e TLS. Produtos ou capacidades ausentes no contrato permanecem indisponíveis.
