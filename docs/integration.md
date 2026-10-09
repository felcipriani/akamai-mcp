# Integração local via stdio

O servidor compilado foi executado por um **cliente MCP real**, o SDK TypeScript oficial gratuito `@modelcontextprotocol/client@2.3.1`. Não exige conta de IA, modelo, serviço HTTP ou hospedagem. A suíte verifica a negociação moderna 2026-07-28 e o handshake initialize compatível com clientes anteriores. Veja [validation.md](validation.md) para evidências e limites da homologação.

## Cliente de referência gratuito

```sh
npm ci
npm run build
npm run smoke:mcp
npm run smoke:mcp -- --modern
```

Os comandos iniciam Node 24, estabelecem a sessão, descobrem 21 ferramentas e encerram o processo. Funcionam sem credenciais e não consultam APIs Akamai. O código de referência está em `scripts/mcp-smoke.mjs` e usa o SDK oficial como cliente local. A suíte `test/mcp.test.ts` demonstra tools/call, schema de saída, erros, cancelamento e limites. Fontes HTTP dos testes são controladas por fixture; o comando operacional nunca carrega essa fixture.

Com rede disponível, `npm run smoke:mcp -- --documentation` executa também `get_akamai_documentation`, validada contra TechDocs real por stdio. Credenciais existentes são herdadas pelo processo, sem cópia para logs ou args.

## Registro em outro cliente

Use os caminhos absolutos do Node 24 e do projeto. Para um cliente que aceite o formato `mcpServers`, adapte esta referência à sua instalação:

```json
{
  "mcpServers": {
    "akamai-investigation": {
      "command": "/CAMINHO/DO/NODE24/bin/node",
      "args": [
        "--use-env-proxy",
        "--env-file=/CAMINHO/DO/PROJETO/.env",
        "/CAMINHO/DO/PROJETO/dist/index.js"
      ]
    }
  }
}
```

Remova `--env-file` quando usar variáveis injetadas ou apenas documentação pública. `mcpServers` é convenção de alguns clientes, não formato obrigatório do MCP. Essa referência não foi instalada em uma aplicação gráfica específica; a compatibilidade comprovada é com o SDK oficial. Use Node diretamente como subprocesso stdio para evitar banners de scripts npm no stdout do servidor.

Para desenvolver com fonte, na pasta do projeto:

```sh
node --use-env-proxy --env-file=.env --import tsx src/index.ts
```

Não há servidor HTTP ou URL de conexão. O cliente escreve JSON-RPC no stdin; stdout recebe exclusivamente MCP, enquanto stderr recebe logs mínimos. Nenhuma API é consultada ao conectar ou listar ferramentas. Credenciais parciais ou inválidas falham no startup com código sanitizado. Sem credenciais, ferramentas autenticadas retornam erro estruturado e as públicas continuam disponíveis.

## Rede, contas e operação

Node 24 aceita `--use-env-proxy` para HTTPS_PROXY/HTTP_PROXY/NO_PROXY. Preserve a CA corporativa e a verificação TLS. O smoke real utilizou o proxy do ambiente; não houve conexão direta ou alteração de política de rede.

Cada processo utiliza uma conta principal, accountSwitchKey opcional fixo e credenciais SIEM opcionais. Contas adicionais requerem processos separados. SIEM não admite accountSwitchKey; habilitar SIEM localmente não habilita coleta nem concede permissão na Akamai.

Use consultas pequenas e interprete limitações/paginação. BUSY pede menor concorrência; RATE_LIMITED pede espera; RESPONSE_TOO_LARGE pede menor escopo. Mantenha o timeout do cliente compatível com AKAMAI_TOOL_TIMEOUT_MS. Cancelar uma chamada libera o orçamento de concorrência e interrompe o I/O pendente.

O servidor e o cliente SDK de referência não introduzem cobrança. Um cliente terceiro pode cobrar por modelos ou assinaturas; isso não é dependência do MCP.
