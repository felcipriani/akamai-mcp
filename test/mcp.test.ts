import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';
import { fakeEnv } from './helpers.js';
import { asObject, toJson } from '../src/domain/json.js';

const root = fileURLToPath(new URL('../', import.meta.url));
async function connect(fixture: boolean, extra: Record<string, string> = {}, modern = false) {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [...(fixture ? ['--import', root + 'test/fixtures/mcp-http.mjs'] : []), root + 'dist/index.js'], cwd: root,
    env: { ...getDefaultEnvironment(), ...(fixture ? { ...fakeEnv, AKAMAI_SIEM_ENABLED: 'true' } : {}), ...extra }, stderr: 'pipe',
  });
  let logs = '';
  transport.stderr?.on('data', chunk => { logs += String(chunk); });
  const errors: Error[] = [];
  const client = new Client({ name: 'akamai-validation-client', version: '1.0.0' }, modern ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {});
  client.onerror = error => errors.push(error);
  await client.connect(transport);
  return { client, transport, errors, logs: () => logs };
}
test('Real stdio handshake/list/call/shutdown without Akamai credentials', async t => {
  const session = await connect(false); t.after(() => session.client.close());
  assert.equal(session.client.getServerVersion()?.name, 'akamai-mcp');
  assert.ok(session.client.getNegotiatedProtocolVersion());
  assert.ok(session.client.getServerCapabilities()?.tools);
  const list = await session.client.listTools(); assert.equal(list.tools.length, 21);
  const reply = await session.client.callTool({ name: 'get_active_property_version', arguments: { propertyId: 'prp_123' } });
  assert.equal(reply.isError, true);
  assert.equal(asObject(toJson(reply.structuredContent)).status, 'error');
  assert.ok(JSON.stringify(reply.structuredContent).includes('CONFIGURATION_ERROR'));
  assert.deepEqual(session.errors, []);
  const pid = session.transport.pid; assert.ok(pid);
  await session.client.close();
  assert.throws(() => process.kill(pid, 0));
  assert.ok(session.logs().includes('server_connected'));
});
test('Modern MCP 2026-07-28 negotiation supports discovery and calls', async t => {
  const session = await connect(false, {}, true); t.after(() => session.client.close());
  assert.equal(session.client.getNegotiatedProtocolVersion(), '2026-07-28');
  assert.equal(session.client.getProtocolEra(), 'modern');
  assert.equal((await session.client.listTools()).tools.length, 21);
  const reply = await session.client.callTool({ name: 'get_active_property_version', arguments: { propertyId: 'prp_123' } });
  assert.equal(reply.isError, true);
  assert.deepEqual(session.errors, []);
});
test('All 21 tools execute over real MCP stdio with controlled upstream fixtures', async t => {
  const session = await connect(true); t.after(() => session.client.close());
  const ref = { propertyId: 'prp_123' };
  const security = { configId: 14227, policyId: 'policy_1' };
  const waf = { configIds: [14227], offset: 'fixture-offset' };
  const calls: Record<string, Record<string, unknown>> = {
    list_properties: {}, find_property_by_hostname: { hostname: 'example.com' }, get_active_property_version: ref,
    list_property_versions: ref, get_property_configuration: ref,
    compare_property_versions: { ...ref, fromVersion: 1, toVersion: 2 }, get_property_activation_history: ref,
    explain_cdn_behavior: { ...ref, hostname: 'example.com', path: '/' }, get_hostname_overview: { hostname: 'example.com', configIds: [14227] },
    list_security_configurations: {}, get_active_security_configuration: { configId: 14227 }, list_security_configuration_versions: { configId: 14227 },
    get_security_policy: security, get_rate_limiting_configuration: security, get_security_activation_history: { configId: 14227 },
    get_waf_events: waf, investigate_waf_request: { ...waf, requestId: '1158db1758e37bfe67b7c09' },
    investigate_http_403: { ...waf, hostname: 'example.com', requestId: '1158db1758e37bfe67b7c09' },
    investigate_configuration_change: { property: { ...ref, fromVersion: 1, toVersion: 2 }, security: { configId: 14227, fromVersion: 10, toVersion: 11 } },
    search_akamai_documentation: { query: 'rules', product: 'property-mgr' }, get_akamai_documentation: { documentationId: 'property-mgr/reference/get-property-version-rules' },
  };
  const listed = await session.client.listTools();
  assert.deepEqual(listed.tools.map(tool => tool.name).sort(), Object.keys(calls).sort());
  for (const tool of listed.tools) await t.test(tool.name, async () => {
    assert.equal(tool.annotations?.readOnlyHint, true); assert.equal(tool.annotations?.destructiveHint, false);
    assert.ok(tool.outputSchema);
    const reply = await session.client.callTool({ name: tool.name, arguments: calls[tool.name] ?? {} });
    assert.equal(reply.isError, false, JSON.stringify(reply));
    assert.equal(asObject(toJson(reply.structuredContent)).schemaVersion, '1.0');
    assert.ok(['success', 'partial'].includes(String(asObject(toJson(reply.structuredContent)).status)));
    assert.equal(asObject(toJson(reply.structuredContent)).tool, tool.name);
    const first = reply.content[0]; assert.ok(first?.type === 'text');
    assert.deepEqual(JSON.parse(first.text), reply.structuredContent);
    assert.ok(!JSON.stringify(reply).includes('should-be-redacted'));
  });
  assert.deepEqual(session.errors, []);
  for (const secret of Object.values(fakeEnv).slice(1)) assert.ok(!session.logs().includes(secret));
  assert.ok(session.logs().trim().split('\n').every(line => typeof JSON.parse(line).event === 'string'));
});
test('MCP rejects invalid arguments and unknown tools, then remains responsive', async t => {
  const session = await connect(false); t.after(() => session.client.close());
  for (const request of [{ name: 'get_active_property_version', arguments: { propertyId: '../1' } }, { name: 'get_waf_events', arguments: { configIds: [0], from: 2, to: 1 } }, { name: 'purge_cache', arguments: {} }]) {
    let failed = false;
    try { const reply = await session.client.callTool(request); failed = reply.isError === true; } catch { failed = true; }
    assert.ok(failed);
  }
  assert.equal((await session.client.listTools()).tools.length, 21);
});
test('MCP bounds concurrent calls and response bytes', async t => {
  const session = await connect(true, { AKAMAI_MAX_CONCURRENT_TOOLS: '1', FIXTURE_DELAY_MS: '100', AKAMAI_MAX_TOOL_BYTES: '8192', FIXTURE_LARGE_DOC: 'true' });
  t.after(() => session.client.close());
  const first = session.client.callTool({ name: 'get_active_property_version', arguments: { propertyId: 'prp_123' } });
  const second = session.client.callTool({ name: 'get_active_property_version', arguments: { propertyId: 'prp_123' } });
  const replies = await Promise.all([first, second]);
  assert.ok(replies.some(reply => JSON.stringify(reply).includes('BUSY')));
  assert.ok(replies.some(reply => reply.isError === false));
  const large = await session.client.callTool({ name: 'get_akamai_documentation', arguments: { documentationId: 'property-mgr/reference/get-property', maxCharacters: 20000 } });
  assert.equal(large.isError, true);
  assert.ok(JSON.stringify(large).includes('RESPONSE_TOO_LARGE'));
  assert.ok(Buffer.byteLength(JSON.stringify(large)) <= 8192);
});
test('MCP cancellation reaches pending HTTP and frees concurrency budget', async t => {
  const session = await connect(true, { AKAMAI_MAX_CONCURRENT_TOOLS: '1', FIXTURE_DELAY_MS: '200' });
  t.after(() => session.client.close());
  const controller = new AbortController();
  const call = session.client.callTool({ name: 'get_active_property_version', arguments: { propertyId: 'prp_123' } }, { signal: controller.signal });
  setTimeout(() => controller.abort(), 40);
  await assert.rejects(call);
  // A tools/list roundtrip lets the preceding cancellation notification run.
  await session.client.listTools();
  const reply = await session.client.callTool({ name: 'get_active_property_version', arguments: { propertyId: 'prp_123' } });
  assert.equal(reply.isError, false);
  assert.ok(session.logs().includes('CANCELLED'));
});
