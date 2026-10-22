# Configuração

O servidor é um subprocesso MCP sobre stdio e requer Node.js 24. O executável do pacote é `akamai-mcp`; o cliente deve disponibilizar Node e npm no `PATH` do processo.

## Credenciais

| Variável | Conteúdo |
| --- | --- |
| `AKAMAI_HOST` | Host do API client, por exemplo `akab-seu-cliente.luna.akamaiapis.net`, sem protocolo, porta ou caminho |
| `AKAMAI_CLIENT_TOKEN` | Client token EdgeGrid |
| `AKAMAI_CLIENT_SECRET` | Client secret EdgeGrid |
| `AKAMAI_ACCESS_TOKEN` | Access token EdgeGrid |

Configure as quatro variáveis no ambiente do servidor. Um conjunto parcial ou inválido impede a inicialização. A ausência completa permite conectar e consultar documentação pública; ferramentas autenticadas retornam `CONFIGURATION_ERROR`.

O servidor não carrega `.env` ou `.edgerc` automaticamente. Para executar a partir do repositório, compile com `npm run build` e use o Node para carregar um arquivo de ambiente protegido:

```sh
node --env-file=.env dist/index.js
```

Use [.env.example](../.env.example) como referência e mantenha credenciais fora do controle de versão.

## Escopo de conta

`AKAMAI_ACCOUNT_SWITCH_KEY` fixa a conta consultada pelas APIs PAPI e Application Security. O agente não pode alterar esse valor por uma ferramenta.

## Ambiente de execução

Em clientes gráficos, o ambiente pode diferir do terminal. Se necessário, configure o caminho absoluto de `npx` e inclua o diretório do Node 24 no `PATH`. Definir apenas o caminho de `npx` não determina qual Node o executável encontrará.

Para APIs atrás de proxy, habilite `NODE_USE_ENV_PROXY=1` ou execute Node com `--use-env-proxy`, fornecendo `HTTP_PROXY`, `HTTPS_PROXY` e `NO_PROXY` conforme a rede. Preserve a validação TLS e a CA da organização. O acesso ao registro npm utiliza a configuração de rede do próprio npm.

Timeouts, concorrência e tamanho das respostas são configuráveis por variáveis `AKAMAI_*`. Os nomes e valores estão em [.env.example](../.env.example), e a validação aceita pelo servidor está em [config.ts](https://github.com/felcipriani/akamai-mcp/blob/main/src/configuration/config.ts).
