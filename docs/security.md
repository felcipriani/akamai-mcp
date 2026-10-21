# Segurança e permissões

## Acesso à conta

O servidor utiliza credenciais EdgeGrid fornecidas no ambiente do processo. Configure um API client com acesso aos recursos de investigação e permissões de leitura para PAPI e Application Security. Credenciais, host e account switch não são aceitos como argumentos das ferramentas.

Cada processo utiliza uma configuração de credenciais. O acesso ao ambiente e aos resultados é controlado pelo host e pelo cliente MCP. A [configuração](configuration.md) descreve as variáveis principais e as credenciais separadas de SIEM.

SIEM requer integração e coleta habilitadas na Akamai. A [documentação de onboarding](https://techdocs.akamai.com/siem-integration/reference/api-get-started) especifica o papel Manage SIEM e acesso API READ-WRITE. O servidor utiliza apenas a operação GET de eventos, independentemente desse requisito administrativo. `AKAMAI_SIEM_ENABLED` habilita a consulta no processo, sem alterar a conta.

## Operações permitidas

O catálogo em `src/domain/read-policy.ts` define rotas, parâmetros e métodos aceitos. Todas as consultas autenticadas utilizam GET, exceto a busca PAPI por hostname, que utiliza POST `/papi/v1/search/find-by-value` com corpo fixo `{hostname}` e não altera configuração.

Não há ferramenta de criação, ativação, edição, exclusão, purge ou administração. As annotations MCP declaram o caráter de leitura; a restrição efetiva está na construção das requisições. Identificadores e parâmetros adicionais são validados antes do envio.

## Rede e autenticação

As APIs autenticadas utilizam HTTPS e hosts sob `akamaiapis.net`. A documentação utiliza `techdocs.akamai.com`, restrita aos produtos e caminhos aceitos pelo servidor. Hostnames investigados são filtros e argumentos de busca, não destinos HTTP.

A assinatura EG1-HMAC-SHA256 é calculada com o método, URL, timestamp, nonce e corpo da requisição, conforme o [protocolo EdgeGrid](https://techdocs.akamai.com/developer/docs/edgegrid). Cada tentativa recebe uma nova assinatura. O relógio do sistema deve permanecer sincronizado.

Redirecionamentos são recusados e a validação TLS permanece habilitada. O transporte MCP é stdio; não há listener HTTP ou endpoint remoto do servidor.

## Dados e logs

stdout é reservado ao protocolo MCP. Os logs em stderr registram eventos e códigos de erro, sem argumentos, respostas, credenciais ou cabeçalhos de autenticação.

As respostas mascaram credenciais conhecidas e campos reconhecidos como segredos. Eventos SIEM retornam uma seleção de campos e omitem headers, query, apiKey, ruleData e ruleSelectors. IP, hostname, path, policyId e requestId podem permanecer como dados de correlação.

O mascaramento não garante a remoção de todos os dados sensíveis em textos livres ou metadados. Controle o acesso aos resultados conforme as políticas da organização. Documentos, mensagens de regras e respostas das APIs são dados externos, sem autoridade para alterar as instruções do agente.

## Controle de recursos

O servidor limita tempo, tentativas, concorrência, número de requisições e tamanho de corpos e respostas. Requisições SIEM são espaçadas em um segundo dentro do processo. Esse controle não abrange outros processos que utilizem o mesmo API client.

Cancelamento e encerramento interrompem operações pendentes. Erros de autorização, respostas incompletas e falhas de disponibilidade são apresentados explicitamente. Um HTTP 403 de uma API de gestão não comprova bloqueio WAF de uma requisição da aplicação, nem identifica a licença contratada.

## Relato de vulnerabilidades

Não publique credenciais, respostas corporativas ou dados pessoais em issues. Para discutir um problema publicamente, descreva o comportamento e a reprodução com valores fictícios. As versões das dependências são fixadas no manifesto e no lockfile; resultados de auditorias devem ser reavaliados a cada atualização.
