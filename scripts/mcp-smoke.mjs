import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';

const client = new Client({ name: 'akamai-local-client', version: '1.0.0' },
  process.argv.includes('--modern') ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {});
const env = Object.fromEntries(Object.entries(process.env).filter((entry) => typeof entry[1] === 'string'));
const transport = new StdioClientTransport({ command: process.execPath,
  args: ['--use-env-proxy', fileURLToPath(new URL('../dist/index.js', import.meta.url))], env, stderr: 'inherit' });
try {
  await client.connect(transport);
  const list = await client.listTools();
  console.log(JSON.stringify({ server: client.getServerVersion(), protocolVersion: client.getNegotiatedProtocolVersion(),
    toolCount: list.tools.length, tools: list.tools.map(tool => tool.name) }, null, 2));
  if (process.argv.includes('--documentation')) {
    const reply = await client.callTool({ name: 'get_akamai_documentation', arguments: { documentationId: 'property-mgr/reference/get-property-version-rules', maxCharacters: 1000 } });
    console.log(JSON.stringify({ documentationCall: reply.isError ? 'error' : 'success', structuredContent: typeof reply.structuredContent === 'object' }));
    if (reply.isError) process.exitCode = 1;
  }
} catch {
  console.error('MCP smoke failed; inspect sanitized server logs.'); process.exitCode = 1;
} finally { await client.close(); }
