import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const temporary = mkdtempSync(join(tmpdir(), 'akamai-package-'));
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, 'Execute this smoke with npm run smoke:package');
const npxCli = join(dirname(npmCli), 'npx-cli.js');
try {
  execFileSync(process.execPath, [npmCli, 'run', 'build'], { cwd: root, stdio: 'inherit' });
  const [packed] = JSON.parse(execFileSync(process.execPath,
    [npmCli, 'pack', '--ignore-scripts', '--json', '--pack-destination', temporary], { cwd: root, encoding: 'utf8' }));
  assert.equal(packed.name, 'akamai-mcp');
  assert.equal(packed.version, manifest.version);
  assert.ok(packed.files.some(file => file.path === 'dist/index.js'));
  assert.ok(packed.files.every(file => file.path.startsWith('dist/')
    || /^docs\/[^/]+\.md$/.test(file.path)
    || ['package.json', 'README.md', 'LICENSE', '.env.example'].includes(file.path)));
  assert.ok(readFileSync(join(root, 'dist/index.js'), 'utf8').startsWith('#!/usr/bin/env node\n'));
  for (const modern of [false, true]) {
    const client = new Client({ name: 'akamai-package-validation', version: '1.0.0' },
      modern ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {});
    const env = { ...getDefaultEnvironment() };
    // Preserve the caller's network and CA settings for the npm subprocess.
    for (const key of ['HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY', 'ALL_PROXY',
      'http_proxy', 'https_proxy', 'no_proxy', 'all_proxy', 'NODE_EXTRA_CA_CERTS',
      'SSL_CERT_FILE', 'SSL_CERT_DIR', 'npm_config_proxy', 'npm_config_https_proxy', 'npm_config_cafile']) {
      if (process.env[key]) env[key] = process.env[key];
    }
    // Use the caller's cache, but do not forward Akamai credentials to this smoke.
    const cache = process.env.npm_config_cache ?? process.env.NPM_CONFIG_CACHE;
    if (cache) env.npm_config_cache = cache;
    const transport = new StdioClientTransport({ command: process.execPath, cwd: temporary,
      args: [npxCli, '-y', '--ignore-scripts', `--package=${join(temporary, packed.filename)}`, 'akamai-mcp'],
      env, stderr: 'inherit' });
    try {
      await client.connect(transport);
      assert.deepEqual(client.getServerVersion(), { name: manifest.name, version: manifest.version });
      const list = await client.listTools();
      assert.equal(list.tools.length, 18);
      assert.ok(list.tools.some(tool => tool.name === 'search_properties_by_domain'));
      assert.ok(!list.tools.some(tool => tool.name === 'find_property_by_hostname'));
      assert.match(client.getInstructions() ?? '', /search_properties_by_domain/);
      const reply = await client.callTool({ name: 'get_active_property_version', arguments: { propertyId: 'prp_123' } });
      assert.equal(reply.isError, true);
      assert.ok(JSON.stringify(reply.structuredContent).includes('CONFIGURATION_ERROR'));
      console.log(JSON.stringify({ package: packed.id, protocol: client.getNegotiatedProtocolVersion(), tools: list.tools.length, status: 'passed' }));
    } finally {
      await client.close();
    }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
