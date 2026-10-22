import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/client/stdio';
import { fakeEnv } from './helpers.js';
import { asArray, asObject, toJson } from '../src/domain/json.js';

const root = fileURLToPath(new URL('../', import.meta.url));
async function connect(fixture: boolean, extra: Record<string, string> = {}, modern = false) {
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [...(fixture ? ['--import', root + 'test/fixtures/mcp-http.mjs'] : []), root + 'dist/index.js'], cwd: root,
    env: { ...getDefaultEnvironment(), ...(fixture ? fakeEnv : {}), ...extra }, stderr: 'pipe',
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
  assert.match(session.client.getInstructions() ?? '', /list_properties.*nextOffset.*nextScopeOffset/);
  assert.match(session.client.getInstructions() ?? '', /get_hostname_overview/);
  const list = await session.client.listTools(); assert.equal(list.tools.length, 18);
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
  assert.match(session.client.getInstructions() ?? '', /get_hostname_overview/);
  assert.equal((await session.client.listTools()).tools.length, 18);
  const reply = await session.client.callTool({ name: 'get_active_property_version', arguments: { propertyId: 'prp_123' } });
  assert.equal(reply.isError, true);
  assert.deepEqual(session.errors, []);
});
test('All 18 tools execute over real MCP stdio with controlled upstream fixtures', async t => {
  const session = await connect(true); t.after(() => session.client.close());
  const ref = { propertyId: 'prp_123' };
  const security = { configId: 14227, policyId: 'policy_1' };
  const calls: Record<string, Record<string, unknown>> = {
    search_properties_by_domain: { domain: 'example.com' }, list_properties: {}, get_active_property_version: ref,
    list_property_versions: ref, get_property_configuration: ref,
    compare_property_versions: { ...ref, fromVersion: 1, toVersion: 2 }, get_property_activation_history: ref,
    explain_cdn_behavior: { ...ref, hostname: 'example.com', path: '/' }, get_hostname_overview: { hostname: 'example.com', properties: [ref], configIds: [14227] },
    list_security_configurations: {}, get_active_security_configuration: { configId: 14227 }, list_security_configuration_versions: { configId: 14227 },
    get_security_policy: security, get_rate_limiting_configuration: security, get_security_activation_history: { configId: 14227 },
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
test('MCP inventory, hostname confirmation and active cache rules work using only GET', async t => {
  const session = await connect(true); t.after(() => session.client.close());
  const listing = await session.client.callTool({ name: 'list_properties', arguments: { scopeOffset: 0, offset: 0 } });
  assert.equal(listing.isError, false);
  const scope = asObject(asArray(asObject(toJson(listing.structuredContent)).evidence)[0]);
  const candidate = asObject(asArray(scope.data)[0]);
  const ref = { propertyId: candidate.propertyId, ...asObject(scope.resource) };
  // The inventory name differs from the hostname: only the association confirms it.
  assert.equal(candidate.propertyName, 'fixture');
  const overview = await session.client.callTool({ name: 'get_hostname_overview', arguments: { hostname: 'example.com', environment: 'PRODUCTION', properties: [ref], configIds: [14227] } });
  assert.equal(overview.isError, false);
  const evidence = asArray(asObject(toJson(overview.structuredContent)).evidence).map(asObject);
  const association = evidence.find(item => item.operation === 'propertyHostnames');
  assert.ok(association);
  assert.equal(asObject(association.resource).environment, 'PRODUCTION');
  const host = asObject(asArray(asObject(asObject(association.data).hostnames).items)[0]);
  assert.equal(host.cnameFrom, 'example.com');
  assert.equal(host.productionVersion, 2);
  const configuration = await session.client.callTool({ name: 'get_property_configuration', arguments: { ...ref, environment: 'PRODUCTION' } });
  assert.equal(configuration.isError, false);
  const rules = asArray(asObject(toJson(configuration.structuredContent)).evidence).map(asObject).find(item => item.operation === 'propertyRules');
  assert.ok(rules);
  assert.equal(asObject(rules.resource).version, 2);
  assert.ok(asArray(asObject(asObject(rules.data).rules).behaviors).map(asObject).some(item => item.name === 'caching'));
});
test('MCP domain discovery reaches a later group in one call, confirms CDN without AppSec, then reads cache', async t => {
  const session = await connect(true, { FIXTURE_DISCOVERY_SCENARIO: 'true', AKAMAI_MAX_TOOL_BYTES: '8192' });
  t.after(() => session.client.close());
  const search = await session.client.callTool({ name: 'search_properties_by_domain', arguments: { domain: 'api-external.example.com' } });
  assert.equal(search.isError, false);
  const searched = asObject(asArray(asObject(toJson(search.structuredContent)).evidence)[0]);
  const candidates = asArray(asObject(searched.data).candidates).map(asObject);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]?.propertyId, 'prp_123');
  assert.equal(candidates[0]?.groupId, 'grp_3');
  assert.equal(candidates[0]?.associationStatus, 'NOT_CHECKED');
  const ref = { propertyId: 'prp_123', contractId: 'ctr_1', groupId: 'grp_3' };
  const overview = await session.client.callTool({ name: 'get_hostname_overview', arguments: { hostname: 'api-external.example.com', properties: [ref] } });
  assert.equal(overview.isError, false);
  const checked = asObject(toJson(overview.structuredContent));
  assert.equal(asObject(asArray(checked.inferences)[0]).associationStatus, 'CONFIRMED');
  assert.ok(asArray(checked.evidence).map(asObject).every(item => item.api === 'PAPI'));
  const cache = await session.client.callTool({ name: 'explain_cdn_behavior', arguments: { ...ref, hostname: 'api-external.example.com', path: '/', behaviorNames: ['caching'] } });
  assert.equal(cache.isError, false);
  assert.ok(asArray(asObject(toJson(cache.structuredContent)).evidence).map(asObject).some(item => item.operation === 'propertyRules'));
});
test('MCP rejects the similar candidate and continues the search cursor before reading cache', async t => {
  const session = await connect(true, { FIXTURE_DISCOVERY_SCENARIO: 'true' });
  t.after(() => session.client.close());
  const query = { domain: 'example.com', maxScopes: 1 };
  const first = await session.client.callTool({ name: 'search_properties_by_domain', arguments: query });
  const firstPage = asObject(asArray(asObject(toJson(first.structuredContent)).evidence)[0]);
  const wrong = { propertyId: 'prp_111', contractId: 'ctr_1', groupId: 'grp_1' };
  const overview = await session.client.callTool({ name: 'get_hostname_overview', arguments: { hostname: 'api-external.example.com', properties: [wrong] } });
  assert.equal(asObject(asArray(asObject(toJson(overview.structuredContent)).inferences)[0]).associationStatus, 'NOT_MATCHED');
  const blocked = await session.client.callTool({ name: 'explain_cdn_behavior', arguments: { ...wrong, hostname: 'api-external.example.com', path: '/' } });
  assert.equal(asObject(asArray(asObject(toJson(blocked.structuredContent)).inferences)[0]).associationStatus, 'NOT_MATCHED');
  assert.ok(asArray(asObject(toJson(blocked.structuredContent)).evidence).map(asObject).every(item => item.operation !== 'propertyRules'));
  const next = await session.client.callTool({ name: 'search_properties_by_domain', arguments: { ...query, ...asObject(asObject(firstPage.pagination).nextCursor) } });
  const emptyPage = asObject(asArray(asObject(toJson(next.structuredContent)).evidence)[0]);
  const last = await session.client.callTool({ name: 'search_properties_by_domain', arguments: { ...query, ...asObject(asObject(emptyPage.pagination).nextCursor) } });
  const finalPage = asObject(asArray(asObject(toJson(last.structuredContent)).evidence)[0]);
  assert.equal(asObject(asArray(asObject(finalPage.data).candidates)[0]).propertyId, 'prp_123');
});
test('MCP rejects invalid arguments and unknown tools, then remains responsive', async t => {
  const session = await connect(false); t.after(() => session.client.close());
  for (const request of [
    { name: 'get_active_property_version', arguments: { propertyId: '../1' } },
    { name: 'get_active_security_configuration', arguments: { configId: 0 } },
    { name: 'purge_cache', arguments: {} },
    { name: 'find_property_by_hostname', arguments: { hostname: 'example.com' } },
    { name: 'get_hostname_overview', arguments: { hostname: 'example.com' } },
    { name: 'get_hostname_overview', arguments: { hostname: 'example.com', properties: Array.from({ length: 6 }, () => ({ propertyId: 'prp_123' })) } },
    { name: 'get_waf_events', arguments: { configIds: [14227], offset: 'fixture-offset' } },
    { name: 'investigate_waf_request', arguments: { configIds: [14227], offset: 'fixture-offset', requestId: 'request-1' } },
    { name: 'investigate_http_403', arguments: { configIds: [14227], offset: 'fixture-offset', hostname: 'example.com' } },
  ]) {
    let failed = false;
    try { const reply = await session.client.callTool(request); failed = reply.isError === true; } catch { failed = true; }
    assert.ok(failed);
  }
  assert.equal((await session.client.listTools()).tools.length, 18);
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
