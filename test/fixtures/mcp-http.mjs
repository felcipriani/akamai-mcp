// Child-process fixture only. Every fetch is controlled; no external requests.
import event from './siem-official.json' with { type: 'json' };

globalThis.fetch = async (input, init) => {
  if (process.env.FIXTURE_DELAY_MS) await new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, Number(process.env.FIXTURE_DELAY_MS));
    init?.signal?.addEventListener('abort', () => { clearTimeout(timeout); reject(init.signal.reason); }, { once: true });
  });
  const url = new URL(String(input));
  if (!['akab-test.luna.akamaiapis.net', 'techdocs.akamai.com'].includes(url.hostname)) throw new Error('Fixture rejects unexpected host');
  if (url.hostname === 'techdocs.akamai.com') return new Response(url.pathname.endsWith('llms.txt')
    ? '[Property rules](https://techdocs.akamai.com/property-mgr/reference/get-property-version-rules.md): rules and caching'
    : process.env.FIXTURE_LARGE_DOC ? 'x'.repeat(20000) : '# Rules\nDocumented rules and caching.');
  const path = url.pathname;
  let data = {};
  if (path === '/papi/v1/groups') data = { groups: { items: [{ groupId: 'grp_1', contractIds: ['ctr_1'] }] } };
  else if (path.endsWith('/search/find-by-value')) {
    if (init?.method !== 'POST' || Object.keys(JSON.parse(init.body)).join() !== 'hostname') throw new Error('Invalid search contract');
    data = { versions: { items: [{ propertyId: 'prp_123', contractId: 'ctr_1', groupId: 'grp_1', propertyVersion: 2 }] } };
  } else if (path === '/papi/v1/properties' || /^\/papi\/v1\/properties\/prp_\d+$/.test(path)) data = { properties: { items: [{ propertyId: 'prp_123', propertyName: 'fixture', latestVersion: 3, productionVersion: 2, stagingVersion: 3 }] } };
  else if (path.endsWith('/rules') && path.startsWith('/papi/')) data = { ruleFormat: 'latest', rules: { name: 'default', criteria: [], behaviors: [{ name: 'origin', options: { hostname: 'origin.example.com', apiKey: 'should-be-redacted' } }, { name: 'caching', options: { ttl: path.includes('/1/') ? 30 : 60 } }], children: [] } };
  else if (path.endsWith('/versions') && path.startsWith('/papi/')) data = { versions: { items: [{ propertyVersion: 1 }, { propertyVersion: 2 }] } };
  else if (path.endsWith('/hostnames')) data = { hostnames: { items: [{ cnameFrom: 'example.com', productionVersion: 2 }] } };
  else if (path.endsWith('/activations') && path.startsWith('/papi/')) data = { activations: { items: [{ propertyVersion: 2, network: 'PRODUCTION', status: 'ACTIVE', submitDate: '2026-10-09T12:00:00Z' }] } };
  else if (path === '/appsec/v1/configs') data = { configurations: [{ id: 14227, name: 'fixture', productionVersion: 10, productionHostnames: ['example.com'] }] };
  else if (/^\/appsec\/v1\/configs\/\d+$/.test(path)) data = { id: 14227, latestVersion: 12, productionVersion: 10, stagingVersion: 11, productionHostnames: ['example.com'] };
  else if (path.startsWith('/appsec/v1/export/')) data = { version: Number(path.split('/').at(-1)), hostnames: ['example.com'] };
  else if (path.endsWith('/versions')) data = { page: 1, pageSize: 25, totalSize: 1, versionList: [{ version: 10 }] };
  else if (path.endsWith('/security-policies')) data = { policies: [{ policyId: 'policy_1' }] };
  else if (path.endsWith('/policy_1')) data = { policyId: 'policy_1', policySecurityControls: { applyApplicationLayerControls: true } };
  else if (path.endsWith('/rules')) data = { ruleActions: [{ id: 950002, action: 'deny' }] };
  else if (path.endsWith('/attack-groups')) data = { attackGroupActions: [{ group: 'SQL', action: 'deny' }] };
  else if (path.endsWith('/custom-rules')) data = { customRules: [] };
  else if (path.endsWith('/match-targets')) data = { matchTargets: [{ hostnames: ['example.com'], securityPolicy: { policyId: 'policy_1' } }] };
  else if (path.endsWith('/selected-hostnames')) data = { hostnameList: ['example.com'] };
  else if (path.endsWith('/rate-policies')) data = path.includes('/security-policies/') ? { ratePolicyActions: [{ id: 1, action: 'deny' }] } : { ratePolicies: [{ id: 1, threshold: 100 }] };
  else if (path.endsWith('/activations')) data = { activationHistory: [{ version: 10, network: 'PRODUCTION', status: 'ACTIVE', activationDate: '2026-10-09T12:00:00Z' }] };
  else if (path.startsWith('/siem/v1/configs/')) return new Response(JSON.stringify({ ...event, attackData: { ...event.attackData, appliedAction: 'deny' }, httpMessage: { ...event.httpMessage, host: 'example.com', status: '403' } }) + '\n{"total":1,"offset":"fixture-next"}');
  else throw new Error('Fixture rejects unexpected route');
  return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
};
