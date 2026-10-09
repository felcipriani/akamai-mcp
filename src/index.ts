import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { loadConfiguration } from './configuration/config.js';
import { InvestigationError } from './domain/errors.js';
import { logEvent } from './infrastructure/redaction.js';
import { createServer } from './mcp/server.js';

async function main(): Promise<void> {
  if (Number(process.versions.node.split('.')[0]) !== 24) {
    throw new InvestigationError('CONFIGURATION_ERROR', 'Este projeto requer Node.js 24 LTS.');
  }
  const configuration = loadConfiguration();
  const shutdown = new AbortController();
  const server = createServer(configuration, shutdown.signal);
  server.server.onclose = () => shutdown.abort();
  const stop = (): void => {
    shutdown.abort();
    void server.close().catch(() => logEvent('shutdown_error'));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  await server.connect(new StdioServerTransport());
  logEvent('server_connected');
}

void main().catch(error => {
  logEvent('startup_failed', { code: error instanceof InvestigationError ? error.code : 'INTERNAL_ERROR' });
  process.exitCode = 1;
});
