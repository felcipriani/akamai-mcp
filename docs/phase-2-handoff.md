# Passagem para a Fase 2

> Documento histórico da Fase 1. Seu status e restrições referem-se àquela entrega; a Fase 2 foi autorizada e executada. Resultados atuais em [validation.md](validation.md).

**Status: Fase 1 — Implementação concluída, ainda não testada ou validada.**

Esta página prepara trabalho posterior. Não representa registro de testes feitos ou autorização para iniciar validação na execução atual.

## Estado entregue

- Repositório TypeScript completo com Node 24 LTS, SDK oficial MCP 2.3.1, Zod 4.2.0 e lockfile.
- 21 ferramentas, integrações PAPI/AppSec/SIEM/TechDocs, transporte stdio e respostas estruturadas.
- Política de operações fechada, EdgeGrid, cancelamento, retry, paginação, limites, sanitização e erros.
- Documentação de pesquisa, APIs, arquitetura, ferramentas, configuração, segurança e integração.
- Dependências instaladas com `npm install --ignore-scripts --no-audit --no-fund`, sem hooks de instalação, testes ou builds.
- Sem credenciais reais provisionadas, sem configuração de cliente ativada, sem dist gerado e sem suíte de testes.
- Nenhum servidor inicializado, Inspector executado, linter/typecheck/build/test chamado, mock criado ou operação Akamai executada.

O ambiente de instalação relatou Node 22.22.0. Requisito de Node 24 permanece explícito em package.json/.nvmrc/startup. O agente seguinte precisa usar runtime correto e instalar dependências sob ele conforme procedimento corporativo. Instalação sem scripts não comprova disponibilidade operacional de executáveis dependentes de plataforma como esbuild/tsx.

## Informações necessárias

Solicitar ao responsável corporativo, através do canal seguro já usado pela organização:

1. Credenciais EdgeGrid do API client destinado à investigação, hostname e escopo de conta.
2. Acesso autorizado a grupos/contratos PAPI, propriedades e versões de referência.
3. Produtos AppSec existentes, configIds/policyIds, motores de proteção e redes disponíveis.
4. Confirmação de SIEM/coleta já habilitados, configIds corretos, hostname/credenciais SIEM e papel; esclarecer o nível READ-WRITE solicitado pela documentação.
5. Um incidente recente dentro da retenção SIEM, timestamps em UTC, hostname/path/IP/requestId e logs de origem se a pergunta envolver atribuição de 403.
6. Cliente MCP alvo, runtime Node 24, permissões locais e acesso HTTPS/proxy/TLS corporativo.

Não é necessário contratar hospedagem, API IA, banco ou busca. Falta de licença/permissão não deve ser contornada por endpoint alternativo arbitrário nem interpretada automaticamente como ausência do recurso.

## Trabalho a conduzir posteriormente

No início da Fase 2, o próximo agente deve ler este documento e a solicitação original, confirmar que essa fase foi autorizada e tratar cada item abaixo como **não verificado**:

- Compilação estrita e compatibilidade real entre Node, TypeScript, Zod e SDK MCP; scripts de build já preparados.
- Inicialização stdio e negociação MCP com cliente alvo; structuredContent/outputSchema e erros de schema.
- Signer EdgeGrid: timestamp, nonce, hash de corpo do POST de busca, query e canonicalização, confronto com SDK/protocolo oficial.
- Identificadores com prefixos PAPI, ambiguidade de contrato/grupo, properties sem ativação e distinção latest/produção/staging.
- Paginação remota de versões, listas locais e transição entre escopos; campos nextLink/totalSize atuais.
- Hostname bucket e associação ativa por rede; cobertura de busca para propriedades disponíveis no contrato.
- AppSec: shapes de políticas, ações, attack groups, custom rules globais/versionadas, match targets e rate limiting nos produtos reais.
- Export AppSec síncrono GET, disponibilidade contratual e volume de diffs; não substituir por job POST fora da política sem nova decisão de escopo.
- SIEM: NDJSON completo/incompleto, contexto final, facets base64/URL, limit aproximado, filtros locais, retenção, latência, offset expirado e mudança de conteúdo entre releituras.
- 403: correlação exata, ação final versus ação de regra, casos sem eventos/sem permissão e confirmação por logs de origem quando disponíveis.
- Retry-After, 429, 502/503/504, timeouts durante download/espera, cancelamento, concorrência, budgets e encerramento.
- Limites de bytes/complexidade, resposta excessiva e erros que preservem a segurança sem tratar truncamento como resposta completa.
- Mascaramento de credenciais/headers/options e dados livres; dados corporativos não podem vazar para logs.
- Índices llms.txt por produto/seção, conteúdo Markdown, ranking lexical, falhas parciais e paginação documental.
- Política de leitura: tentar somente em ambiente e condições autorizados verificar que operações fora da allowlist e URLs externas sejam recusadas, sem realizar mutações reais.

Testes apropriados e suas dependências devem ser escolhidos/criados na Fase 2. Não há cobertura presumida, fixtures ou CI preexistentes. Registre correções e resultados somente depois de efetivamente obtê-los, sem retroativamente tratar esta entrega como validada.

## Limitações que podem exigir decisão futura

Cobertura documental limita-se a três produtos e busca em catálogo. Não há motor de avaliação de rules nem expansão de includes/EdgeWorkers/Cloudlets. Não há retenção própria, coleta SIEM contínua, snapshot transacional ou logs de todas as requisições/origem. Busca por requestId/IP é local à página SIEM. Overview limita consolidação a cinco recursos por grupo. Histórico de ativação não é trilha completa de edição não ativada. Transporte com proxy explícito não foi implementado. Produtos ou capacidades ausentes no contrato permanecem indisponíveis.

Essas limitações são deliberadas e documentadas; não são substituídas por dados simulados ou endpoints presumidos. O objetivo posterior é validar o código entregue, corrigir defeitos observados e determinar condições operacionais dentro do escopo de leitura autorizado.
