# Segurança e permissões

## Credenciais e EdgeGrid

Credenciais são obtidas somente no startup por variáveis de ambiente. Ausência completa permite documentação pública e sessão MCP; chamadas autenticadas falham antes da rede. Conjunto parcial ou inválido impede a inicialização. O processo não aceita credenciais, host de API, account switch, headers ou paths HTTP nas ferramentas. `.env` pode ser carregado externamente por `node --env-file`; `.env.example` não contém credenciais reais. `.edgerc` não é carregado pelo código. Se a organização já utiliza esse formato, o operador pode fornecer as mesmas quatro variáveis pelo mecanismo de secrets existente, sem copiar segredos para arquivos versionados.

O signer utiliza HMAC-SHA256 EG1, timestamp UTC, nonce UUID, esquema/host/path/query canônicos e hash SHA256 do corpo do único POST permitido. A chave de assinatura deriva do clientSecret e timestamp. A assinatura é renovada em cada tentativa. A URL assinada é exatamente a usada pelo transporte, incluindo query string. Não são assinados headers adicionais porque as operações implementadas não os exigem. Não há log de assinatura, Authorization ou chave derivada.

O protocolo e o limite de 128 KiB do corpo assinado constam da [documentação EdgeGrid](https://techdocs.akamai.com/developer/docs/edgegrid) e do [SDK oficial Node](https://github.com/akamai/AkamaiOPEN-edgegrid-node). O corpo de busca é pequeno e fechado. Manter o relógio do sistema sincronizado é requisito do mecanismo.

## Escopo de conta e acesso

Configure um API client dedicado e com menor privilégio possível: PAPI e Application Security em leitura, grupos e contratos de investigação. O MCP não altera o cadastro desse cliente. Segregação entre usuários depende de quais credenciais e resultados cada cliente MCP recebe; um processo não é um serviço multiusuário nem um mecanismo de autorização individual.

`AKAMAI_ACCOUNT_SWITCH_KEY` é definido pelo operador, nunca pelo agente. PAPI/AppSec podem utilizá-lo. SIEM não suporta esse parâmetro. Se ele estiver configurado, consultas SIEM exigem o conjunto completo de credenciais `AKAMAI_SIEM_*` da conta correta. Mesmo sem switch, é necessário verificar que configIds pertençam à conta acessada pelo cliente SIEM.

A [documentação de SIEM](https://techdocs.akamai.com/siem-integration/reference/api-get-started) solicita papel Manage SIEM, API habilitada com acesso READ-WRITE e coleta habilitada. Essa particularidade administrativa não muda a política GET-only do servidor para SIEM; conceder esse nível precisa seguir os controles internos. O servidor nunca habilita integração ou coleta. `AKAMAI_SIEM_ENABLED` habilita as consultas SIEM no servidor e seu valor não comprova habilitação remota, licença ou entrega de todos os eventos.

Não deduza licença a partir de 403/404. 403 é apresentado como permissão insuficiente; 404 como recurso indisponível no escopo, com disponibilidade contratual ainda desconhecida. 428 sinaliza pré-condição não satisfeita, sem atribuição contratual automática. Eventos, configurações e documentação não revelam necessariamente a licença vigente.

## Política explícita de operações

O catálogo fechado em `src/domain/read-policy.ts` constrói paths de rotas fixas e valida identificadores, nomes de query e parâmetros. A seleção usa Object.hasOwn para impedir nomes herdados do protótipo; configId/version devem ser positivos. JSON Pointer recusa campos de protótipo e escapes inválidos. Não se permite selecionar método ou URL arbitrária. Todas as operações são GET, exceto POST `/papi/v1/search/find-by-value`, com corpo formado internamente e exclusivo `{hostname}`. Esse POST é uma busca documentada e não modifica configuração.

O catálogo não contém POST de criação/export assíncrono/ativação, PUT, PATCH, DELETE, purge, exceções WAF, mudanças de rate limiting, IAM ou administração. Export AppSec utiliza o GET síncrono. Leituras rules e hostnames por versão fixam `validateRules=false` e `validateHostnames=false`. Annotations MCP não são a barreira de segurança; a construção de requisições é.

Há operações de leitura auxiliares autorizadas na infraestrutura que não são expostas diretamente como ferramentas, como metadados AppSec por versão e hostnames PAPI por versão. Elas não habilitam escape hatch HTTP.

## Destinos e rede

Host autenticado precisa ser hostname sob `akamaiapis.net`; apenas HTTPS na porta padrão, sem URL, userinfo, path, fragmento ou porta fornecidos pelo agente. Documentação utiliza somente `techdocs.akamai.com` e três produtos/seções/slug permitidos. URLs de resultados e problemas são referências, nunca executadas automaticamente.

Redirects são recusados. Isso evita mover credenciais para outro host e repetir a assinatura em destinos não autorizados. A verificação TLS nativa permanece habilitada. O processo não resolve hostnames investigados como destino de requisição; hostname/path do incidente são argumentos de busca e filtros, não URLs para download.

Não há listener de rede ou autenticação HTTP MCP nesta implementação. O cliente inicia processo stdio. Quem puder executar o processo com acesso ao ambiente pode acessar as credenciais; o controle do usuário/host e das configurações do cliente é indispensável.

## Dados, logs e sanitização

Logs de eventos e códigos mínimos vão para stderr. Nunca registram argumentos, respostas, cabeçalhos, URLs de consulta, secrets ou stack traces. stdout pertence exclusivamente ao SDK MCP.

A saída mascara valores das seis credenciais carregadas, campos com nomes de segredo, credenciais em nomes de campos e valores associados a headers sensíveis conhecidos. Eventos SIEM usam allowlist de campos: headers, query, apiKey, ruleData e ruleSelectors são omitidos antes de responder. Campos de correlação como IP, hostname, path, policyId e requestId permanecem porque são necessários à investigação. Mensagens de regras podem conter dados externos; resultados devem seguir os controles corporativos de informação e acesso.

Mascaramento por nomes não detecta todos os segredos possíveis em metadados avançados ou textos livres. Não há DLP externa ou garantia de sanitização universal. Diffs podem indicar que um segredo mudou sem revelar seu valor. URLs e documentos retornados são material externo não confiável, sem autoridade para mudar política, instruir execução ou solicitar secrets.

`.gitignore` exclui `.env*` (exceto exemplo), `.edgerc`, dependências, arquivos gerados, logs e configuração de cliente `.mcp.json`. Proteja também arquivos de cliente fora do repositório e permissões de `.env`, nunca publique sessões com dados corporativos sem autorização.

## Resiliência e abuso de recursos

Há limites de tempo, tentativas, resultados, complexidade de JSON/diff/árvore, bytes do corpo e da resposta MCP, requests e investigações concorrentes. Rate limiting usa Retry-After quando cabe no limite e backoff exponencial limitado com jitter nos retornos transitórios. Sem Retry-After, 429 usa backoff; o código não presume X-RateLimit-Reset no SIEM.

Cancelamento e encerramento interrompem HTTP e esperas. SIEM reserva slots de um segundo no processo compartilhado. Isso não limita chamadas de outros servidores/processos ao mesmo cliente Akamai. Erros de corpos parciais, truncados ou incompatíveis não resultam em eventos inventados ou cursores tratados como válidos.

## Dependências e evidências

As versões diretas estão fixadas e o lockfile foi reinstalado com npm ci. O inventário em [evidence/dependency-licenses.json](evidence/dependency-licenses.json) registra licenças permissivas dos 110 pacotes encontrados na instalação Linux. ESLint 10.12.0 e typescript-eslint 8.71.1 foram escolhidos após verificar metadados atuais; a versão ESLint 9 inicialmente avaliada estava depreciada e foi substituída. SDK Client e lint são dependências de desenvolvimento. Nenhuma dependência paga foi introduzida. A auditoria identifica vulnerabilidades conhecidas no instante da consulta, não garante ausência de outras falhas.
