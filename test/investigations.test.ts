import assert from 'node:assert/strict';
import test from 'node:test';
import { PropertyInvestigation } from '../src/application/property-investigation.js';
import { SecurityInvestigation } from '../src/application/security-investigation.js';
import { OperationalInvestigation } from '../src/application/operational-investigation.js';
import { DocumentationInvestigation } from '../src/application/documentation-investigation.js';
import { InvestigationError } from '../src/domain/errors.js';
import { asObject } from '../src/domain/json.js';
import { FixtureReader, code, context, settings } from './helpers.js';

const page = { offset: 0, limit: 50 };
const property = { propertyId: 'prp_123', environment: 'PRODUCTION' as const };
function operational(reader: FixtureReader): OperationalInvestigation { return new OperationalInvestigation(new PropertyInvestigation(reader, settings), new SecurityInvestigation(reader, settings), settings); }

test('Property production, staging and latest remain distinct; absent active has no fallback', async () => {
  const reader = new FixtureReader(() => ({ properties: { items: [{ propertyId: 'prp_123', productionVersion: 2, stagingVersion: 3, latestVersion: 8 }] } }));
  const properties = new PropertyInvestigation(reader, settings);
  for (const [environment, expected] of [['PRODUCTION', 2], ['STAGING', 3], ['LATEST', 8]] as const) assert.equal((await properties.resolveVersion({ ...property, environment }, context())).version, expected);
  assert.equal((await properties.resolveVersion({ ...property, version: 1 }, context())).version, 1);
  const absent = new PropertyInvestigation(new FixtureReader(() => ({ properties: { items: [{ latestVersion: 8 }] } })), settings);
  await assert.rejects(absent.resolveVersion(property, context()), code('NOT_FOUND'));
});
test('Property inventory preserves pagination within and across scopes', async () => {
  const reader = new FixtureReader(call => call.operation === 'propertyGroups' ? { groups: { items: [{ groupId: 'grp_1', contractIds: ['ctr_1', 'ctr_2'] }] } } : call.operation === 'properties' ? { properties: { items: [{ propertyId: 'prp_1' }, { propertyId: 'prp_2' }] } } : { versions: { items: [{ propertyId: 'prp_1' }, { propertyId: 'prp_2' }] } });
  const properties = new PropertyInvestigation(reader, settings);
  const listing = await properties.list({ offset: 0, limit: 1, scopeOffset: 0 }, context());
  assert.equal(listing.evidence[0]?.pagination.nextOffset, 1);
  assert.equal(listing.evidence[0]?.pagination.nextScopeOffset, 1);
  const nextPage = await properties.list({ offset: 1, limit: 1, scopeOffset: 0 }, context());
  assert.equal(nextPage.evidence[0]?.pagination.nextOffset, null);
  assert.equal(nextPage.evidence[0]?.pagination.nextScopeOffset, 1);
  const nextScope = await properties.list({ offset: 0, limit: 1, scopeOffset: 1 }, context());
  assert.equal(nextScope.evidence[0]?.resource.contractId, 'ctr_2');
  assert.equal(nextScope.evidence[0]?.pagination.nextScopeOffset, null);
  await assert.rejects(properties.list({ ...page, scopeOffset: 0, contractId: 'ctr_1' }, context()), code('INVALID_INPUT'));
});
test('Missing PAPI arrays are rejected rather than reported as no properties', async () => {
  const properties = new PropertyInvestigation(new FixtureReader(() => ({})), settings);
  await assert.rejects(properties.list({ ...page, scopeOffset: 0 }, context()), code('INVALID_RESPONSE'));
  await assert.rejects(properties.activations({ ...property, ...page }, context()), code('INVALID_RESPONSE'));
});
test('Security versions are independent of property versions and independent sections survive policy discovery', async () => {
  const reader = new FixtureReader(call => call.operation === 'securityConfiguration' ? { productionVersion: 10, stagingVersion: 11, latestVersion: 12 } : call.operation === 'securityPolicies' ? { policies: [{ policyId: 'policy_1' }] } : call.operation === 'securityMatchTargets' ? { matchTargets: [{ hostnames: ['example.com'], securityPolicy: { policyId: 'policy_1' } }] } : { hostnameList: ['example.com'] });
  const security = new SecurityInvestigation(reader, settings);
  const result = await security.policy({ configId: 1, environment: 'PRODUCTION', sections: ['policy', 'waf_rules', 'match_targets', 'selected_hostnames'], ...page }, context());
  assert.equal(result.status, 'partial');
  assert.equal(result.unavailable.length, 2);
  assert.equal(reader.calls.filter(call => call.operation === 'securityPolicies').length, 1);
  assert.ok(result.evidence.some(item => item.operation === 'securityMatchTargets'));
  assert.ok(reader.calls.filter(call => call.operation !== 'securityConfiguration').every(call => call.parameters.version === 10));
});
test('AppSec partial permissions preserve successful sections and rate policy actions', async () => {
  const reader = new FixtureReader(call => call.operation === 'securityConfiguration' ? { productionVersion: 10 } : call.operation === 'securityRules' ? new InvestigationError('PERMISSION_DENIED', 'No access', { api: 'Application Security' }) : call.operation === 'securityPolicy' ? { policyId: 'policy_1' } : call.operation === 'securityRatePolicies' ? { ratePolicies: [{ id: 1 }] } : { ratePolicyActions: [{ id: 1, action: 'deny' }] });
  const security = new SecurityInvestigation(reader, settings);
  const result = await security.policy({ configId: 1, policyId: 'policy_1', environment: 'PRODUCTION', sections: ['policy', 'waf_rules'], ...page }, context());
  assert.equal(result.status, 'partial'); assert.equal(result.evidence.length, 2);
  assert.equal(asObject(result.unavailable[0]?.error).code, 'PERMISSION_DENIED');
  assert.equal((await security.rateLimiting({ configId: 1, policyId: 'policy_1', environment: 'PRODUCTION', ...page }, context())).evidence.length, 3);
});
test('AppSec missing activation history is an error', async () => {
  await assert.rejects(new SecurityInvestigation(new FixtureReader(() => ({})), settings).activations({ configId: 1, ...page }, context()), code('INVALID_RESPONSE'));
});
test('Scenario C: activation in window and config diff do not establish causality', async () => {
  const reader = new FixtureReader(call => call.operation === 'propertyRules' ? { rules: { behaviors: [{ name: 'caching', options: { ttl: call.parameters.version === 1 ? 30 : 60 } }] } } : { activations: { items: [{ propertyVersion: 2, network: 'PRODUCTION', status: 'ACTIVE', submitDate: '2026-10-09T12:01:00Z' }] } });
  const result = await operational(reader).configurationChange({ property: { propertyId: 'prp_123', fromVersion: 1, toVersion: 2, subtreePointer: '' }, fromTime: '2026-10-09T12:00:00Z', toTime: '2026-10-09T12:02:00Z', ...page }, context());
  assert.equal(result.evidence.length, 2);
  assert.equal(asObject(result.evidence[0]?.data).comparison, 'structural_json');
  assert.ok(result.limitations.some(text => text.includes('sem determinar causa')));
});
test('Scenario D: management API 403 keeps other sources and does not imply application blockage', async () => {
  const reader = new FixtureReader(call => call.operation === 'property' ? { properties: { items: [{ propertyId: String(call.parameters.propertyId), productionVersion: 2 }] } } : call.operation === 'propertyHostnames' ? { hostnames: { items: [] } } : new InvestigationError('PERMISSION_DENIED', 'No AppSec permission'));
  const result = await operational(reader).hostname({ hostname: 'example.com', environment: 'PRODUCTION', properties: [{ propertyId: 'prp_1' }, { propertyId: 'prp_2' }], configIds: [1], ...page }, context());
  assert.equal(result.status, 'partial'); assert.equal(result.evidence.length, 4);
  assert.equal(asObject(result.unavailable[0]?.error).code, 'PERMISSION_DENIED');
});
test('Hostname overview verifies only supplied property references and the requested network', async () => {
  const reader = new FixtureReader(call => {
    if (call.operation === 'property') return { properties: { items: [{ propertyId: String(call.parameters.propertyId), productionVersion: 2, stagingVersion: 3 }] } };
    if (call.operation === 'propertyHostnames') return { hostnames: { items: [] } };
    return new InvestigationError('PERMISSION_DENIED', 'No AppSec permission');
  });
  const ref = { propertyId: 'prp_1', contractId: 'ctr_1', groupId: 'grp_1' };
  const result = await operational(reader).hostname({ hostname: 'example.com', environment: 'STAGING', properties: [ref], configIds: [1], ...page }, context());
  const calls = reader.calls.filter(call => call.operation === 'property' || call.operation === 'propertyHostnames');
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.parameters.propertyId === ref.propertyId && call.query.contractId === ref.contractId && call.query.groupId === ref.groupId));
  assert.equal(calls[1]?.query.network, 'STAGING');
  assert.equal(calls[1]?.query.hostname, 'example.com');
  assert.equal(result.inferences.length, 0);
  assert.deepEqual(asObject(result.evidence[1]?.data).hostnames, { items: [] });
});
test('Document catalog ranking, partial index failure and character paging', async () => {
  const docs = new DocumentationInvestigation({
    async index(_product, section) { if (section === 'docs') throw new InvestigationError('NOT_FOUND', 'Unavailable index'); return { text: '[Caching rules](https://techdocs.akamai.com/property-mgr/reference/get-property.md): caching behavior\n[External](https://evil.test/)', url: 'https://techdocs.akamai.com/property-mgr/reference/llms.txt', retrievedAt: '2026-10-09T12:00:00Z' }; },
    async page() { return { text: 'x'.repeat(300), url: 'https://techdocs.akamai.com/property-mgr/reference/get-property.md', retrievedAt: '2026-10-09T12:00:00Z' }; },
  }, settings);
  const results = await docs.search({ query: 'caching', product: 'property-mgr', ...page }, context());
  assert.equal(results.status, 'partial'); assert.equal(results.evidence[1]?.pagination.total, 1);
  assert.equal((await docs.get({ documentationId: 'property-mgr/reference/get-property', startCharacter: 100, maxCharacters: 100 }, context())).evidence[0]?.pagination.nextCharacter, 200);
  await assert.rejects(docs.get({ documentationId: 'https://evil.test', startCharacter: 0, maxCharacters: 100 }, context()), code('INVALID_INPUT'));
});

test('Hostname discovery normalizes production associations before reading security targets', async () => {
  const reader = new FixtureReader(call => {
    if (call.operation === 'securityConfigurations') return { configurations: [
      { id: 1, productionHostnames: ['EXAMPLE.COM.:443'] },
      { id: 2, productionHostnames: ['other.example.com'] },
    ] };
    if (call.operation === 'securityConfiguration') return { productionVersion: 10 };
    if (call.operation === 'securitySelectedHostnames') return { hostnameList: ['example.com'] };
    if (call.operation === 'securityMatchTargets') return { matchTargets: [] };
    throw new Error('Unexpected operation');
  });
  const result = await operational(reader).hostname({ hostname: 'example.com', environment: 'PRODUCTION', properties: [], configIds: [], ...page }, context());
  assert.equal(result.status, 'success');
  assert.ok(reader.calls.every(call => call.operation.startsWith('security')));
  assert.ok(result.limitations.some(text => text.includes('Nenhuma property informada')));
  const targets = reader.calls.filter(call => call.operation === 'securityMatchTargets');
  assert.equal(targets.length, 1);
  assert.equal(targets[0]?.parameters.configId, 1);
});

test('All-product documentation search reads the four supported indexes and returns both products', async () => {
  const indexes: string[] = [];
  let pageCalls = 0;
  const docs = new DocumentationInvestigation({
    async index(product, section) {
      indexes.push(`${product}/${section}`);
      return {
        text: `[Rules](https://techdocs.akamai.com/${product}/reference/get-rules.md): rules reference`,
        url: `https://techdocs.akamai.com/${product}/${section}/llms.txt`, retrievedAt: '2026-10-09T12:00:00Z',
      };
    },
    async page() { pageCalls++; throw new Error('Unexpected page fetch'); },
  }, settings);
  const result = await docs.search({ query: 'rules', product: 'all', ...page }, context());
  assert.equal(result.status, 'success');
  assert.deepEqual(indexes, ['property-mgr/reference', 'property-mgr/docs', 'application-security/reference', 'application-security/changelog']);
  assert.equal(result.evidence.at(-1)?.pagination.total, 2);
  await assert.rejects(docs.get({ documentationId: 'unsupported-product/reference/get-config', startCharacter: 0, maxCharacters: 100 }, context()), code('INVALID_INPUT'));
  assert.equal(pageCalls, 0);
});
