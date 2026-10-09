import { isIP } from 'node:net';
import { domainToASCII } from 'node:url';
import * as z from 'zod/v4';

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
export const hostname = z.string().min(1).max(253).transform(value => domainToASCII(value.toLowerCase().replace(/\.$/, '')))
  .refine(value => value.length > 0 && value.length <= 253 && value.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)), 'Informe hostname DNS sem URL, porta ou wildcard.');
const version = z.number().int().positive().max(2147483647);
const configId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const environment = z.enum(['PRODUCTION', 'STAGING', 'LATEST']).default('PRODUCTION');
export const page = { offset: z.number().int().min(0).max(1000000).default(0), limit: z.number().int().min(1).max(500).default(50) };
export const propertyRef = { propertyId: z.string().regex(/^(?:prp_)?[1-9]\d{0,19}$/), contractId: identifier.optional(), groupId: identifier.optional() };
export const selection = { version: version.optional(), environment };
export const propertySelection = { ...propertyRef, ...selection };
export const securitySelection = { configId, ...selection };
export const subtreePointer = z.string().max(2048).regex(/^(?:\/[^\u0000-\u001f]*)?$/).default('');
const requestId = z.string().min(1).max(256).regex(/^[A-Za-z0-9_.:-]+$/);
export const configIds = z.array(configId).min(1).max(10).refine(values => new Set(values).size === values.length, 'configIds devem ser únicos.');
const path = z.string().min(1).max(2048).regex(/^\/[^\u0000-\u001f?#]*$/);

export const propertyListSchema = z.object({
  ...page, contractId: identifier.optional(), groupId: identifier.optional(), scopeOffset: z.number().int().min(0).max(100000).default(0),
}).strict();
export const propertyFindSchema = z.object({ hostname, ...page }).strict();
export const propertyActiveSchema = z.object(propertyRef).strict();
export const propertyConfigurationSchema = z.object({ ...propertySelection, subtreePointer }).strict();
export const propertyCompareFields = { ...propertyRef, fromVersion: version, toVersion: version, subtreePointer };
export const propertyCompareSchema = z.object({ ...propertyCompareFields, ...page }).strict();
export const propertyHistorySchema = z.object({ ...propertyRef, ...page, environment: z.enum(['PRODUCTION', 'STAGING']).optional() }).strict();
export const propertyExplainSchema = z.object({ ...propertySelection, ...page, hostname, path, behaviorNames: z.array(z.string().min(1).max(100)).max(20).default([]) }).strict();
export const hostnameOverviewSchema = z.object({ hostname, ...page, environment: z.enum(['PRODUCTION', 'STAGING']).default('PRODUCTION'), configIds: z.array(configId).max(10).default([]) }).strict();
export const securityListSchema = z.object(page).strict();
export const securityActiveSchema = z.object({ configId }).strict();
export const securityVersionsSchema = z.object({ configId, page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(500).default(25) }).strict();
export const securityPolicySchema = z.object({ ...securitySelection, ...page, policyId: identifier.optional(), sections: z.array(z.enum(['policy', 'match_targets', 'waf_rules', 'attack_groups', 'custom_rules', 'custom_rule_definitions', 'selected_hostnames'])).min(1).max(7).default(['policy', 'match_targets', 'waf_rules', 'attack_groups', 'custom_rules']) }).strict();
export const rateLimitingSchema = z.object({ ...securitySelection, ...page, policyId: identifier.optional() }).strict();
export const securityHistorySchema = z.object({ configId, ...page, environment: z.enum(['PRODUCTION', 'STAGING']).optional() }).strict();

export const wafFields = {
  configIds,
  from: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  to: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  offset: z.string().min(1).max(2048).regex(/^[^\u0000-\u0020]+$/).optional(),
  apiLimit: z.number().int().min(1).max(5000).default(1000),
  resultOffset: z.number().int().min(0).max(100000).default(0),
  limit: page.limit,
  hostname: hostname.optional(),
  clientIp: z.string().refine(value => isIP(value) !== 0, 'Endereço IP inválido.').optional(),
  requestId: requestId.optional(), path: path.optional(),
  action: z.string().min(1).max(64).optional(), policyId: identifier.optional(),
  ruleId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/).optional(),
  httpStatus: z.number().int().min(100).max(599).optional(),
};
function hasValidQueryMode(value: { offset?: string | undefined; from?: number | undefined; to?: number | undefined }): boolean {
  if (value.offset !== undefined) return value.from === undefined && value.to === undefined;
  return value.from !== undefined && value.to !== undefined && value.from < value.to;
}

export const wafEventsSchema = z.object(wafFields).strict().refine(hasValidQueryMode, 'Informe from/to ou offset, sem misturar os modos.');
export const wafRequestSchema = z.object({ ...wafFields, requestId }).strict().refine(hasValidQueryMode, 'Informe from/to ou offset, sem misturar os modos.');
export const http403Schema = z.object({
  ...wafFields, hostname, environment: z.enum(['PRODUCTION', 'STAGING']).default('PRODUCTION'), includeConfiguration: z.boolean().default(true),
}).strict().refine(hasValidQueryMode, 'Informe from/to ou offset, sem misturar os modos.');
export const configurationChangeSchema = z.object({
  property: z.object(propertyCompareFields).strict().optional(),
  security: z.object({ configId, fromVersion: version, toVersion: version }).strict().optional(),
  ...page,
  fromTime: z.iso.datetime({ offset: true }).optional(),
  toTime: z.iso.datetime({ offset: true }).optional(),
}).strict().refine(value => Boolean(value.property || value.security), 'Informe property, security ou ambos.')
  .refine(value => !value.fromTime || !value.toTime || Date.parse(value.fromTime) < Date.parse(value.toTime), 'fromTime deve preceder toTime.');
export const documentationSearchSchema = z.object({
  query: z.string().trim().min(2).max(256), product: z.enum(['property-mgr', 'application-security', 'siem-integration', 'all']).default('all'), ...page,
}).strict();
export const documentationGetSchema = z.object({
  documentationId: z.string().min(1).max(256), startCharacter: z.number().int().min(0).max(16777216).default(0), maxCharacters: z.number().int().min(100).max(20000).default(10000),
}).strict();
