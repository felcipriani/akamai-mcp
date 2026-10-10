# Publicação npm e releases

O pacote e o executável se chamam `akamai-mcp`. O manifesto permite publicação pública no registro npm e limita o pacote a `dist/`, documentação Markdown e `.env.example`; npm também inclui `package.json`, README e LICENSE. Código-fonte, testes, scripts, evidências históricas e credenciais locais ficam fora do pacote. As evidências históricas continuam disponíveis no [GitHub](https://github.com/felcipriani/akamai-mcp/tree/main/docs/evidence).

O script `prepack` compila antes de `npm pack` e `npm publish`. Usuários recebem JavaScript pronto e somente dependências de produção; não precisam de TypeScript ou tsx. O executável exige Node 24 e usa stdio. Nome e versão anunciados pelo MCP e pelo User-Agent são lidos do manifesto, acompanhando cada release.

## Estado do pacote e primeira publicação

A consulta ao registro público em 9 de outubro de 2026 confirmou `akamai-mcp@0.1.0`, com `latest` apontando para `0.1.0`. A versão `0.0.0-stage` também está registrada. A tentativa manual que falhou com E403/2FA foi superada pela publicação posterior: não é necessário repetir o bootstrap. Não reutilize nenhuma dessas versões. Confira novamente antes de lançar:

```sh
npm view akamai-mcp versions dist-tags --json --registry=https://registry.npmjs.org/
```

Se, para outro pacote/nome, o registro retornar realmente E404 e não houver pacote nas configurações npm, a sequência inicial é: validar a distribuição, publicar uma primeira versão real com login/2FA do mantenedor e então cadastrar o Trusted Publisher nas configurações do pacote existente. Falhas de rede, E403 e E401 não significam pacote ausente. Com Node 24 ativo:

```sh
npm ci
npm run check
npm run smoke:package
npm pack --dry-run
npm login
npm publish --access public --tag latest
```

Esse comando manual é somente para bootstrap de um pacote ainda não publicado; para uma prévia, use `--tag next`. `npm login` e a primeira publicação são passos do mantenedor, incluindo autenticação/2FA quando exigidas. Responda aos desafios no terminal/navegador local; não envie tokens, senhas ou códigos 2FA no chat e não crie um secret NPM_TOKEN. Não é necessário fornecer credenciais Akamai para publicar ou testar a distribuição.

## Publicação automática por tag

O workflow `.github/workflows/publish.yml` executa em GitHub Actions hospedado quando uma tag `v*` é enviada. Ele exige SemVer sem metadados de build, igualdade entre a tag e `package.json` e nome/versão iguais no manifesto e nas duas entradas raiz de `package-lock.json`. Usa Node 24 e npm 11.21.0 (Trusted Publishing exige npm >=11.5.1), sem cache de dependências na release. `npm ci` recusa dependências incompatíveis com o lockfile; `npm run check` verifica tipos/lint/testes e `npm run smoke:package` testa a distribuição via npx. Antes da publicação, verifica que essas etapas não alteraram os manifestos e consulta o registro para recusar uma versão existente. Falhas de rede ou respostas inesperadas também interrompem a publicação.

Versões estáveis recebem `--tag latest`; prévias como `0.2.0-rc.0` recebem `--tag next`. Assim, uma prévia nunca substitui `latest`. Publicações são serializadas pelo grupo de concorrência `npm-publish`, sem cancelar uma release em andamento. Todas as etapas precisam passar antes de executar `npm publish`.

O pacote já existe. Entre no [painel de configurações de akamai-mcp](https://www.npmjs.com/package/akamai-mcp/access) com uma conta mantenedora, localize Settings → Trusted publishing e confira ou cadastre o vínculo:

- Provider: GitHub Actions.
- Organization/user: `felcipriani`.
- Repository: `akamai-mcp`.
- Workflow filename: `publish.yml`.
- Environment: deixe em branco; o workflow não define um GitHub Environment.
- Allowed actions: habilite **Allow npm publish** (publicação direta). O comando utilizado é `npm publish --access public --tag latest` ou `--tag next`; somente permissão de `npm stage publish` não atende esse workflow. Não é necessária a permissão independente **Allow npm dist-tag**, pois o workflow não executa esse comando.

OIDC autentica o workflow com `id-token: write` e `contents: read`, sem secret NPM_TOKEN ou NODE_AUTH_TOKEN. O manifesto já aponta `repository.url` para `git+https://github.com/felcipriani/akamai-mcp.git`, em conformidade com o repositório autorizado. O npm gera provenance automaticamente ao publicar esse pacote público a partir do repositório público via OIDC.

Uma configuração nova precisa concluir a primeira publicação via esse vínculo em até dois dias; crie-a próximo da próxima release real e recrie-a se expirar. As configurações de identidade do vínculo são imutáveis: se provider, repositório, workflow ou environment estiverem errados, exclua o vínculo incorreto e crie o correto. Confira **Allow npm publish** antes de enviar a tag. O padrão atual para vínculos novos permite somente staged publishing, portanto a seleção explícita de publicação direta é necessária.

O ambiente desta preparação não tem sessão npm autenticada nem ferramenta de administração do painel npm. A existência do pacote foi verificada publicamente; o vínculo e suas permissões precisam ser conferidos/salvos pelo mantenedor com login/2FA. `npm whoami` não valida autorização OIDC, e dry-run não testa o vínculo: a confirmação completa ocorrerá na próxima release real.

## Próxima release

Integre as alterações do workflow e desta documentação em `main` antes de enviar qualquer tag. Partindo de `main` limpo e atualizado, com o Trusted Publisher configurado, publique a próxima versão estável (`0.1.1` se a versão atual ainda for `0.1.0`):

```sh
nvm install 24
nvm use 24
git switch main
git pull --ff-only origin main
test -z "$(git status --porcelain)"
npm ci
npm version patch --no-git-tag-version
npm run check
npm run smoke:package
npm publish --dry-run --ignore-scripts --access public --tag latest
git add package.json package-lock.json
git commit -m "chore: release $(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).version')"
RELEASE_TAG="v$(node -p 'JSON.parse(require("fs").readFileSync("package.json", "utf8")).version')"
git tag -a "$RELEASE_TAG" -m "$RELEASE_TAG"
git push origin main
git push origin "$RELEASE_TAG"
```

Execute os comandos em sequência e pare se algum falhar. `nvm` é uma opção de gerenciador; se não estiver instalado, selecione Node 24 pelo gerenciador local antes de continuar. Não use Node 26: o projeto exige `>=24 <25`.

Para iniciar a próxima prévia, substitua `npm version patch --no-git-tag-version` por `npm version preminor --preid=rc --no-git-tag-version` e use `--tag next` no dry-run. Para a prévia seguinte, use `npm version prerelease --preid=rc --no-git-tag-version`. A tag Git continua sendo `v` seguida da versão exata; o workflow escolhe `next` automaticamente.

Cada combinação nome/versão só pode ser publicada uma vez, mesmo depois de unpublish. Se uma tentativa falhar, confira o registro antes de repetir: se já houver essa versão, prepare outra. O workflow não publica a cada commit em main; o envio da tag é a decisão explícita de lançar uma versão. Não envie uma tag de teste para validar OIDC.

## Atualização dos clientes

```sh
npx -y --prefer-online akamai-mcp@latest
```

`-y` aceita a instalação sem interação. `--prefer-online` força a checagem de atualização dos metadados no registro, preservando os arquivos em cache. `@latest` seleciona a versão publicada nessa tag. Reinicie/reconecte o MCP no cliente para iniciar a nova versão. O npx não executa git pull nem substitui o código de um processo em execução. Use uma versão exata para manter a execução fixa ou voltar a uma versão publicada anterior.

Fontes: [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/), [manifesto npm](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/), [Trusted Publishers](https://docs.npmjs.com/trusted-publishers/), [npx](https://docs.npmjs.com/cli/v11/commands/npx/) e [prefer-online](https://docs.npmjs.com/cli/v11/using-npm/config/#prefer-online).
