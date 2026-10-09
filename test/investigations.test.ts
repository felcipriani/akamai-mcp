import assert from 'node:assert/strict';
import test from 'node:test';
import { PropertyInvestigation } from '../src/application/property-investigation.js';
import { SecurityInvestigation } from '../src/application/security-investigation.js';
import { WafInvestigation } from '../src/application/waf-investigation.js';
import { OperationalInvestigation } from '../src/application/operational-investigation.js';
import { DocumentationInvestigation } from '../src/application/documentation-investigation.js';
import { InvestigationError } from '../src/domain/errors.js';
import { asObject } from '../src/domain/json.js';
import event from './fixtures/siem-official.json' with { type: 'json' };
import { FixtureReader, code, context, settings } from './helpers.js';

const page = { offset: 0, limit: 50 };
const property = { propertyId: 'prp_123', environment: 'PRODUCTION' as const };
const query = { configIds: [14227], offset: 'fixture-token', apiLimit: 5, resultOffset: 0, limit: 50, requestId: event.httpMessage.requestId };
function stream(action: string, status: string) { return { stream: JSON.stringify({ ...event, attackData: { ...event.attackData, appliedAction: action }, httpMessage: { ...event.httpMessage, status } }) + '\n{"total":1,"offset":"next"}' }; }
function operational(reader: FixtureReader): OperationalInvestigation { return new OperationalInvestigation(new PropertyInvestigation(reader, settings), new SecurityInvestigation(reader, settings), new WafInvestigation(reader, settings), settings); }

test('Property production, staging and latest remain distinct; absent active has no fallback', async () => {
  const reader = new FixtureReader(() => ({ properties: { items: [{ propertyId: 'prp_123', productionVersion: 2, stagingVersion: 3, latestVersion: 8 }] } }));
  const properties = new PropertyInvestigation(reader, settings);
  for (const [environment, expected] of [['PRODUCTION', 2], ['STAGING', 3], ['LATEST', 8]] as const) assert.equal((await properties.resolveVersion({ ...property, environment }, context())).version, expected);
  assert.equal((await properties.resolveVersion({ ...property, version: 1 }, context())).version, 1);
  const absent = new PropertyInvestigation(new FixtureReader(() => ({ properties: { items: [{ latestVersion: 8 }] } })), settings);
  await assert.rejects(absent.resolveVersion(property, context()), code('NOT_FOUND'));
});
test('Property scope and hostname candidates preserve pagination and multiple properties', async () => {
  const reader = new FixtureReader(call => call.operation === 'propertyGroups' ? { groups: { items: [{ groupId: 'grp_1', contractIds: ['ctr_1', 'ctr_2'] }] } } : call.operation === 'properties' ? { properties: { items: [{ propertyId: 'prp_1' }, { propertyId: 'prp_2' }] } } : { versions: { items: [{ propertyId: 'prp_1' }, { propertyId: 'prp_2' }] } });
  const properties = new PropertyInvestigation(reader, settings);
  const listing = await properties.list({ offset: 0, limit: 1, scopeOffset: 0 }, context());
  assert.equal(listing.evidence[0]?.pagination.nextOffset, 1);
  assert.equal(listing.evidence[0]?.pagination.nextScopeOffset, 1);
  assert.equal((await properties.find('example.com', page, context())).evidence[0]?.pagination.total, 2);
  await assert.rejects(properties.list({ ...page, scopeOffset: 0, contractId: 'ctr_1' }, context()), code('INVALID_INPUT'));
});
test('Missing PAPI arrays are rejected rather than reported as no properties', async () => {
  const properties = new PropertyInvestigation(new FixtureReader(() => ({})), settings);
  await assert.rejects(properties.find('example.com', page, context()), code('INVALID_RESPONSE'));
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
test('Scenario A: exact SIEM request denial supplies evidence and rule IDs', async () => {
  const waf = new WafInvestigation(new FixtureReader(() => stream('deny', '403')), settings);
  const result = await waf.request(query, context());
  assert.equal(result.inferences[0]?.assessment, 'siem_reports_deny_for_matching_request');
  assert.equal(result.evidence[0]?.pagination.scanned, 1);
});
test('Scenario B: 403 without final denial or without events is inconclusive', async () => {
  for (const fixture of [stream('alert', '403'), { stream: '{"total":0,"offset":"next"}' }]) {
    const result = await operational(new FixtureReader(() => fixture)).http403({ ...query, hostname: event.httpMessage.host, environment: 'PRODUCTION', includeConfiguration: false }, context());
    assert.equal(result.inferences[0]?.assessment, 'insufficient_evidence_to_attribute_403');
    assert.equal(result.inferences[0]?.originAttribution, 'unavailable');
    assert.ok(result.limitations.some(text => text.includes('não comprova')));
  }
});
test('Scenario C: activation in window and config diff do not establish causality', async () => {
  const reader = new FixtureReader(call => call.operation === 'propertyRules' ? { rules: { behaviors: [{ name: 'caching', options: { ttl: call.parameters.version === 1 ? 30 : 60 } }] } } : { activations: { items: [{ propertyVersion: 2, network: 'PRODUCTION', status: 'ACTIVE', submitDate: '2026-10-09T12:01:00Z' }] } });
  const result = await operational(reader).configurationChange({ property: { propertyId: 'prp_123', fromVersion: 1, toVersion: 2, subtreePointer: '' }, fromTime: '2026-10-09T12:00:00Z', toTime: '2026-10-09T12:02:00Z', ...page }, context());
  assert.equal(result.evidence.length, 2);
  assert.equal(asObject(result.evidence[0]?.data).comparison, 'structural_json');
  assert.ok(result.limitations.some(text => text.includes('sem determinar causa')));
});
test('Scenario D: management API 403 keeps other sources and does not imply application blockage', async () => {
  const reader = new FixtureReader(call => call.operation === 'propertySearch' ? { versions: { items: [{ propertyId: 'prp_1' }, { propertyId: 'prp_2' }] } } : call.operation === 'property' ? { properties: { items: [{ propertyId: String(call.parameters.propertyId), productionVersion: 2 }] } } : call.operation === 'propertyHostnames' ? { hostnames: { items: [] } } : new InvestigationError('PERMISSION_DENIED', 'No AppSec permission'));
  const result = await operational(reader).hostname({ hostname: 'example.com', environment: 'PRODUCTION', configIds: [1], ...page }, context());
  assert.equal(result.status, 'partial'); assert.equal(result.evidence.length, 5);
  assert.equal(asObject(result.unavailable[0]?.error).code, 'PERMISSION_DENIED');
});
test('Scenario E: outside retention fails before upstream and does not invent history', async () => {
  const reader = new FixtureReader(() => stream('deny', '403'));
  const waf = new WafInvestigation(reader, settings);
  const now = Math.floor(Date.now() / 1000);
  for (const period of [{ from: now - 43201, to: now - 5 }, { from: now - 60, to: now }, { from: now - 5, to: now - 60 }]) await assert.rejects(waf.events({ configIds: [1], apiLimit: 5, resultOffset: 0, limit: 5, ...period }, context()), code('INVALID_INPUT'));
  assert.equal(reader.calls.length, 0);
});
test('Local SIEM pagination releases remote offset only after consuming matched events', async () => {
  const one = JSON.stringify(event);
  const reader = new FixtureReader(() => ({ stream: one + '\n' + one + '\n{"total":2,"offset":"next","limit":2}' }));
  const waf = new WafInvestigation(reader, settings);
  const first = await waf.events({ ...query, limit: 1 }, context());
  assert.equal(first.evidence[0]?.pagination.nextOffset, null);
  assert.equal(first.evidence[0]?.pagination.nextResultOffset, 1);
  const second = await waf.events({ ...query, limit: 1, resultOffset: 1 }, context());
  assert.equal(second.evidence[0]?.pagination.nextOffset, 'next');
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
