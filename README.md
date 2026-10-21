# Akamai MCP Server

Servidor [Model Context Protocol](https://modelcontextprotocol.io/) para investigar configurações de CDN, políticas de segurança e eventos WAF da Akamai a partir de clientes e agentes compatíveis com MCP.

Oferece **21 ferramentas de leitura**, com autenticação EdgeGrid e transporte stdio. As consultas utilizam Property Manager API, Application Security API, SIEM Integration API e Akamai TechDocs.

## Capacidades

| Área | O que o servidor permite consultar |
| --- | --- |
| CDN e Property Manager | Properties por hostname, versões de produção e staging, árvores de regras, behaviors, diferenças entre versões e histórico de ativações |
| Application Security | Configurações, políticas, match targets, ações WAF, custom rules e políticas de rate limiting |
| Eventos WAF | Eventos SIEM por período ou cursor, filtros por requisição e correlação da ação final com regras de segurança |
| Investigação | Visão de um hostname, evidências de respostas HTTP 403 e comparação de mudanças de configuração |
| Documentação | Busca nos índices e leitura de páginas oficiais de Property Manager, Application Security e SIEM |

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

Sem credenciais, a conexão MCP e as ferramentas de documentação pública continuam disponíveis. Consultas SIEM exigem `AKAMAI_SIEM_ENABLED=true` e coleta habilitada na Akamai. Consulte a [referência de configuração](docs/configuration.md) para credenciais, escopo de conta e execução a partir do código-fonte.

## Exemplos de investigação

- Identificar a property de um hostname e consultar as versões ativas em produção e staging.
- Comparar duas versões da árvore de regras e localizar mudanças em origin, cache e headers.
- Consultar ações WAF e rate policies associadas a uma política de segurança.
- Correlacionar um request ID com eventos SIEM para verificar a ação final registrada.
- Reunir diferenças e ativações de configuração no período de um incidente.

## Resultados

As ferramentas retornam dados estruturados com a fonte consultada, o recurso, a paginação e o status da operação. O contrato separa `evidence`, `inferences`, `unavailable` e `errors`, permitindo distinguir o que foi observado das interpretações e lacunas da consulta.

Versões de CDN e segurança são independentes. Comparações são estruturais; o servidor não simula a execução das regras na borda. A investigação de HTTP 403 depende dos eventos disponíveis e não atribui automaticamente a resposta ao WAF ou à origem.

## Referência

- [Ferramentas e argumentos](docs/tools.md)
- [Configuração](docs/configuration.md)
- [Arquitetura e contrato de resposta](docs/architecture.md)
- [Segurança e permissões](docs/security.md)
- [APIs utilizadas](docs/apis.md)
- [Desenvolvimento e publicação](https://github.com/felcipriani/akamai-mcp/blob/main/CONTRIBUTING.md)

Projeto independente, sem afiliação com a Akamai. Licença [MIT](LICENSE).
