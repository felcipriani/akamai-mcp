import { InvestigationError } from './errors.js';

const operations = {
  propertyGroups: { api: 'PAPI', path: '/papi/v1/groups', query: [] },
  properties: { api: 'PAPI', path: '/papi/v1/properties', query: ['contractId', 'groupId'] },
  propertySearch: { api: 'PAPI', path: '/papi/v1/search/find-by-value', query: [] },
  property: { api: 'PAPI', path: '/papi/v1/properties/{propertyId}', query: ['contractId', 'groupId'] },
  propertyVersions: { api: 'PAPI', path: '/papi/v1/properties/{propertyId}/versions', query: ['contractId', 'groupId', 'offset', 'limit'] },
  propertyRules: { api: 'PAPI', path: '/papi/v1/properties/{propertyId}/versions/{version}/rules', query: ['contractId', 'groupId'] },
  propertyHostnames: { api: 'PAPI', path: '/papi/v1/properties/{propertyId}/hostnames', query: ['contractId', 'groupId', 'hostname', 'network', 'offset', 'limit'] },
  propertyVersionHostnames: { api: 'PAPI', path: '/papi/v1/properties/{propertyId}/versions/{version}/hostnames', query: ['contractId', 'groupId'] },
  propertyActivations: { api: 'PAPI', path: '/papi/v1/properties/{propertyId}/activations', query: ['contractId', 'groupId'] },
  securityConfigurations: { api: 'Application Security', path: '/appsec/v1/configs', query: [] },
  securityConfiguration: { api: 'Application Security', path: '/appsec/v1/configs/{configId}', query: ['includeHostnames'] },
  securityVersions: { api: 'Application Security', path: '/appsec/v1/configs/{configId}/versions', query: ['page', 'pageSize', 'detail'] },
  securityVersion: { api: 'Application Security', path: '/appsec/v1/configs/{configId}/versions/{version}', query: [] },
  securityPolicies: { api: 'Application Security', path: '/appsec/v1/configs/{configId}/versions/{version}/security-policies', query: [] },
  securityPolicy: { api: 'Application Security', path: '/appsec/v1/configs/{configId}/versions/{version}/security-policies/{policyId}', query: [] },
  securityMatchTargets: { api: 'Application Security', path: '/appsec/v1/configs/{configId}/versions/{version}/match-targets', query: [] },
  securitySelectedHostnames: { api: 'Application Security', path: '/appsec/v1/configs/{configId}/versions/{version}/selected-hostnames', query: [] },
  securityRules: { api: 'Application Security', path: '/appsec/v1/configs/{configId}/versions/{version}/security-policies/{policyId}/rules', query: [] },
  securityAttackGroups: { api: 'Application Security', path: '/appsec/v1/configs/{configId}/versions/{version}/security-policies/{policyId}/attack-groups', query: [] },
  securityCustomRuleActions: { api: 'Application Security', path: '/appsec/v1/configs/{configId}/versions/{version}/security-policies/{policyId}/custom-rules', query: [] },
  securityCustomRules: { api: 'Application Security', path: '/appsec/v1/configs/{configId}/custom-rules', query: [] },
  securityRatePolicies: { api: 'Application Security', path: '/appsec/v1/configs/{configId}/versions/{version}/rate-policies', query: [] },
  securityRatePolicyActions: { api: 'Application Security', path: '/appsec/v1/configs/{configId}/versions/{version}/security-policies/{policyId}/rate-policies', query: [] },
  securityActivations: { api: 'Application Security', path: '/appsec/v1/configs/{configId}/activations', query: [] },
  securityExport: { api: 'Application Security', path: '/appsec/v1/export/configs/{configId}/versions/{version}', query: [] },
} as const;

export type Operation = keyof typeof operations;
export type Parameters = Readonly<Record<string, string | number>>;
export type Query = Readonly<Record<string, string | number | boolean | undefined>>;

export function permittedRequest(operation: Operation, parameters: Parameters, query: Query, hostname?: string) {
  if (!Object.hasOwn(operations, operation)) throw new InvestigationError('OPERATION_NOT_ALLOWED', 'Operação fora da política de leitura.');
  const definition = operations[operation];
  const requiredNames = [...definition.path.matchAll(/\{(\w+)\}/g)].map(match => match[1]);
  for (const name of Object.keys(parameters)) {
    if (!requiredNames.includes(name)) throw new InvestigationError('INVALID_INPUT', 'Parâmetro de rota não permitido.');
  }
  const path = definition.path.replace(/\{(\w+)\}/g, (_match: string, name: string) => {
    const value = parameters[name];
    const pattern = name === 'configId' || name === 'version' ? /^[1-9]\d*$/
      : name === 'propertyId' ? /^(?:prp_)?[1-9]\d{0,19}$/ : /^[A-Za-z0-9_-]{1,128}$/;
    if (value === undefined || !pattern.test(String(value))) throw new InvestigationError('INVALID_INPUT', `Identificador inválido: ${name}.`);
    return encodeURIComponent(String(value));
  });
  const allowedKeys: readonly string[] = definition.query;
  for (const key of Object.keys(query)) {
    if (!allowedKeys.includes(key)) throw new InvestigationError('OPERATION_NOT_ALLOWED', 'Parâmetro de consulta fora da política.');
  }
  if (operation === 'properties' && (!query['groupId'] || !query['contractId'])) {
    throw new InvestigationError('INVALID_INPUT', 'Listar properties exige contractId e groupId.');
  }
  if (operation === 'propertySearch' && (!hostname || !/^[a-z0-9.-]{1,253}$/i.test(hostname))) {
    throw new InvestigationError('INVALID_INPUT', 'Busca requer hostname válido.');
  }
  return {
    api: definition.api,
    path,
    method: operation === 'propertySearch' ? 'POST' as const : 'GET' as const,
    body: operation === 'propertySearch' ? JSON.stringify({ hostname }) : '',
  };
}
