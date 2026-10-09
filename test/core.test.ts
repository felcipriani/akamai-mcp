import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfiguration } from '../src/configuration/config.js';
import { signEdgeGrid } from '../src/infrastructure/edgegrid.js';
import { Redactor } from '../src/infrastructure/redaction.js';
import { permittedRequest } from '../src/domain/read-policy.js';
import type { Operation } from '../src/domain/read-policy.js';
import { compareJson, behaviorEvidence } from '../src/domain/rules.js';
import { jsonPointer, localPage } from '../src/domain/pagination.js';
import { nestedItems, parseJson } from '../src/domain/json.js';
import { normalizeEvent, parseEventStream, eventMatches } from '../src/domain/siem.js';
import * as schemas from '../src/mcp/schemas.js';
import vectors from './fixtures/edgegrid-vectors.json' with { type: 'json' };
import event from './fixtures/siem-official.json' with { type: 'json' };
import { code, configuration, context, fakeEnv } from './helpers.js';

for (const vector of vectors.tests) test(`EdgeGrid official: ${vector.testName}`, () => {
  const credentials = { host: new URL(vectors.base_url).host, clientToken: vectors.client_token, clientSecret: vectors.client_secret, accessToken: vectors.access_token };
  assert.ok(vector.request.method === 'GET' || vector.request.method === 'POST');
  assert.equal(signEdgeGrid(credentials, vector.request.method, new URL(vector.request.path, vectors.base_url), vector.request.data ?? '', { timestamp: vectors.timestamp, nonce: vectors.nonce }), vector.expectedAuthorization);
});
test('EdgeGrid renews nonce and authenticates query and body', () => {
  const creds = configuration.credentials;
  assert.ok(creds);
  const url = new URL('https://' + creds.host + '/search?q=a%20b');
  assert.notEqual(signEdgeGrid(creds, 'POST', url, '{}'), signEdgeGrid(creds, 'POST', url, '{}'));
  const instant = { timestamp: vectors.timestamp, nonce: vectors.nonce };
  assert.notEqual(signEdgeGrid(creds, 'POST', url, '{}', instant), signEdgeGrid(creds, 'POST', url, '{"hostname":"x"}', instant));
});
test('No credentials enables local MCP; partial or invalid credentials fail safely', () => {
  assert.equal(loadConfiguration({}).credentials, null);
  for (const env of [{ AKAMAI_HOST: fakeEnv.AKAMAI_HOST }, { ...fakeEnv, AKAMAI_CLIENT_SECRET: 'line\nbreak' }, { ...fakeEnv, AKAMAI_HOST: 'https://evil.test' }, { ...fakeEnv, AKAMAI_SIEM_CLIENT_TOKEN: 'partial' }]) assert.throws(() => loadConfiguration(env), code('CONFIGURATION_ERROR'));
  assert.throws(() => loadConfiguration({ ...fakeEnv, AKAMAI_MAX_RETRIES: '9' }), code('CONFIGURATION_ERROR'));
});
for (const value of ['https://example.com', '*.example.com', '-bad.example.com', 'example.com:443', '', 'a'.repeat(254), 'a'.repeat(64) + '.com']) test(`Hostname rejects ${value.slice(0, 35)}`, () => assert.equal(schemas.hostname.safeParse(value).success, false));
test('Hostname IDNA and defaults', () => {
  assert.equal(schemas.hostname.parse('BÜCHER.Example.'), 'xn--bcher-kva.example');
  assert.deepEqual(schemas.propertyFindSchema.parse({ hostname: 'EXAMPLE.COM' }), { hostname: 'example.com', offset: 0, limit: 50 });
});
for (const input of [{ propertyId: '../123' }, { propertyId: 'abc' }, { propertyId: 'prp_0' }, {}, { propertyId: 'prp_1', version: 0 }, { propertyId: 'prp_1', limit: 0 }, { propertyId: 'prp_1', limit: 501 }, { propertyId: 'prp_1', offset: -1 }, { propertyId: 'prp_1', url: 'https://evil.test' }]) test(`Property schema rejects ${JSON.stringify(input)}`, () => assert.equal(schemas.propertyCompareSchema.safeParse({ fromVersion: 1, toVersion: 2, ...input }).success, false));
for (const configId of [0, -1, 1.2, '123', Number.MAX_SAFE_INTEGER + 1]) test(`Configuration id rejects ${configId}`, () => assert.equal(schemas.securityActiveSchema.safeParse({ configId }).success, false));
for (const input of [{}, { from: 2, to: 1 }, { from: 1 }, { offset: 'token', from: 1, to: 2 }, { offset: 'space token' }, { from: 1, to: 2, configIds: [1, 1] }]) test(`SIEM query rejects ${JSON.stringify(input)}`, () => assert.equal(schemas.wafEventsSchema.safeParse({ configIds: [1], ...input }).success, false));
test('Change investigation rejects inverted ISO interval', () => assert.equal(schemas.configurationChangeSchema.safeParse({ security: { configId: 1, fromVersion: 1, toVersion: 2 }, fromTime: '2026-10-09T12:00:00Z', toTime: '2026-10-08T12:00:00Z' }).success, false));
test('Read policy blocks route injection, inherited names, administrative operations and query overrides', () => {
  for (const operation of ['activate', '__proto__', 'constructor', 'toString']) assert.throws(() => permittedRequest(operation as Operation, {}, {}), code('OPERATION_NOT_ALLOWED'));
  assert.throws(() => permittedRequest('property', { propertyId: '../1' }, {}), code('INVALID_INPUT'));
  assert.throws(() => permittedRequest('securityConfiguration', { configId: 0 }, {}), code('INVALID_INPUT'));
  assert.throws(() => permittedRequest('propertyRules', { propertyId: 'prp_1', version: 1 }, { validateRules: true }), code('OPERATION_NOT_ALLOWED'));
  assert.equal(permittedRequest('propertySearch', {}, {}, 'example.com').body, '{"hostname":"example.com"}');
  assert.equal(permittedRequest('securityExport', { configId: 1, version: 2 }, {}).method, 'GET');
});
test('Structural diff ignores object key order and preserves array order and escaped pointers', () => {
  assert.equal((compareJson({ a: 1, b: 2 }, { b: 2, a: 1 }, 0, 10, () => {}).pagination as { total: number }).total, 0);
  const diff = compareJson({ 'a/b': [1, 2], '~x': false }, { '~x': true, 'a/b': [2, 1] }, 1, 1, () => {});
  assert.deepEqual(diff.changes, [{ path: '/a~1b/1', kind: 'changed', before: 2, after: 1 }]);
  assert.equal((diff.pagination as { nextOffset: number }).nextOffset, 2);
});
test('Nested rules retain ancestral conditions', () => {
  const evidence = behaviorEvidence({ name: 'root', criteria: [], children: [{ name: 'path', criteria: [{ name: 'path', options: { values: ['/secure/*'] } }], behaviors: [{ name: 'origin', options: { hostname: 'origin.example.com' } }] }] }, ['origin'], () => {});
  assert.equal(evidence.length, 1);
  assert.equal((evidence[0] as { ancestorConditions: unknown[] }).ancestorConditions.length, 2);
});
test('Pointer and pagination protect prototype and enforce limits', () => {
  assert.equal(jsonPointer({ 'a/b': [7] }, '/a~1b/0'), 7);
  assert.throws(() => jsonPointer({}, '/__proto__'), code('INVALID_INPUT'));
  assert.throws(() => jsonPointer({}, '/bad~2escape'), code('INVALID_INPUT'));
  assert.throws(() => jsonPointer([7], '/01'), code('NOT_FOUND'));
  assert.deepEqual(localPage([1, 2, 3], { offset: 0, limit: 500 }, 2).items, [1, 2]);
  assert.throws(() => nestedItems({}, 'versions'), code('INVALID_RESPONSE'));
  assert.deepEqual(nestedItems({ versions: { items: [] } }, 'versions'), []);
});
test('Official SIEM fixture decodes rule facets and omits personal payloads', () => {
  const normalized = normalizeEvent(event);
  assert.equal((normalized.rules as { ruleId: string }[])[0]?.ruleId, '950002');
  assert.equal((normalized.rules as { action: string }[])[2]?.action, 'deny');
  assert.equal(normalized.appliedAction, 'alert');
  assert.ok(eventMatches(normalized, { hostname: 'www.hmapi.com', httpStatus: 200, ruleId: '950006' }));
  assert.equal(eventMatches(normalized, { action: 'deny' }), false);
  const serialized = JSON.stringify(normalized);
  for (const key of ['requestHeaders', 'responseHeaders', 'ruleData', 'ruleSelectors', 'username', 'query', 'apiKey']) assert.ok(!serialized.includes(key));
});
test('SIEM validates completion, malformed facets, totals and empty results', () => {
  const text = JSON.stringify(event) + '\n' + JSON.stringify({ offset: 'next', total: 1 });
  assert.equal(parseEventStream(text, () => {}).events.length, 1);
  assert.deepEqual(parseEventStream('{"offset":"next","total":0}\n', () => {}).events, []);
  for (const input of ['', JSON.stringify(event), text.replace('"total":1', '"total":2'), 'malformed\n{"offset":"next","total":1}']) assert.throws(() => parseEventStream(input, () => {}), code('INVALID_RESPONSE'));
  assert.throws(() => normalizeEvent({ ...event, attackData: { ...event.attackData, rules: '%ZZ' } }), code('INVALID_RESPONSE'));
});
test('Redaction covers values, field names, headers, overlapping secrets and EdgeGrid', () => {
  const redactor = new Redactor(configuration);
  const secret = fakeEnv.AKAMAI_CLIENT_SECRET;
  const value = redactor.json({ [secret]: secret, authorization: 'other', name: 'Set-Cookie', value: 'session=other', nested: { options: { customHeaderName: 'Authorization', customHeaderValue: 'Bearer unknown' } } });
  assert.ok(!JSON.stringify(value).includes(secret));
  assert.ok(!JSON.stringify(value).includes('Bearer unknown'));
  assert.ok(!JSON.stringify(value).includes('session=other'));
  assert.equal(redactor.text('EG1-HMAC-SHA256 client_token=other;signature=other'), '[REDACTED_EDGEGRID]');
  assert.deepEqual(parseJson('{"__proto__":{"polluted":true},"safe":1}'), { safe: 1 });
});
test('Budget and cancellation are deterministic', () => {
  const ctx = context({ maxRequestsPerTool: 1 }); ctx.consumeRequest();
  assert.throws(() => ctx.consumeRequest(), code('BUDGET_EXCEEDED'));
  const controller = new AbortController(); controller.abort();
  assert.throws(() => context({}, controller.signal).checkpoint(), code('CANCELLED'));
});
