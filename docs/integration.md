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
    "akamai-mcp": {
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

Remova `--env-file` quando usar variáveis injetadas ou apenas documentação pública. `mcpServers` é convenção de alguns clientes, não formato obrigatório do MCP. Essa referência não foi instalada em uma aplicação gráfica específica; a compatibilidade comprovada é com o SDK oficial. Use Node diretamente ou o executável via npx como subprocesso stdio; `npm start` pode imprimir banners no stdout do servidor.

Para desenvolver com fonte, na pasta do projeto:

```sh
node --use-env-proxy --env-file=.env --import tsx src/index.ts
```

Não há servidor HTTP ou URL de conexão. O cliente escreve JSON-RPC no stdin; stdout recebe exclusivamente MCP, enquanto stderr recebe logs mínimos. Nenhuma API é consultada ao conectar ou listar ferramentas. Credenciais parciais ou inválidas falham no startup com código sanitizado. Sem credenciais, ferramentas autenticadas retornam erro estruturado e as públicas continuam disponíveis.

## Kiro com npx

Após a primeira [publicação no npm](publishing.md), use esta configuração no Kiro IDE, em `.kiro/settings/mcp.json` para o workspace ou `~/.kiro/settings/mcp.json` para todos os workspaces:

```json
{
  "mcpServers": {
    "akamai-mcp": {
      "command": "npx",
      "args": ["-y", "--prefer-online", "akamai-mcp@latest"],
      "env": {
        "AKAMAI_HOST": "${AKAMAI_HOST}",
        "AKAMAI_CLIENT_TOKEN": "${AKAMAI_CLIENT_TOKEN}",
        "AKAMAI_CLIENT_SECRET": "${AKAMAI_CLIENT_SECRET}",
        "AKAMAI_ACCESS_TOKEN": "${AKAMAI_ACCESS_TOKEN}"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

As variáveis devem estar disponíveis ao processo do Kiro e aprovadas para expansão nas configurações dele. Para usar somente descoberta/documentação pública sem credenciais, omita o bloco `env` e não injete credenciais pelo ambiente. SIEM permanece desabilitado por padrão.

O PATH do cliente deve apontar para Node **24** e seu npm/npx. O shebang do executável usa `env node`; apontar apenas para um npx de outra instalação não garante Node 24. Aplicações gráficas podem não herdar o PATH configurado em shells/nvm. Para esse caso, configure o PATH do cliente ou use a alternativa local com o caminho absoluto de Node 24.

`-y` elimina a pergunta de instalação, que impediria uma sessão automática. `--prefer-online` solicita revalidação dos metadados no registro npm, sem desabilitar o cache dos arquivos. `@latest` seleciona a última versão dessa tag ao iniciar. Novas versões exigem publicação e reinício/reconexão do MCP; commits em `main` não atualizam um processo já aberto. Para execução com versão fixa, substitua por `akamai-mcp@0.1.0`.

Se a organização utiliza proxy para APIs Akamai, configure `NODE_USE_ENV_PROXY=1` e as variáveis HTTP_PROXY/HTTPS_PROXY/NO_PROXY pelo ambiente do servidor; preserve a CA corporativa existente. O acesso npm pode exigir a configuração própria de proxy/CA do npm.

O pacote é validado por `npm run smoke:package` com o cliente SDK e npx; a GUI do Kiro não foi testada. Fontes: [configuração oficial do Kiro](https://kiro.dev/docs/mcp/configuration/), [npx](https://docs.npmjs.com/cli/v11/commands/npx/) e [prefer-online](https://docs.npmjs.com/cli/v11/using-npm/config/#prefer-online).

## Rede, contas e operação

Node 24 aceita `--use-env-proxy` para HTTPS_PROXY/HTTP_PROXY/NO_PROXY. Preserve a CA corporativa e a verificação TLS. O smoke real utilizou o proxy do ambiente; não houve conexão direta ou alteração de política de rede.

Cada processo utiliza uma conta principal, accountSwitchKey opcional fixo e credenciais SIEM opcionais. Contas adicionais requerem processos separados. SIEM não admite accountSwitchKey; habilitar SIEM localmente não habilita coleta nem concede permissão na Akamai.

Use consultas pequenas e interprete limitações/paginação. BUSY pede menor concorrência; RATE_LIMITED pede espera; RESPONSE_TOO_LARGE pede menor escopo. Mantenha o timeout do cliente compatível com AKAMAI_TOOL_TIMEOUT_MS. Cancelar uma chamada libera o orçamento de concorrência e interrompe o I/O pendente.

O servidor e o cliente SDK de referência não introduzem cobrança. Um cliente terceiro pode cobrar por modelos ou assinaturas; isso não é dependência do MCP.
