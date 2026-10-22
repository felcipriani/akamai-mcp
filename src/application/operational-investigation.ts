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

  async hostname(input: { hostname: string; environment: 'PRODUCTION' | 'STAGING'; offset: number; limit: number; properties: PropertyRef[]; configIds: number[]; includeSecurity?: boolean }, context: InvestigationContext): Promise<InvestigationResult> {
    const output = result([]);
    for (const ref of input.properties.slice(0, 5)) {
      const unavailableBefore = output.unavailable.length;
      await collect(output, 'active_hostname_association', { propertyId: ref.propertyId }, context, () => this.properties.hostnameAssociation({ ...ref, hostname: input.hostname, environment: input.environment }, context));
      if (output.unavailable.length > unavailableBefore) {
        output.inferences.push({ kind: 'hostname_association', propertyId: ref.propertyId, contractId: ref.contractId ?? null, groupId: ref.groupId ?? null, hostname: input.hostname, environment: input.environment, associationStatus: 'UNKNOWN', version: null, reason: 'API_UNAVAILABLE', nextAction: 'RESOLVE_UNAVAILABLE_SOURCE' });
      }
    }
    if (!input.properties.length) output.limitations.push('Nenhuma property informada; a associação CDN não foi consultada. Use list_properties, percorra nextOffset e nextScopeOffset e informe as referências em properties para confirmar o hostname no ambiente.');
    if (!input.includeSecurity && !input.configIds.length) return output;
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
