# Fontes das fixtures

`edgegrid-vectors.json`: quatro vetores GET/POST sem headers adicionais publicados
pela Akamai, copiados do commit `713e7c91833f4deeb358b9ca37dd863fc9c0630a` de
[AkamaiOPEN-edgegrid-node](https://github.com/akamai/AkamaiOPEN-edgegrid-node/blob/713e7c91833f4deeb358b9ca37dd863fc9c0630a/test/test_data.json).
Licença Apache-2.0, copyright Akamai Technologies. Tokens são os exemplos públicos
do mantenedor. Nenhum vetor foi recalculado pela implementação testada.

`mcp-http.mjs`: transporte HTTP simulado apenas no processo filho dos testes.
O processo, SDK, handshake, registro, schemas, casos de uso e stdio são reais.
Esta fixture não é carregada pelos comandos operacionais ou por `src/index.ts`.
