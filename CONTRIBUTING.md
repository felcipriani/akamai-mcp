# Desenvolvimento

Use Node.js 24 e as dependências fixadas no lockfile.

```sh
npm ci
npm run check
npm run smoke:package
```

`check` executa a verificação de tipos, lint, build e testes. A suíte utiliza fixtures, HTTP em loopback e sessões MCP por stdio, sem consultas à conta Akamai. As fontes dos dados de teste estão em [test/fixtures](test/fixtures/README.md).

`smoke:package` compila, gera um tarball temporário e o executa via `npx`, conferindo o conteúdo do pacote, a versão anunciada, os dois protocolos MCP suportados e as 18 ferramentas. Não repassa credenciais Akamai ao subprocesso. A instalação de dependências pode consultar o registro npm.

## Código-fonte

```sh
npm run build
npm run smoke:mcp
```

O build produz `dist/`. Para desenvolvimento com TypeScript, use `npm run dev`; para conexão por um cliente MCP, execute `node dist/index.js`. A [configuração](docs/configuration.md) descreve o ambiente e as credenciais.

`npm run smoke:akamai` é uma verificação opcional contra as APIs reais. Requer credenciais e permissões, faz consultas de leitura e pode retornar falhas de autorização ou disponibilidade. Não faz parte da suíte de testes.

## Publicação

A publicação é manual, pela conta npm autorizada para `akamai-mcp`. Não há workflow de publicação automática no repositório.

Escolha uma versão ainda não publicada e mantenha `package.json` e `package-lock.json` sincronizados. `npm version patch`, `minor` ou `major` atualiza ambos e também cria um commit e uma tag Git; esses comandos não publicam o pacote.

Após revisar as alterações e executar as verificações acima:

```sh
npm pack --dry-run
npm login
npm publish --access public --tag latest
```

O hook `prepack` compila antes do empacotamento. Confira a presença de `dist/index.js` e do campo `bin`, além da ausência de credenciais ou arquivos internos no pacote. O campo `files` do manifesto permite distribuir `dist/`, a documentação de referência e `.env.example`; npm inclui também o manifesto, README e licença.

Uma combinação de nome e versão já publicada não pode ser reutilizada. Envie commits e tags ao GitHub separadamente quando fizer parte da release.
