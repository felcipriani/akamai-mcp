# Arquitetura

O servidor conecta um cliente MCP às APIs de leitura da Akamai. O cliente inicia o processo e troca mensagens JSON-RPC por stdio; o servidor autentica as consultas com EdgeGrid e devolve resultados estruturados.

```mermaid
flowchart LR
    C[Cliente MCP] -->|stdio| M[Ferramentas e schemas]
    M --> A[Investigações]
    A --> E[Política de leitura e EdgeGrid]
    A --> D[Documentação pública]
    E --> K[PAPI / AppSec]
    D --> T[Akamai TechDocs]
    A --> R[Evidências e interpretação]
    R --> S[Sanitização da resposta]
    S --> M
```

## Organização

| Diretório | Responsabilidade |
| --- | --- |
| `src/configuration` | Credenciais, opções de execução e metadados do pacote |
| `src/mcp` | Registro das ferramentas, schemas de entrada e contrato de saída |
| `src/application` | Consultas de properties, segurança, documentação e composição de investigações |
| `src/domain` | Operações permitidas, paginação, diferenças estruturais, regras, hostnames e erros |
| `src/infrastructure` | HTTP, assinatura EdgeGrid, acesso às APIs, documentação e sanitização |

`src/index.ts` valida a configuração e inicia o transporte. O registro MCP utiliza o SDK TypeScript e os schemas utilizam Zod. A versão anunciada pelo servidor é lida de `package.json`.

## Contrato de resposta

As ferramentas retornam o mesmo envelope em `structuredContent` e em texto JSON. O envelope inclui `schemaVersion`, `tool`, `timestamp`, `status`, `evidence`, `inferences`, `unavailable`, `limitations`, `errors` e `redaction`.

| Campo | Significado |
| --- | --- |
| `evidence` | Dados ligados à fonte, operação e recurso consultados, com contexto e paginação |
| `inferences` | Interpretações produzidas pelas regras da investigação, separadas dos dados da fonte |
| `unavailable` | Componentes que não puderam ser consultados e seus motivos |
| `limitations` | Restrições relevantes para interpretar o resultado |
| `errors` | Falhas gerais da operação |

`status` distingue `success`, `partial` e `error`. Uma consulta composta pode preservar evidências disponíveis e indicar as falhas em `unavailable`. `isError` acompanha `status=error`; entradas rejeitadas pelo SDK podem usar o erro padrão MCP.

A busca `search_properties_by_domain` combina leituras GET por grupos e properties com um filtro local dos nomes. Retorna somente candidatas, fontes, cobertura do lote e cursor de continuação, sem materializar todo o inventário no contexto do agente. O tamanho do lote respeita o orçamento configurado; erros de escopo preservam resultados disponíveis e deixam a cobertura parcial. A busca não utiliza o endpoint POST de pesquisa PAPI.

A confirmação CDN retorna em `inferences` uma classificação `hostname_association`: `CONFIRMED`, `NOT_MATCHED` ou `UNKNOWN`, acompanhada da próxima ação. A classificação usa o hostname exato e a versão ativa retornados por PAPI; para properties convencionais, combina o vínculo de edge hostname da rede com a versão ativa dos metadados. Uma versão informada na atribuição do hostname tem precedência. Dados insuficientes resultam em `UNKNOWN`; erros ficam em `unavailable`. `get_hostname_overview` só consulta segurança quando solicitado explicitamente. `explain_cdn_behavior` verifica o vínculo antes de ler regras; candidatas descartadas não geram evidências de cache para o hostname.

## Versões e regras

PAPI mantém `latestVersion`, `productionVersion` e `stagingVersion`. Application Security possui sua própria sequência de versões. O seletor padrão é produção; versões explícitas identificam o conteúdo consultado sem comprovar ativação.

As árvores de regras preservam hierarquia, critérios ancestrais e JSON Pointers. Comparações ordenam chaves de objetos e preservam a ordem dos arrays. São diferenças estruturais, sujeitas a mudanças entre as leituras. O servidor não avalia regras na borda nem expande includes, Advanced Metadata, EdgeWorkers ou Cloudlets.

## Consultas e ciclo de vida

A paginação é explícita. As ferramentas usam os parâmetros das APIs ou recortes em memória, conforme a fonte. URLs de continuação não são executadas diretamente.

O transporte controla tempo, tentativas, concorrência e volume de dados. Cada tentativa autenticada recebe uma nova assinatura. Cancelamento MCP e encerramento do processo interrompem requisições e esperas pendentes. Redirecionamentos são recusados.

Os resultados refletem o escopo e a disponibilidade das fontes no momento da consulta.
