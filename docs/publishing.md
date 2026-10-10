# Publicação npm e releases

O pacote e o executável se chamam `akamai-mcp`. O manifesto permite publicação pública no registro npm e limita o pacote a `dist/`, documentação Markdown e `.env.example`; npm também inclui `package.json`, README e LICENSE. Código-fonte, testes, scripts, evidências históricas e arquivos de credenciais ficam fora do pacote. As evidências históricas continuam disponíveis no [GitHub](https://github.com/felcipriani/akamai-mcp/tree/main/docs/evidence).

O script `prepack` compila antes de `npm pack` e `npm publish`. Usuários recebem JavaScript pronto e somente dependências de produção; não precisam de TypeScript ou tsx. O executável exige Node 24 e usa stdio. Nome e versão anunciados pelo MCP e pelo User-Agent são lidos do manifesto, acompanhando cada release.

## Primeira publicação

A consulta pública de 9 de outubro de 2026 retornou 404 para `akamai-mcp`. Isso não reserva o nome nem garante autorização futura. A conta npm que fará a publicação precisa poder criar o pacote; em caso de indisponibilidade, escolha outro nome ou um escopo controlado pela organização.

Com Node 24 ativo, na raiz do repositório:

```sh
npm ci
npm run check
npm run smoke:package
npm pack --dry-run
npm login
npm publish --access public
```

`npm login` e a primeira publicação são passos do mantenedor, incluindo autenticação/2FA quando exigidas. Preparar esses arquivos não publica o pacote. Nunca inclua tokens npm nem credenciais Akamai no repositório. Não é necessário fornecer credenciais Akamai para publicar ou testar a distribuição.

## Publicação automática por tag

O workflow `.github/workflows/publish.yml` executa em GitHub Actions hospedado quando uma tag `v*` é enviada. Ele exige versão estável e igualdade entre a tag e `package.json`, utiliza Node 24 e npm 11, instala pelo lockfile, verifica tipos/lint/testes, testa o pacote via npx e publica. Releases de prévia são recusadas por esse workflow para não substituir `latest` por uma versão de prévia.

Após a primeira publicação, nas configurações do pacote em npmjs.com, cadastre um Trusted Publisher:

- Provider: GitHub Actions.
- Organization/user: `felcipriani`.
- Repository: `akamai-mcp`.
- Workflow filename: `publish.yml`.
- Environment: deixe em branco; o workflow não define um GitHub Environment.
- Allowed actions: habilite publicação direta com `npm publish`; somente permissão de publicação staged não atende esse workflow.

OIDC autentica o workflow com `id-token: write`, sem secret NPM_TOKEN. O npm exige CLI 11.5.1 ou posterior. Atualmente, uma configuração nova precisa concluir a primeira publicação via esse vínculo em até dois dias; crie-a próximo da próxima release e refaça-a se expirar. Confira nomes e permissões no painel npm antes de enviar a tag.

Envie os ajustes ao GitHub antes de ativar a primeira tag. Quando a versão 0.1.0 já tiver sido publicada manualmente, a primeira release automática deve usar uma nova versão, por exemplo:

```sh
# Partindo de main limpo e atualizado, com as mudanças já revisadas/integradas:
npm version patch
git push origin main
git push origin v0.1.1
```

Use a tag efetivamente gerada por `npm version`; `v0.1.1` é o exemplo partindo de 0.1.0. Cada combinação nome/versão só pode ser publicada uma vez. O workflow não publica a cada commit em main; a tag é a decisão explícita de lançar uma versão.

## Atualização dos clientes

```sh
npx -y --prefer-online akamai-mcp@latest
```

`-y` aceita a instalação sem interação. `--prefer-online` força a checagem de atualização dos metadados no registro, preservando os arquivos em cache. `@latest` seleciona a versão publicada nessa tag. Reinicie/reconecte o MCP no cliente para iniciar a nova versão. O npx não executa git pull nem substitui o código de um processo em execução. Use uma versão exata para manter a execução fixa ou voltar a uma versão publicada anterior.

Fontes: [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/), [manifesto npm](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/), [Trusted Publishers](https://docs.npmjs.com/trusted-publishers/), [npx](https://docs.npmjs.com/cli/v11/commands/npx/) e [prefer-online](https://docs.npmjs.com/cli/v11/using-npm/config/#prefer-online).
