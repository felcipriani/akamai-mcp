import assert from 'node:assert/strict';
import test from 'node:test';
import { PropertyDiscovery } from '../src/application/property-discovery.js';
import { PropertyInvestigation } from '../src/application/property-investigation.js';
import { OperationalInvestigation } from '../src/application/operational-investigation.js';
import { SecurityInvestigation } from '../src/application/security-investigation.js';
import { InvestigationError } from '../src/domain/errors.js';
import { asArray, asObject } from '../src/domain/json.js';
import type { JsonObject } from '../src/domain/json.js';
import { propertyDomainSearchSchema } from '../src/mcp/schemas.js';
import { FixtureReader, code, context, settings } from './helpers.js';

const search = { domain: 'example.com', scopeOffset: 0, maxScopes: 2, offset: 0, limit: 20 };
const ref = { propertyId: 'prp_1', contractId: 'ctr_1', groupId: 'grp_1' };
const hostname = { ...ref, hostname: 'api-external.example.com', environment: 'PRODUCTION' as const };
const explain = { ...hostname, path: '/', behaviorNames: ['caching'], offset: 0, limit: 50 };
const groups = { groups: { items: [1, 2, 3].map(id => ({ groupId: `grp_${id}`, groupName: `Group ${id}`, contractIds: ['ctr_1'] })) } };
function discovery(reader: FixtureReader, overrides = {}) {
  const limits = { ...settings, ...overrides };
  return new PropertyDiscovery(reader, new PropertyInvestigation(reader, limits), limits);
}
function operation(reader: FixtureReader) {
  return new OperationalInvestigation(new PropertyInvestigation(reader, settings), new SecurityInvestigation(reader, settings), settings);
}

test('Domain search filters literal DNS boundaries and names, preserves scope, and paginates batches', async () => {
  const reader = new FixtureReader(call => call.operation === 'propertyGroups' ? groups : { properties: { items: call.query.groupId === 'grp_1' ? [
    { propertyId: 'prp_1', propertyName: 'api.EXAMPLE.com_dsa' },
    { propertyId: 'prp_2', propertyName: 'badexample.com_dsa' },
    { propertyId: 'prp_3', propertyName: 'example.com.evil_dsa' },
    { propertyId: 'prp_4', propertyName: 'exampleXcom_dsa' },
  ] : [{ propertyId: 'prp_5', propertyName: 'example.com' }] } });
  const first = await discovery(reader).search({ ...search, maxScopes: 1 }, context());
  const data = asObject(first.evidence[0]?.data);
  assert.deepEqual(asArray(data.candidates).map(asObject).map(row => row.propertyId), ['prp_1']);
  const candidate = asObject(asArray(data.candidates)[0]);
  assert.equal(candidate.contractId, 'ctr_1'); assert.equal(candidate.groupId, 'grp_1');
  assert.equal(candidate.associationStatus, 'NOT_CHECKED');
  assert.deepEqual(first.evidence[0]?.pagination.nextCursor, { scopeOffset: 1, offset: 0 });
  assert.equal(asObject(data.coverage).inventoryComplete, false);
  const last = await discovery(reader).search({ ...search, scopeOffset: 2, maxScopes: 1 }, context());
  assert.equal(last.evidence[0]?.pagination.nextCursor, null);
  assert.equal(asObject(asObject(last.evidence[0]?.data).coverage).inventoryComplete, false);
  assert.ok(reader.calls.every(call => ['propertyGroups', 'properties'].includes(call.operation)));
});
test('Full-hostname search skips a similar property and finds the exact name in a later scope', async () => {
  const reader = new FixtureReader(call => call.operation === 'propertyGroups' ? groups : { properties: { items: [{
    propertyId: call.query.groupId === 'grp_3' ? 'prp_3' : 'prp_1',
    propertyName: call.query.groupId === 'grp_3' ? 'api-external.example.com_dsa' : 'api.example.com_dsa',
  }] } });
  const found = await discovery(reader).search({ ...search, domain: hostname.hostname, maxScopes: 3 }, context());
  assert.deepEqual(asArray(asObject(found.evidence[0]?.data).candidates).map(asObject).map(row => row.propertyId), ['prp_3']);
  assert.equal(reader.calls.filter(call => call.operation === 'propertyGroups').length, 1);
  assert.equal(asObject(asObject(found.evidence[0]?.data).coverage).inventoryComplete, true);
});
test('Candidate pages finish the current batch before advancing to the next scopes', async () => {
  const reader = new FixtureReader(call => call.operation === 'propertyGroups' ? groups : { properties: { items: [1, 2, 3].map(id => ({ propertyId: `prp_${id}`, propertyName: `${id}.example.com_dsa` })) } });
  const first = await discovery(reader).search({ ...search, maxScopes: 1, limit: 2 }, context());
  assert.deepEqual(first.evidence[0]?.pagination.nextCursor, { scopeOffset: 0, offset: 2 });
  const second = await discovery(reader).search({ ...search, maxScopes: 1, offset: 2, limit: 2 }, context());
  assert.deepEqual(second.evidence[0]?.pagination.nextCursor, { scopeOffset: 1, offset: 0 });
  assert.equal(asArray(asObject(second.evidence[0]?.data).candidates).length, 1);
});
test('Denied scopes preserve successful candidates and never claim complete inventory', async () => {
  const reader = new FixtureReader(call => call.operation === 'propertyGroups' ? groups : call.query.groupId === 'grp_2'
    ? new InvestigationError('PERMISSION_DENIED', 'Denied scope') : { properties: { items: [{ propertyId: 'prp_1', propertyName: 'example.com_dsa' }] } });
  const found = await discovery(reader).search({ ...search, maxScopes: 3 }, context());
  assert.equal(found.status, 'partial'); assert.equal(found.unavailable.length, 1);
  assert.equal(asArray(asObject(found.evidence[0]?.data).candidates).length, 2);
  assert.equal(asObject(asObject(found.evidence[0]?.data).coverage).inventoryComplete, false);
});
test('Search respects request budgets and can resume an interrupted scope', async () => {
  const reader = new FixtureReader(call => call.operation === 'propertyGroups' ? groups : { properties: { items: [] } });
  const bounded = await discovery(reader, { maxRequestsPerTool: 2 }).search({ ...search, maxScopes: 20 }, context());
  assert.equal(reader.calls.length, 2);
  assert.deepEqual(bounded.evidence[0]?.pagination.nextCursor, { scopeOffset: 1, offset: 0 });
  const interrupted = new FixtureReader(call => call.operation === 'propertyGroups' ? groups : new InvestigationError('BUDGET_EXCEEDED', 'Retry budget exhausted'));
  const partial = await discovery(interrupted).search(search, context());
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.evidence[0]?.pagination.nextCursor, { scopeOffset: 0, offset: 0 });
});
test('No name match is not proof that a hostname has no property; regex input is rejected', async () => {
  const reader = new FixtureReader(call => call.operation === 'propertyGroups' ? groups : { properties: { items: [{ propertyId: 'prp_1', propertyName: 'Custom storefront' }] } });
  const found = await discovery(reader).search({ ...search, maxScopes: 3 }, context());
  assert.equal(asObject(found.evidence[0]?.data).lookupStatus, 'NO_NAME_MATCH_IN_BATCH');
  assert.equal(asObject(found.evidence[0]?.data).nextAction, 'CHECK_HOSTNAMES_OF_DIFFERENTLY_NAMED_PROPERTIES');
  assert.equal(propertyDomainSearchSchema.safeParse({ domain: 'example.*' }).success, false);
  assert.equal(propertyDomainSearchSchema.safeParse({ domain: 'https://example.com' }).success, false);
  assert.equal(propertyDomainSearchSchema.parse({ domain: 'BÜCHER.Example.' }).domain, 'xn--bcher-kva.example');
});

function associationReader(hosts: JsonObject[], extra: JsonObject = {}) {
  return new FixtureReader(call => {
    if (call.operation === 'property') return { properties: { items: [{ ...ref, productionVersion: 2, stagingVersion: 3, latestVersion: 9 }] } };
    if (call.operation === 'propertyHostnames') return { hostnames: { items: hosts, ...extra } };
    if (call.operation === 'propertyRules') return { rules: { name: 'default', behaviors: [{ name: 'caching', options: { behavior: 'MAX_AGE', ttl: '7d' } }] } };
    return new Error('Unexpected API: CDN confirmation must not read AppSec');
  });
}
test('NOT_MATCHED discards a candidate and blocks cache reads without rescuing latest or staging', async () => {
  const reader = associationReader([]);
  const checked = await operation(reader).hostname({ ...hostname, properties: [ref], configIds: [], offset: 0, limit: 50 }, context());
  assert.equal(checked.inferences[0]?.associationStatus, 'NOT_MATCHED');
  assert.equal(checked.inferences[0]?.nextAction, 'CONTINUE_PROPERTY_INVENTORY');
  const cache = await new PropertyInvestigation(reader, settings).explain(explain, context());
  assert.equal(cache.inferences[0]?.associationStatus, 'NOT_MATCHED');
  assert.equal(cache.status, 'partial');
  assert.ok(reader.calls.every(call => ['property', 'propertyHostnames'].includes(call.operation)));
  assert.ok(reader.calls.filter(call => call.operation === 'propertyHostnames').every(call => call.query.network === 'PRODUCTION'));
});
test('Exact confirmed hostname uses its active version, including hostname buckets, in cache reads', async () => {
  const reader = associationReader([{ cnameFrom: 'API-EXTERNAL.EXAMPLE.COM.', productionVersion: 7 }]);
  const cache = await new PropertyInvestigation(reader, settings).explain(explain, context());
  assert.equal(cache.inferences[0]?.associationStatus, 'CONFIRMED');
  assert.equal(cache.inferences[0]?.version, 7);
  const reads = reader.calls.filter(call => call.operation === 'propertyRules');
  assert.equal(reads.length, 1); assert.equal(reads[0]?.parameters.version, 7);
  assert.equal(reader.calls.length, 3);
  await assert.rejects(new PropertyInvestigation(reader, settings).explain({ ...explain, version: 9 }, context()), code('INVALID_INPUT'));
});
test('Conventional hostname edge mapping confirms the production version from property metadata', async () => {
  const reader = associationReader([{ cnameFrom: hostname.hostname, productionEdgeHostnameId: 'ehn_123', productionCnameTo: 'api-external.example.com.edgekey.net' }]);
  const cache = await new PropertyInvestigation(reader, settings).explain(explain, context());
  assert.equal(cache.inferences[0]?.associationStatus, 'CONFIRMED');
  assert.equal(cache.inferences[0]?.version, 2);
  assert.equal(reader.calls.find(call => call.operation === 'propertyRules')?.parameters.version, 2);
  const staging = await new PropertyInvestigation(reader, settings).hostnameAssociation({ ...hostname, environment: 'STAGING' }, context());
  assert.equal(staging.inferences[0]?.associationStatus, 'UNKNOWN');
});
test('Incomplete hostname page, missing active version and denied API yield UNKNOWN, not NOT_MATCHED', async () => {
  for (const reader of [associationReader([], { nextLink: '/next' }), associationReader([{ cnameFrom: hostname.hostname }])]) {
    const checked = await operation(reader).hostname({ ...hostname, properties: [ref], configIds: [], offset: 0, limit: 50 }, context());
    assert.equal(checked.inferences[0]?.associationStatus, 'UNKNOWN');
    const cache = await new PropertyInvestigation(reader, settings).explain(explain, context());
    assert.ok(cache.evidence.every(item => item.operation !== 'propertyRules'));
  }
  const denied = new FixtureReader(() => new InvestigationError('PERMISSION_DENIED', 'Denied API'));
  const checked = await operation(denied).hostname({ ...hostname, properties: [ref], configIds: [], offset: 0, limit: 50 }, context());
  assert.equal(checked.inferences[0]?.associationStatus, 'UNKNOWN');
  assert.equal(asObject(checked.unavailable[0]?.error).code, 'PERMISSION_DENIED');
});
