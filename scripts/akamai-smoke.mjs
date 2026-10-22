// Opt-in real read-only checks. Prints only counts/status; never API payloads.
import { loadConfiguration } from '../dist/configuration/config.js';
import { InvestigationContext } from '../dist/application/context.js';
import { AkamaiClient } from '../dist/infrastructure/akamai-client.js';
import { PropertyInvestigation } from '../dist/application/property-investigation.js';
import { SecurityInvestigation } from '../dist/application/security-investigation.js';
import { OperationalInvestigation } from '../dist/application/operational-investigation.js';
import { DocumentationInvestigation } from '../dist/application/documentation-investigation.js';
import { PublicDocumentationSource } from '../dist/infrastructure/documentation-source.js';
import { asArray, asObject, stringValue } from '../dist/domain/json.js';
import { InvestigationError } from '../dist/domain/errors.js';

const report = { timestamp: new Date().toISOString(), node: process.version, mode: 'real_read_only', checks: [] };
async function main() {
  const configuration = loadConfiguration();
  const settings = { ...configuration.settings, maxRetries: 0, maxRequestsPerTool: 30, maxResults: 5 };
  const context = new InvestigationContext(new AbortController().signal, settings, new AbortController().signal);
  const reader = new AkamaiClient({ ...configuration, settings });
  const properties = new PropertyInvestigation(reader, settings);
  const security = new SecurityInvestigation(reader, settings);
  const operation = new OperationalInvestigation(properties, security, settings);
  async function check(step, task) {
    try {
      const result = await task();
      report.checks.push({ step, status: result.status ?? 'success', sources: (result.evidence ?? []).map(item => ({ api: item.api, operation: item.operation, records: Array.isArray(item.data) ? item.data.length : null })), unavailable: (result.unavailable ?? []).map(item => ({ component: item.component, code: item.error?.code ?? null })) });
      return result;
    } catch (error) {
      report.checks.push({ step, status: 'error', code: error instanceof InvestigationError ? error.code : 'INTERNAL_ERROR', httpStatus: error instanceof InvestigationError ? error.details.httpStatus ?? null : null });
      return null;
    }
  }
  if (!configuration.credentials) report.checks.push({ step: 'akamai_authentication', status: 'skipped', reason: 'credentials_not_configured' });
  else {
    const listing = await check('papi_properties_one_scope', () => properties.list({ offset: 0, limit: 1, scopeOffset: 0 }, context));
    const candidate = asObject(asArray(listing?.evidence[0]?.data)[0]);
    const propertyId = stringValue(candidate.propertyId);
    let hostname = null;
    const propertyRefs = [];
    if (propertyId) {
      const ref = { propertyId, contractId: stringValue(candidate.contractId) ?? undefined, groupId: stringValue(candidate.groupId) ?? undefined };
      propertyRefs.push(ref);
      const active = await check('papi_active_versions', () => properties.active(ref, context));
      const productionVersion = asObject(active?.evidence[0]?.data).productionVersion;
      await check('papi_versions', () => properties.versions({ ...ref, offset: 0, limit: 1 }, context));
      await check('papi_activation_history', () => properties.activations({ ...ref, offset: 0, limit: 1 }, context));
      if (typeof productionVersion === 'number') {
        await check('papi_rules', () => properties.configuration({ ...ref, version: productionVersion, environment: 'PRODUCTION', subtreePointer: '' }, context));
        const hostnames = await check('papi_version_hostnames', async () => {
          const reply = await reader.read('propertyVersionHostnames', { propertyId, version: productionVersion }, { contractId: ref.contractId, groupId: ref.groupId }, context);
          return { status: 'success', evidence: [{ api: reply.api, operation: reply.operation, data: reply.data }] };
        });
        hostname = stringValue(asObject(asArray(asObject(hostnames?.evidence[0]?.data).hostnames?.items)[0]).cnameFrom);
        if (hostname) {
          await check('papi_hostname_association', () => properties.hostnameAssociation({ ...ref, hostname, environment: 'PRODUCTION' }, context));
        }
      }
    }
    const configs = await check('appsec_configurations', () => security.list({ offset: 0, limit: 1 }, context));
    const configId = asObject(asArray(configs?.evidence[0]?.data)[0]).id;
    if (typeof configId === 'number') {
      const active = await check('appsec_active_versions', () => security.active(configId, context));
      await check('appsec_versions', () => security.versions({ configId, page: 1, pageSize: 1 }, context));
      await check('appsec_activation_history', () => security.activations({ configId, offset: 0, limit: 1 }, context));
      if (typeof asObject(active?.evidence[0]?.data).productionVersion === 'number') {
        const discovery = await check('appsec_policy_discovery_and_targets', () => security.policy({ configId, environment: 'PRODUCTION', sections: ['match_targets', 'selected_hostnames', 'policy'], offset: 0, limit: 1 }, context));
        const policyList = discovery?.evidence.find(item => item.operation === 'securityPolicies');
        const policyId = stringValue(asObject(asArray(asObject(policyList?.data).policies)[0]).policyId);
        if (policyId) {
          await check('appsec_policy_and_rules', () => security.policy({ configId, policyId, environment: 'PRODUCTION', sections: ['policy', 'waf_rules'], offset: 0, limit: 1 }, context));
          await check('appsec_rate_limits', () => security.rateLimiting({ configId, policyId, environment: 'PRODUCTION', offset: 0, limit: 1 }, context));
        }
        if (hostname) await check('combined_hostname_overview', () => operation.hostname({ hostname, environment: 'PRODUCTION', properties: propertyRefs, configIds: [configId], offset: 0, limit: 1 }, context));
      }
    }
  }
  const docs = new DocumentationInvestigation(new PublicDocumentationSource(settings), settings);
  await check('public_documentation_search', () => docs.search({ query: 'rules', product: 'property-mgr', offset: 0, limit: 1 }, context));
  await check('public_documentation_page', () => docs.get({ documentationId: 'property-mgr/reference/get-property-version-rules', startCharacter: 0, maxCharacters: 1000 }, context));
}
try { await main(); } catch (error) { report.checks.push({ step: 'setup', status: 'error', code: error instanceof InvestigationError ? error.code : 'INTERNAL_ERROR' }); }
console.log(JSON.stringify(report, null, 2));
if (report.checks.some(check => check.status === 'error')) process.exitCode = 1;
