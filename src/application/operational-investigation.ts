import type { Settings } from '../configuration/config.js';
import { asArray, asObject, stringValue } from '../domain/json.js';
import { normalizedHostname } from '../domain/hostname.js';
import { result } from '../domain/results.js';
import type { InvestigationResult } from '../domain/results.js';
import { collect } from './common.js';
import type { InvestigationContext } from './context.js';
import { PropertyInvestigation } from './property-investigation.js';
import type { PropertyRef } from './property-investigation.js';
import { SecurityInvestigation } from './security-investigation.js';

export class OperationalInvestigation {
  constructor(
    private readonly properties: PropertyInvestigation,
    private readonly security: SecurityInvestigation,
    private readonly settings: Settings,
  ) {}

  async hostname(input: { hostname: string; environment: 'PRODUCTION' | 'STAGING'; offset: number; limit: number; configIds: number[] }, context: InvestigationContext): Promise<InvestigationResult> {
    const output = result([]);
    await collect(output, 'property_search', { hostname: input.hostname }, context, async () => this.properties.find(input.hostname, input, context));
    const search = output.evidence.find(item => item.operation === 'propertySearch');
    const ids = new Map<string, PropertyRef>();
    for (const item of asArray(search?.data)) {
      const candidate = asObject(item);
      const propertyId = stringValue(candidate['propertyId']);
      if (propertyId) ids.set(propertyId, { propertyId, contractId: stringValue(candidate['contractId']) ?? undefined, groupId: stringValue(candidate['groupId']) ?? undefined });
    }
    for (const ref of [...ids.values()].slice(0, 5)) {
      await collect(output, 'property_version', { propertyId: ref.propertyId }, context, () => this.properties.active(ref, context));
      await collect(output, 'active_hostname_association', { propertyId: ref.propertyId }, context, () => this.properties.hostnameAssociation({ ...ref, hostname: input.hostname, environment: input.environment }, context));
    }
    if (ids.size > 5) output.limitations.push('Consolidação limitada a 5 properties. Use find_property_by_hostname para as demais.');
    let securityConfigs = input.configIds;
    if (!securityConfigs.length) {
      await collect(output, 'security_configurations', { hostname: input.hostname }, context, async () => this.security.list({ offset: 0, limit: this.settings.maxResults }, context));
      const listing = output.evidence.find(item => item.operation === 'securityConfigurations');
      securityConfigs = asArray(listing?.data).map(asObject).filter(config => {
        if (input.environment === 'STAGING') return true;
        return asArray(config['productionHostnames']).some(host => typeof host === 'string' && normalizedHostname(host) === input.hostname);
      }).map(config => config['id']).filter((id): id is number => typeof id === 'number');
      if (input.environment === 'STAGING') output.limitations.push('Inventário não oferece stagingHostnames. São consultadas até 5 configurações candidatas, sem afirmar associação ao hostname. Informe configIds para focar a investigação.');
    }
    for (const configId of securityConfigs.slice(0, 5)) {
      await collect(output, 'security_match_targets', { configId }, context, () => this.security.policy({
        configId, environment: input.environment, sections: ['selected_hostnames', 'match_targets'], offset: 0, limit: this.settings.maxResults,
      }, context));
    }
    if (securityConfigs.length > 5) output.limitations.push('Consolidação limitada a 5 security configurations. Consulte individualmente as demais.');
    output.limitations.push('Consolidação reúne candidatos e associações retornadas pelas APIs. match targets precisam ser interpretados para determinar a política aplicável. Configurações de segurança e CDN são independentes; paginação e escopos podem deixar candidatos de fora.');
    return output;
  }

  async configurationChange(input: {
    property?: (PropertyRef & { fromVersion: number; toVersion: number; subtreePointer: string }) | undefined;
    security?: { configId: number; fromVersion: number; toVersion: number } | undefined;
    fromTime?: string | undefined; toTime?: string | undefined;
    offset: number; limit: number;
  }, context: InvestigationContext): Promise<InvestigationResult> {
    const output = result([]);
    const property = input.property;
    const security = input.security;
    if (property) {
      await collect(output, 'property_diff', { propertyId: property.propertyId }, context, () => this.properties.compare({ ...property, offset: input.offset, limit: input.limit }, context));
      await collect(output, 'property_activation_history', { propertyId: property.propertyId }, context, () => this.properties.activations({ ...property, offset: input.offset, limit: input.limit }, context));
    }
    if (security) {
      await collect(output, 'security_diff', { configId: security.configId }, context, () => this.security.compare({ ...security, offset: input.offset, limit: input.limit }, context));
      await collect(output, 'security_activation_history', { configId: security.configId }, context, () => this.security.activations({ ...security, offset: input.offset, limit: input.limit }, context));
    }
    const from = input.fromTime ? Date.parse(input.fromTime) : -Infinity;
    const to = input.toTime ? Date.parse(input.toTime) : Infinity;
    for (const item of output.evidence) {
      if (!['propertyActivations', 'securityActivations'].includes(item.operation)) continue;
      const records = asArray(item.data);
      const filtered = records.filter(record => {
        const row = asObject(record);
        const timestamp = stringValue(row['activationDate']) ?? stringValue(row['submitDate']);
        if (!timestamp) return true;
        const time = Date.parse(timestamp);
        return !Number.isFinite(time) || (time >= from && time <= to);
      });
      item.data = filtered;
      item.pagination = { ...item.pagination, filteredReturned: filtered.length, filterAppliedAfterPagination: true };
      item.resource = { ...item.resource, fromTime: input.fromTime ?? null, toTime: input.toTime ?? null };
    }
    output.limitations.push('Período filtra localmente apenas a página de ativações consultada; percorra páginas para investigar todo o histórico. Horários de envio e conclusão podem diferir.', 'Diffs e ativações fornecem evidências, sem determinar causa do incidente. Alterações não ativadas não aparecem necessariamente no histórico de ativações.');
    return output;
  }
}
