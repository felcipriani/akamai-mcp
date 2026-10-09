# Integração com clientes MCP

Instruções preparadas na Fase 1, **não executadas**. Adicionar este servidor a um cliente normalmente inicia o processo e já pertence à Fase 2. Não foi editada configuração real de nenhum cliente nesta entrega.

## Contrato de integração

O cliente deve oferecer transporte stdio e iniciar Node 24 com caminho absoluto. O servidor lê JSON-RPC no stdin, escreve mensagens MCP no stdout e logs mínimos no stderr. Não há URL MCP, porta, token HTTP, serviço cloud ou modelo de IA incluído.

As ferramentas usam o [SDK oficial TypeScript MCP v2](https://github.com/modelcontextprotocol/typescript-sdk), com schema de entrada/saída e `structuredContent`, acompanhado de texto JSON. [Cancelamento por ctx.mcpReq.signal](https://ts.sdk.modelcontextprotocol.io/v2/servers/logging-progress-cancellation) é propagado ao transporte. Compatibilidade de negociação com cada cliente real será atividade da Fase 2.

## Configuração de processo

Selecione Node 24 pelo mecanismo já disponível no ambiente. Use o caminho absoluto do binário ao configurar aplicações gráficas, pois o PATH delas pode diferir do terminal. Não execute o binário somente para confirmar versão durante a Fase 1.

Com a distribuição futura compilada e um `.env` local protegido, uma configuração de cliente que aceita `mcpServers` pode seguir este formato:

```json
{
  "mcpServers": {
    "akamai-investigation": {
      "command": "/CAMINHO/ABSOLUTO/DO/NODE24/bin/node",
      "args": [
        "--env-file=/Users/felcipriani/Desktop/akamai-mcp/.env",
        "/Users/felcipriani/Desktop/akamai-mcp/dist/index.js"
      ]
    }
  }
}
```

O formato `mcpServers` é uma convenção de clientes como os exemplificados nos [servidores oficiais Akamai](https://github.com/akamai-developers/akamai-cloud-mcp). Não é uma configuração universal imposta pelo protocolo; adapte o campo de comando/argumentos à documentação do cliente escolhido. Substitua o caminho do Node pelo caminho real. A build ainda não existe; gere-a apenas na Fase 2.

Para execução futura a partir de fonte, substitua os argumentos por:

```json
[
  "--env-file=/Users/felcipriani/Desktop/akamai-mcp/.env",
  "--import",
  "tsx",
  "/Users/felcipriani/Desktop/akamai-mcp/src/index.ts"
]
```

`--import tsx` resolve o pacote a partir do diretório de execução. Configure o diretório do processo como `/Users/felcipriani/Desktop/akamai-mcp` se o cliente permitir. Se ele não permitir, prefira a versão compilada com paths absolutos. Scripts npm usados por um cliente também requerem diretório de execução e podem adicionar saída de inicialização; o comando Node direto é a opção prevista para stdio.

Um mecanismo de ambiente secreto já existente pode injetar as variáveis em vez de utilizar `.env`. Neste caso, remova `--env-file`. Não coloque segredos em args, no código ou em configuração versionada. O objeto `env` do cliente, caso necessário, deve ficar em configuração local protegida.

## Escopo de conta

Cada processo utiliza um conjunto principal de credenciais, um account switch fixo opcional e um conjunto SIEM opcional. Para contas adicionais com credenciais distintas, cadastre processos separados no cliente. Não existe ferramenta de troca de credenciais/conta. SIEM precisa usar credenciais da conta de destino, pois não suporta accountSwitchKey.

Nenhuma ferramenta consulta automaticamente APIs ao conectar. A primeira chamada é iniciada pelo cliente após selecionar uma ferramenta. Documentos também são baixados somente sob demanda, sem warm-up de índice ou coleta contínua.

## Orientações para o cliente de investigação

Use o schema como contrato e prefira consultas pequenas. Para hostname, reúna candidatos, depois confirme rede e versão. Para políticas, descubra configId e policyId antes de pedir seções específicas. Para SIEM, informe configIds e um período recente explícito; procure requestId exato quando houver.

Leia `limitations`, `unavailable` e `pagination` junto com os dados. Nunca trate ausência de evento na primeira página como ausência de bloqueio. Compare `appliedAction` com status e requestId do mesmo evento. Não transforme uma regra com action=alert, ou uma configuração atual com ação deny, em prova de que uma requisição foi bloqueada no passado.

A configuração de cliente deve permitir prazo suficiente para AKAMAI_TOOL_TIMEOUT_MS, sem torná-lo ilimitado. Cancelamentos enviados pelo cliente interrompem I/O. BUSY pede menor concorrência; RATE_LIMITED pede espera/redução de frequência; RESPONSE_TOO_LARGE pede menos seções/resultados ou recorte. Problemas de proxy, TLS, papel e negociação precisam ser diagnosticados na próxima fase.
