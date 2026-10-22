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
const path = z.string().min(1).max(2048).regex(/^\/[^\u0000-\u001f?#]*$/);

export const propertyListSchema = z.object({
  ...page, contractId: identifier.optional(), groupId: identifier.optional(), scopeOffset: z.number().int().min(0).max(100000).default(0),
}).strict();
export const propertyDomainSearchSchema = z.object({
  domain: hostname.describe('Domínio ou hostname completo; comparação literal nos nomes, sem URL ou expressão regular.'),
  scopeOffset: z.number().int().min(0).max(100000).default(0),
  maxScopes: z.number().int().min(1).max(20).default(20),
  offset: page.offset, limit: z.number().int().min(1).max(50).default(20),
}).strict();
export const propertyActiveSchema = z.object(propertyRef).strict();
export const propertyConfigurationSchema = z.object({ ...propertySelection, subtreePointer }).strict();
export const propertyCompareFields = { ...propertyRef, fromVersion: version, toVersion: version, subtreePointer };
export const propertyCompareSchema = z.object({ ...propertyCompareFields, ...page }).strict();
export const propertyHistorySchema = z.object({ ...propertyRef, ...page, environment: z.enum(['PRODUCTION', 'STAGING']).optional() }).strict();
export const propertyExplainSchema = z.object({ ...propertySelection, environment: z.enum(['PRODUCTION', 'STAGING']).default('PRODUCTION'), ...page, hostname, path, behaviorNames: z.array(z.string().min(1).max(100)).max(20).default([]) }).strict();
export const hostnameOverviewSchema = z.object({ hostname, ...page, environment: z.enum(['PRODUCTION', 'STAGING']).default('PRODUCTION'), properties: z.array(z.object(propertyRef).strict()).max(5).default([]), includeSecurity: z.boolean().default(false).describe('Habilita a descoberta de segurança AppSec; deixe false para investigar apenas CDN/cache.'), configIds: z.array(configId).max(10).default([]) }).strict().refine(input => input.properties.length > 0 || input.includeSecurity || input.configIds.length > 0, 'Informe properties para confirmar CDN, ou solicite segurança explicitamente com includeSecurity/configIds.');
export const securityListSchema = z.object(page).strict();
export const securityActiveSchema = z.object({ configId }).strict();
export const securityVersionsSchema = z.object({ configId, page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(500).default(25) }).strict();
export const securityPolicySchema = z.object({ ...securitySelection, ...page, policyId: identifier.optional(), sections: z.array(z.enum(['policy', 'match_targets', 'waf_rules', 'attack_groups', 'custom_rules', 'custom_rule_definitions', 'selected_hostnames'])).min(1).max(7).default(['policy', 'match_targets', 'waf_rules', 'attack_groups', 'custom_rules']) }).strict();
export const rateLimitingSchema = z.object({ ...securitySelection, ...page, policyId: identifier.optional() }).strict();
export const securityHistorySchema = z.object({ configId, ...page, environment: z.enum(['PRODUCTION', 'STAGING']).optional() }).strict();

export const configurationChangeSchema = z.object({
  property: z.object(propertyCompareFields).strict().optional(),
  security: z.object({ configId, fromVersion: version, toVersion: version }).strict().optional(),
  ...page,
  fromTime: z.iso.datetime({ offset: true }).optional(),
  toTime: z.iso.datetime({ offset: true }).optional(),
}).strict().refine(value => Boolean(value.property || value.security), 'Informe property, security ou ambos.')
  .refine(value => !value.fromTime || !value.toTime || Date.parse(value.fromTime) < Date.parse(value.toTime), 'fromTime deve preceder toTime.');
export const documentationSearchSchema = z.object({
  query: z.string().trim().min(2).max(256), product: z.enum(['property-mgr', 'application-security', 'all']).default('all'), ...page,
}).strict();
export const documentationGetSchema = z.object({
  documentationId: z.string().min(1).max(256), startCharacter: z.number().int().min(0).max(16777216).default(0), maxCharacters: z.number().int().min(100).max(20000).default(10000),
}).strict();
