# Fontes das fixtures

`edgegrid-vectors.json`: quatro vetores GET/POST sem headers adicionais publicados
pela Akamai, copiados do commit `713e7c91833f4deeb358b9ca37dd863fc9c0630a` de
[AkamaiOPEN-edgegrid-node](https://github.com/akamai/AkamaiOPEN-edgegrid-node/blob/713e7c91833f4deeb358b9ca37dd863fc9c0630a/test/test_data.json).
Licença Apache-2.0, copyright Akamai Technologies. Tokens são os exemplos públicos
do mantenedor. Nenhum vetor foi recalculado pela implementação testada.

`siem-official.json`: exemplo público de
[SIEM v1](https://github.com/akamai/akamai-apis/blob/4521f29ef4e3dba15bbd5617365ff65d00af5049/apis/siem/v1/examples/siem-event-200.json).
Valores e payloads são exemplos publicados, sem dados da conta corporativa.

`mcp-http.mjs`: transporte HTTP simulado apenas no processo filho dos testes.
O processo, SDK, handshake, registro, schemas, casos de uso e stdio são reais.
Esta fixture não é carregada pelos comandos operacionais ou por `src/index.ts`.
