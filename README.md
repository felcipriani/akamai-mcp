# Akamai MCP Server

Servidor [Model Context Protocol](https://modelcontextprotocol.io/) para investigar configurações de CDN, políticas de segurança e configurações WAF da Akamai a partir de clientes e agentes compatíveis com MCP.

Oferece **18 ferramentas de leitura**, com autenticação EdgeGrid e transporte stdio. As consultas utilizam Property Manager API, Application Security API e Akamai TechDocs.

## Capacidades

| Área | O que o servidor permite consultar |
| --- | --- |
| CDN e Property Manager | Busca de candidatas por domínio nos nomes, inventário por contrato/grupo, confirmação de hostnames, versões de produção e staging, regras, behaviors, diferenças e ativações |
| Application Security | Configurações, políticas, match targets, ações WAF, custom rules e políticas de rate limiting |
| Investigação | Visão de um hostname e comparação de mudanças de configuração |
| Documentação | Busca nos índices e leitura de páginas oficiais de Property Manager e Application Security |

O servidor consulta recursos existentes. Não cria versões, ativa configurações, altera políticas ou executa purge.

## Configuração

Requer **Node.js 24** disponível no ambiente do cliente MCP.

```json
{
  "mcpServers": {
    "akamai": {
      "command": "npx",
      "args": ["-y", "--prefer-online", "akamai-mcp@latest"]
    }
  }
}
```

Forneça ao processo as variáveis `AKAMAI_HOST`, `AKAMAI_CLIENT_TOKEN`, `AKAMAI_CLIENT_SECRET` e `AKAMAI_ACCESS_TOKEN` pelo mecanismo de ambiente do cliente. O acesso aos recursos depende das permissões do API client na Akamai.

Sem credenciais, a conexão MCP e as ferramentas de documentação pública continuam disponíveis. Consulte a [referência de configuração](docs/configuration.md) para credenciais, escopo de conta e execução a partir do código-fonte.

## Exemplos de investigação

- Identificar a property de um hostname e consultar as versões ativas em produção e staging.
- Comparar duas versões da árvore de regras e localizar mudanças em origin, cache e headers.
- Consultar ações WAF e rate policies associadas a uma política de segurança.
- Reunir diferenças e ativações de configuração no período de um incidente.

Para identificar a property de um hostname, use `search_properties_by_domain` com o hostname completo. A ferramenta percorre grupos internamente e filtra nomes; confirme as candidatas com `get_hostname_overview`. O resultado distingue `CONFIRMED`, `NOT_MATCHED` e `UNKNOWN`. `explain_cdn_behavior` só lê regras após confirmar a associação no ambiente solicitado. A confirmação CDN consulta apenas PAPI por padrão; segurança exige opção explícita.

O [procedimento completo](docs/tools.md#identificar-a-property-de-um-hostname) também é enviado ao agente nas instruções MCP. Todas as consultas autenticadas utilizam GET.

## Resultados

As ferramentas retornam dados estruturados com a fonte consultada, o recurso, a paginação e o status da operação. O contrato separa `evidence`, `inferences`, `unavailable` e `errors`, permitindo distinguir o que foi observado das interpretações e lacunas da consulta.

Versões de CDN e segurança são independentes. Comparações são estruturais; o servidor não simula a execução das regras na borda.

## Referência

- [Ferramentas e argumentos](docs/tools.md)
- [Configuração](docs/configuration.md)
- [Arquitetura e contrato de resposta](docs/architecture.md)
- [Segurança e permissões](docs/security.md)
- [APIs utilizadas](docs/apis.md)
- [Desenvolvimento e publicação](https://github.com/felcipriani/akamai-mcp/blob/main/CONTRIBUTING.md)

Projeto independente, sem afiliação com a Akamai. Licença [MIT](LICENSE).
