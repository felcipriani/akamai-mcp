import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { BoundedHttpClient } from '../src/infrastructure/http.js';
import { AkamaiClient } from '../src/infrastructure/akamai-client.js';
import { PublicDocumentationSource } from '../src/infrastructure/documentation-source.js';
import { loadConfiguration } from '../src/configuration/config.js';
import { code, configuration, context, settings } from './helpers.js';

const url = new URL('https://akab-test.luna.akamaiapis.net/papi/v1/groups');
for (const [status, expected] of [[401, 'AUTHENTICATION_FAILED'], [403, 'PERMISSION_DENIED'], [404, 'NOT_FOUND'], [416, 'OFFSET_EXPIRED'], [428, 'FEATURE_AVAILABILITY_UNKNOWN'], [429, 'RATE_LIMITED'], [500, 'UPSTREAM_ERROR'], [502, 'UPSTREAM_ERROR'], [503, 'UPSTREAM_ERROR'], [504, 'UPSTREAM_ERROR'], [302, 'UPSTREAM_ERROR']] as const) test(`HTTP ${status} maps to ${expected}`, async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('{"title":"Problem","requestId":"test","detail":"private"}', { status }));
  await assert.rejects(new BoundedHttpClient({ ...settings, maxRetries: 0 }).request(url, 'GET', '', () => ({}), context(), 'PAPI', 'propertyGroups'), code(expected));
  assert.equal(fetch.mock.callCount(), 1);
});
test('Transient response retries with fresh signatures and honors Retry-After', async t => {
  let count = 0;
  const fetch = t.mock.method(globalThis, 'fetch', async () => ++count < 3 ? new Response('busy', { status: 503, headers: { 'retry-after': '0' } }) : new Response('{"groups":{"items":[]}}'));
  const reply = await new AkamaiClient(configuration).read('propertyGroups', {}, {}, context());
  assert.deepEqual(reply.data, { groups: { items: [] } });
  assert.equal(fetch.mock.callCount(), 3);
  const authorizations = fetch.mock.calls.map(call => new Headers(call.arguments[1]?.headers).get('Authorization'));
  assert.equal(new Set(authorizations).size, 3);
});
test('Retry-After exceeding cap does not retry or wait', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('busy', { status: 429, headers: { 'retry-after': '120' } }));
  await assert.rejects(new BoundedHttpClient(settings).request(url, 'GET', '', () => ({}), context(), 'SIEM', 'securityEvents'), code('RATE_LIMITED'));
  assert.equal(fetch.mock.callCount(), 1);
});
test('HTTP-date Retry-After exceeding cap is respected', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('busy', { status: 429, headers: { 'retry-after': new Date(Date.now() + 120000).toUTCString() } }));
  await assert.rejects(new BoundedHttpClient(settings).request(url, 'GET', '', () => ({}), context(), 'PAPI', 'propertyGroups'), code('RATE_LIMITED'));
  assert.equal(fetch.mock.callCount(), 1);
});
test('Retry exhaustion and network failure protect internal details', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('private DNS token'); });
  await assert.rejects(new BoundedHttpClient({ ...settings, maxRetries: 1, maxRetryDelayMs: 1 }).request(url, 'GET', '', () => ({}), context(), 'PAPI', 'propertyGroups'), error => code('NETWORK_ERROR')(error) && !JSON.stringify(error).includes('private DNS'));
  assert.equal(fetch.mock.callCount(), 2);
});
test('Body limit cancels oversized streams', async t => {
  let cancelled = false;
  t.mock.method(globalThis, 'fetch', async () => new Response(new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(65537)); }, cancel() { cancelled = true; },
  })));
  await assert.rejects(new BoundedHttpClient({ ...settings, maxResponseBytes: 65536 }).request(url, 'GET', '', () => ({}), context(), 'PAPI', 'propertyGroups'), code('RESPONSE_TOO_LARGE'));
  assert.ok(cancelled);
});
test('Malformed JSON does not masquerade as a success', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>bad</html>'));
  await assert.rejects(new AkamaiClient(configuration).read('propertyGroups', {}, {}, context()), code('INVALID_RESPONSE'));
});
test('Akamai URL, POST body and fixed PAPI headers match the closed contract', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  const client = new AkamaiClient({ ...configuration, settings: { ...settings, accountSwitchKey: 'account:1' } });
  await client.read('propertySearch', {}, {}, context(), 'example.com');
  await client.read('propertyRules', { propertyId: 'prp_123', version: 2 }, { contractId: 'ctr_1' }, context());
  await client.read('propertyVersionHostnames', { propertyId: 'prp_123', version: 2 }, {}, context());
  const first = fetch.mock.calls[0]?.arguments;
  assert.ok(first);
  assert.equal(first[1]?.body, '{"hostname":"example.com"}');
  assert.equal(first[1]?.method, 'POST');
  assert.equal(first[1]?.redirect, 'manual');
  assert.equal(new Headers(first[1]?.headers).get('PAPI-Use-Prefixes'), 'true');
  const second = new URL(String(fetch.mock.calls[1]?.arguments[0]));
  assert.equal(second.pathname, '/papi/v1/properties/prp_123/versions/2/rules');
  assert.equal(second.searchParams.get('validateRules'), 'false');
  assert.equal(second.searchParams.get('accountSwitchKey'), 'account:1');
  assert.equal(new URL(String(fetch.mock.calls[2]?.arguments[0])).searchParams.get('validateHostnames'), 'false');
});
test('Missing credentials and disabled/cross-account SIEM make zero requests', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  await assert.rejects(new AkamaiClient(loadConfiguration({})).read('propertyGroups', {}, {}, context()), code('CONFIGURATION_ERROR'));
  await assert.rejects(new AkamaiClient(configuration).read('securityEvents', { configIds: '1' }, { offset: 'next' }, context()), code('FEATURE_NOT_ENABLED'));
  await assert.rejects(new AkamaiClient({ ...configuration, settings: { ...settings, siemEnabled: true, accountSwitchKey: 'other' } }).read('securityEvents', { configIds: '1' }, { offset: 'next' }, context()), code('CONFIGURATION_ERROR'));
  assert.equal(fetch.mock.callCount(), 0);
});
test('SIEM encodes configIds and spaces retries/calls by one second', async t => {
  const times: number[] = [];
  const fetch = t.mock.method(globalThis, 'fetch', async () => { times.push(Date.now()); return new Response('{"total":0,"offset":"next"}'); });
  const client = new AkamaiClient({ ...configuration, settings: { ...settings, siemEnabled: true } });
  await Promise.all([client.read('securityEvents', { configIds: '1;2' }, { offset: 'next', limit: 5 }, context()), client.read('securityEvents', { configIds: '1;2' }, { offset: 'next', limit: 5 }, context())]);
  assert.ok((times[1] ?? 0) - (times[0] ?? 0) >= 990);
  assert.ok(String(fetch.mock.calls[0]?.arguments[0]).includes('/configs/1%3B2?'));
});
test('Documentation source rejects arbitrary URLs and redirects', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 302, headers: { location: 'https://evil.test' } }));
  const docs = new PublicDocumentationSource(settings);
  await assert.rejects(docs.page('https://evil.test', context()), code('OPERATION_NOT_ALLOWED'));
  await assert.rejects(docs.page('property-mgr/reference/get-property', context()), code('UPSTREAM_ERROR'));
  assert.equal(fetch.mock.callCount(), 1);
});
test('Real local HTTP transport covers body timeout and cancellation', async t => {
  const sockets = new Set<import('node:net').Socket>();
  const local = createServer((req, res) => {
    if (req.url === '/ok') { res.end('local transport'); return; }
    res.writeHead(200); res.write('partial');
  });
  local.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  local.listen(0, '127.0.0.1'); await once(local, 'listening');
  t.after(() => { for (const socket of sockets) socket.destroy(); local.close(); });
  const address = local.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  const http = new BoundedHttpClient({ ...settings, requestTimeoutMs: 100, maxRetries: 0 });
  assert.equal((await http.request(new URL(origin + '/ok'), 'GET', '', () => ({}), context(), 'local', 'test')).text, 'local transport');
  await assert.rejects(http.request(new URL(origin + '/slow'), 'GET', '', () => ({}), context(), 'local', 'test'), code('TIMEOUT'));
  const controller = new AbortController();
  const request = http.request(new URL(origin + '/slow'), 'GET', '', () => ({}), context({}, controller.signal), 'local', 'test');
  setTimeout(() => controller.abort(), 20);
  await assert.rejects(request, code('CANCELLED'));
});
