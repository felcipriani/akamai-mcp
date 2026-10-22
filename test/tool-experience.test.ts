import assert from 'node:assert/strict';
import test from 'node:test';
import { investigationGuidance } from '../src/application/investigation-guidance.js';
import { PropertyInvestigation } from '../src/application/property-investigation.js';
import { SecurityInvestigation } from '../src/application/security-investigation.js';
import { OperationalInvestigation } from '../src/application/operational-investigation.js';
import { behaviorEvidence, cdnOverview, focusedBehaviors } from '../src/domain/rules.js';
import { asArray, asObject } from '../src/domain/json.js';
import { evidence, result } from '../src/domain/results.js';
import { FixtureReader, context, settings } from './helpers.js';

const ref = { propertyId: 'prp_123', environment: 'PRODUCTION' as const };
const window = { fromTime: '2026-10-22T12:00:00Z', toTime: '2026-10-22T13:00:00Z' };

test('Cache overview examines the full tree and preserves all conditions behind late cache directives', () => {
  const tree = { name: 'default', behaviors: Array.from({ length: 50 }, (_, i) => ({ name: i === 0 ? 'caching' : `filler${i}`, options: { behavior: 'NO_STORE' } })), children: [{
    name: 'Feature Flag Manager', criteria: [{ name: 'path', options: { values: ['/featureflagmanager/*'] } }], children: [{
      name: 'Caching', criteria: [{ name: 'path', options: { values: ['*/flags', '*/flags/'] } }, { name: 'requestMethod', options: { values: ['GET'] } }], behaviors: [
        { name: 'caching', options: { behavior: 'MAX_AGE', ttl: '7d' } }, { name: 'cacheId', options: { elements: ['service'] } },
      ],
    }],
  }] };
  const entries = behaviorEvidence(tree, [], () => {});
  assert.equal(entries.length, 52);
  const overview = cdnOverview(entries, '/');
  const cache = asObject(overview.cache);
  assert.equal(overview.analysisComplete, true); assert.equal(overview.pathEvaluated, false);
  assert.equal(cache.allCachingDirectivesAreNoStore, false);
  assert.equal(cache.timeBasedCachingRuleCount, 1);
  assert.ok(JSON.stringify(cache).includes('/featureflagmanager/*'));
  assert.ok(JSON.stringify(cache).includes('requestMethod'));
  assert.ok(JSON.stringify(cache).includes('service'));
  assert.equal(focusedBehaviors(entries, 'overview', []).length, 3);
  const guided = investigationGuidance('explain_cdn_behavior', { ...ref, hostname: 'example.com', path: '/', focus: 'all' }, {
    ...result([evidence('PAPI', 'propertyRules', ref, entries.slice(0, 50), { nextOffset: 50 })]), inferences: [overview],
  });
  assert.equal(guided.status, 'partial'); assert.equal(guided.coverage.analysisComplete, true);
  assert.equal(guided.coverage.detailsComplete, false);
  assert.equal(asObject(guided.nextActions[0]?.arguments).offset, 50);
});
test('Origin and header questions select their details without claiming path evaluation', () => {
  const entries = behaviorEvidence({ behaviors: [{ name: 'origin' }, { name: 'modifyOutgoingResponseHeader' }, { name: 'caching' }] }, [], () => {});
  assert.equal(focusedBehaviors(entries, 'origin', []).length, 1);
  assert.equal(focusedBehaviors(entries, 'headers', []).length, 1);
  assert.equal(focusedBehaviors(entries, 'all', []).length, 3);
});
test('A complete name batch never proves unique hostname association, and cursors preserve search arguments', () => {
  const output = result([evidence('PAPI', 'properties; local domain filter', {}, { candidates: [] }, { batchPageComplete: true, nextCursor: { scopeOffset: 20, offset: 0 } })]);
  const guided = investigationGuidance('search_properties_by_domain', { domain: 'example.com', maxScopes: 20 }, output);
  assert.equal(guided.coverage.uniquenessEstablished, false);
  assert.equal(guided.coverage.hostnameInventoryComplete, false);
  assert.equal(guided.status, 'partial');
  assert.deepEqual(guided.nextActions[0]?.arguments, { domain: 'example.com', maxScopes: 20, scopeOffset: 20, offset: 0 });
});
test('Security continuations paginate only their own section and configuration scope never inherits policyId', async () => {
  const reader = new FixtureReader(call => call.operation === 'securityConfiguration' ? { productionVersion: 2 } : call.operation === 'securityMatchTargets'
    ? { matchTargets: [{ targetId: 1 }] } : { ruleActions: [{ id: 1 }, { id: 2 }] });
  const input = { configId: 1, policyId: 'policy_1', environment: 'PRODUCTION' as const, sections: ['match_targets', 'waf_rules'] as ('match_targets' | 'waf_rules')[], offset: 0, limit: 1 };
  const output = await new SecurityInvestigation(reader, settings).policy(input, context());
  const targets = output.evidence.find(item => item.operation === 'securityMatchTargets');
  assert.equal(targets?.resource.policyId, null); assert.equal(targets?.resource.sourceScope, 'CONFIGURATION_VERSION');
  const guidance = investigationGuidance('get_security_policy', input, output);
  assert.deepEqual(asObject(guidance.nextActions[0]?.arguments).sections, ['waf_rules']);
  assert.equal(asObject(guidance.nextActions[0]?.arguments).offset, 1);
});
test('Activation windows filter the full history before pagination and flag unknown times', async () => {
  const rows = [{ network: 'PRODUCTION', submitDate: '2026-10-20T10:00:00Z', activationDate: '2026-10-20T10:00:00Z' }, { network: 'PRODUCTION', submitDate: '2026-10-22T12:10:00Z', activationDate: '2026-10-22T12:10:00Z' }, { network: 'PRODUCTION', id: 'unknown-time' }];
  const reader = new FixtureReader(call => call.operation === 'propertyActivations' ? { activations: { items: rows } } : { activationHistory: rows });
  for (const output of [
    await new PropertyInvestigation(reader, settings).activations({ ...ref, ...window, offset: 0, limit: 1 }, context()),
    await new SecurityInvestigation(reader, settings).activations({ configId: 1, ...window, offset: 0, limit: 1 }, context()),
  ]) {
    assert.equal(asObject(asArray(output.evidence[0]?.data)[0]).submitDate, '2026-10-22T12:10:00Z');
    assert.equal(output.evidence[0]?.pagination.total, 2);
    assert.equal(output.evidence[0]?.pagination.unknownTimestampCount, 1);
    const guided = investigationGuidance('get_property_activation_history', { ...ref, ...window, offset: 0, limit: 1 }, output);
    assert.equal(guided.coverage.analysisComplete, false);
    assert.equal(guided.status, 'partial');
  }
  const unknown = await new PropertyInvestigation(reader, settings).activations({ ...ref, ...window, offset: 1, limit: 1 }, context());
  assert.equal(asObject(asArray(unknown.evidence[0]?.data)[0]).timeWindowMembership, 'UNKNOWN');
});
test('Incident investigation filters activations before paging instead of missing a late in-window activation', async () => {
  const reader = new FixtureReader(call => call.operation === 'propertyRules' ? { rules: {} } : { activations: { items: [{ submitDate: '2026-10-20T10:00:00Z' }, { submitDate: '2026-10-22T12:10:00Z' }] } });
  const properties = new PropertyInvestigation(reader, settings);
  const investigation = new OperationalInvestigation(properties, new SecurityInvestigation(reader, settings), settings);
  const output = await investigation.configurationChange({ property: { propertyId: 'prp_123', fromVersion: 1, toVersion: 2, subtreePointer: '' }, ...window, offset: 0, limit: 1 }, context());
  assert.equal(asArray(output.evidence.find(item => item.operation === 'propertyActivations')?.data).length, 1);
});
test('Rate limiting actions are linked by ID even when returned in a different order', async () => {
  const reader = new FixtureReader(call => call.operation === 'securityConfiguration' ? { productionVersion: 2 } : call.operation === 'securityRatePolicies'
    ? { ratePolicies: [{ id: 1 }, { id: 2 }] } : { ratePolicyActions: [{ id: 2, action: 'deny' }, { id: 1, action: 'alert' }] });
  const output = await new SecurityInvestigation(reader, settings).rateLimiting({ configId: 1, policyId: 'policy_1', environment: 'PRODUCTION', offset: 0, limit: 50 }, context());
  assert.deepEqual(output.inferences[0]?.pageAssociations, [{ ratePolicyId: '1', action: 'alert' }, { ratePolicyId: '2', action: 'deny' }]);
});
test('Rate action guidance preserves a historical version and reuses a known policy', async () => {
  const reader = new FixtureReader(call => call.operation === 'securityConfiguration' ? { productionVersion: 9 } : { ratePolicies: [{ id: 1 }] });
  const input = { configId: 1, version: 5, environment: 'PRODUCTION' as const, policyId: 'policy_1', sections: ['definitions'] as 'definitions'[], offset: 0, limit: 50 };
  const output = await new SecurityInvestigation(reader, settings).rateLimiting(input, context());
  const guided = investigationGuidance('get_rate_limiting_configuration', input, output);
  assert.equal(guided.nextActions[0]?.tool, 'get_rate_limiting_configuration');
  assert.equal(asObject(guided.nextActions[0]?.arguments).version, 5);
  assert.equal(asObject(guided.nextActions[0]?.arguments).policyId, 'policy_1');
  assert.deepEqual(asObject(guided.nextActions[0]?.arguments).sections, ['actions']);
});
test('Malformed AppSec arrays are unavailable, preserving good sections without asserting absence', async () => {
  const reader = new FixtureReader(call => call.operation === 'securityConfiguration' ? { productionVersion: 1 } : call.operation === 'securityRules' ? { unexpected: [] } : { matchTargets: [] });
  const input = { configId: 1, policyId: 'policy_1', environment: 'PRODUCTION' as const, sections: ['waf_rules', 'match_targets'] as ('waf_rules' | 'match_targets')[], offset: 0, limit: 50 };
  const output = await new SecurityInvestigation(reader, settings).policy(input, context());
  assert.equal(output.status, 'partial');
  assert.equal(asObject(output.unavailable[0]?.error).code, 'INVALID_RESPONSE');
  const guided = investigationGuidance('get_security_policy', input, output);
  assert.equal(guided.coverage.analysisComplete, false);
  assert.ok(guided.evidence.some(item => item.operation === 'securityMatchTargets'));
});
test('Large configurations return an outline with executable subtree actions instead of discarding the response', async () => {
  const reader = new FixtureReader(call => call.operation === 'property' ? { properties: { items: [{ productionVersion: 2 }] } } : { rules: { name: 'default', children: [{ name: 'Large Rule', behaviors: [{ name: 'large', options: { data: 'x'.repeat(5000) } }] }] } });
  const output = await new PropertyInvestigation(reader, { ...settings, maxToolBytes: 8192 }).configuration({ ...ref, subtreePointer: '' }, context());
  assert.equal(asObject(output.evidence[1]?.data).view, 'outline');
  const guided = investigationGuidance('get_property_configuration', { ...ref, subtreePointer: '' }, output);
  assert.equal(guided.coverage.analysisComplete, false);
  assert.equal(asObject(guided.nextActions[0]?.arguments).subtreePointer, '/children/0');
});
test('Malformed continuation URLs do not erase evidence, and documentation produces a direct read action', () => {
  const version = investigationGuidance('list_property_versions', ref, result([evidence('PAPI', 'propertyVersions', ref, [], { nextLink: 'https://[' })]));
  assert.equal(version.coverage.detailsComplete, false);
  assert.equal(version.evidence.length, 1);
  const docs = investigationGuidance('search_akamai_documentation', { query: 'cache' }, result([evidence('TechDocs', 'search_public_indexes', {}, [{ id: 'property-mgr/reference/get-property' }])]));
  assert.equal(docs.nextActions[0]?.tool, 'get_akamai_documentation');
});
test('Combined change investigations continue the pending component without repeating unrelated CDN work', () => {
  const input = { property: { propertyId: 'prp_1', fromVersion: 1, toVersion: 2 }, security: { configId: 3, fromVersion: 5, toVersion: 6 }, limit: 1 };
  const source = evidence('Application Security', 'securityExport × 2; structural comparison', { configId: 3, fromVersion: 5, toVersion: 6 }, {}, { nextOffset: 1 });
  const guided = investigationGuidance('investigate_configuration_change', input, result([source]));
  assert.deepEqual(guided.nextActions[0]?.arguments, { security: { configId: 3, fromVersion: 5, toVersion: 6 }, limit: 1, offset: 1 });
});
