import type { Settings } from '../configuration/config.js';
import { InvestigationError } from '../domain/errors.js';
import { asArray, asObject, positiveVersion } from '../domain/json.js';
import type { JsonObject } from '../domain/json.js';
import { localPage } from '../domain/pagination.js';
import type { Page } from '../domain/pagination.js';
import type { Operation } from '../domain/read-policy.js';
import { compareJson } from '../domain/rules.js';
import { result } from '../domain/results.js';
import { filterTimeWindow } from '../domain/time-window.js';
import type { TimeWindow } from '../domain/time-window.js';
import type { InvestigationResult } from '../domain/results.js';
import { apiEvidence, collect } from './common.js';
import type { InvestigationContext } from './context.js';
import type { AkamaiReader, ApiReply } from './ports.js';
import type { VersionSelection } from './property-investigation.js';

export interface SecuritySelection extends VersionSelection { configId: number }
export type PolicySection = 'policy' | 'match_targets' | 'waf_rules' | 'attack_groups' | 'custom_rules' | 'custom_rule_definitions' | 'selected_hostnames';

const policySections: Record<PolicySection, { operation: Operation; arrayKey: string | null; needsPolicy: boolean }> = {
  policy: { operation: 'securityPolicy', arrayKey: null, needsPolicy: true },
  match_targets: { operation: 'securityMatchTargets', arrayKey: 'matchTargets', needsPolicy: false },
  waf_rules: { operation: 'securityRules', arrayKey: 'ruleActions', needsPolicy: true },
  attack_groups: { operation: 'securityAttackGroups', arrayKey: 'attackGroupActions', needsPolicy: true },
  custom_rules: { operation: 'securityCustomRuleActions', arrayKey: 'customRules', needsPolicy: true },
  custom_rule_definitions: { operation: 'securityCustomRules', arrayKey: 'customRules', needsPolicy: false },
  selected_hostnames: { operation: 'securitySelectedHostnames', arrayKey: 'hostnameList', needsPolicy: false },
};

export class SecurityInvestigation {
  constructor(private readonly reader: AkamaiReader, private readonly settings: Settings) {}

  async list(page: Page, context: InvestigationContext): Promise<InvestigationResult> {
    const reply = await this.reader.read('securityConfigurations', {}, {}, context);
    const items = asObject(reply.data)['configurations'];
    if (!Array.isArray(items)) throw new InvestigationError('INVALID_RESPONSE', 'API não retornou configurations.');
    const sliced = localPage(items, page, this.settings.maxResults);
    const item = apiEvidence(reply, {}, sliced.items);
    item.pagination = sliced.pagination;
    return result([item]);
  }

  async active(configId: number, context: InvestigationContext): Promise<InvestigationResult> {
    const reply = await this.reader.read('securityConfiguration', { configId }, { includeHostnames: true }, context);
    return result([apiEvidence(reply, { configId }, reply.data)], ['Versões de segurança são independentes das versões de properties. latestVersion não equivale à versão ativa.']);
  }

  async resolveVersion(ref: SecuritySelection, context: InvestigationContext): Promise<{ version: number; metadata: InvestigationResult }> {
    const metadata = await this.active(ref.configId, context);
    if (ref.version !== undefined) return { version: ref.version, metadata };
    const configuration = asObject(metadata.evidence[0]?.data);
    const key = ref.environment === 'PRODUCTION' ? 'productionVersion' : ref.environment === 'STAGING' ? 'stagingVersion' : 'latestVersion';
    const version = positiveVersion(configuration[key]);
    if (version === null) throw new InvestigationError('NOT_FOUND', 'Não há versão de segurança para o seletor solicitado.', { configId: ref.configId, environment: ref.environment });
    return { version, metadata };
  }

  async versions(input: { configId: number; page: number; pageSize: number }, context: InvestigationContext): Promise<InvestigationResult> {
    const reply = await this.reader.read('securityVersions', { configId: input.configId }, { page: input.page, pageSize: Math.min(input.pageSize, this.settings.maxResults), detail: true }, context);
    const item = apiEvidence(reply, { configId: input.configId }, reply.data);
    const data = asObject(reply.data);
    item.pagination = { mode: 'upstream_page', page: data['page'] ?? input.page, pageSize: data['pageSize'] ?? input.pageSize, totalSize: data['totalSize'] ?? null };
    return result([item]);
  }

  async policy(ref: SecuritySelection & Page & { policyId?: string | undefined; sections: PolicySection[] }, context: InvestigationContext): Promise<InvestigationResult> {
    const selected = await this.resolveVersion(ref, context);
    const output = selected.metadata;
    let policiesListed = false;
    for (const section of ref.sections) {
      const definition = policySections[section];
      if (definition.needsPolicy && !ref.policyId) {
        if (!policiesListed) await collect(output, 'policy_discovery', { configId: ref.configId }, context, async () => {
          const reply = await this.reader.read('securityPolicies', { configId: ref.configId, version: selected.version }, {}, context);
          return this.sliceReply(reply, { configId: ref.configId, version: selected.version }, 'policies', ref);
        });
        policiesListed = true;
        output.status = 'partial';
        output.unavailable.push({ component: section, resource: { configId: ref.configId, version: selected.version }, reason: 'Informe policyId do catálogo para consultar esta seção.' });
        continue;
      }
      await collect(output, section, { configId: ref.configId, version: selected.version, policyId: ref.policyId ?? null }, context, async () => {
        const parameters: Record<string, string | number> = { configId: ref.configId };
        if (section !== 'custom_rule_definitions') parameters['version'] = selected.version;
        if (definition.needsPolicy && ref.policyId) parameters['policyId'] = ref.policyId;
        const reply = await this.reader.read(definition.operation, parameters, {}, context);
        const resource: JsonObject = { ...this.resource(ref, selected.version), version: section === 'custom_rule_definitions' ? null : selected.version, policyId: definition.needsPolicy ? ref.policyId ?? null : null, sourceScope: definition.needsPolicy ? 'POLICY' : section === 'custom_rule_definitions' ? 'CONFIGURATION_GLOBAL' : 'CONFIGURATION_VERSION', section };
        return this.sliceReply(reply, resource, definition.arrayKey, ref);
      });
    }
    output.limitations.push('Match targets e hostnames são evidências de seleção; critérios e ordem determinam a política aplicável. Produtos e motores WAF podem disponibilizar endpoints diferentes.', 'Definições globais de custom rules não comprovam o conteúdo histórico da versão; consulte as ações por versão e o export quando necessário.');
    return output;
  }

  async rateLimiting(ref: SecuritySelection & Page & { policyId?: string | undefined; sections?: ('definitions' | 'actions')[] }, context: InvestigationContext): Promise<InvestigationResult> {
    const selected = await this.resolveVersion(ref, context);
    const output = selected.metadata;
    const sections = ref.sections ?? ['definitions', 'actions'];
    if (sections.includes('definitions')) await collect(output, 'rate_policies', { configId: ref.configId, version: selected.version }, context, async () => {
      const reply = await this.reader.read('securityRatePolicies', { configId: ref.configId, version: selected.version }, {}, context);
      return this.sliceReply(reply, { ...this.resource(ref, selected.version), section: 'definitions', sourceScope: 'CONFIGURATION_VERSION' }, 'ratePolicies', ref);
    });
    if (ref.policyId && sections.includes('actions')) await collect(output, 'rate_actions', { policyId: ref.policyId }, context, async () => {
      const reply = await this.reader.read('securityRatePolicyActions', { configId: ref.configId, version: selected.version, policyId: ref.policyId! }, {}, context);
      return this.sliceReply(reply, { ...this.resource(ref, selected.version), policyId: ref.policyId!, section: 'actions', sourceScope: 'POLICY' }, 'ratePolicyActions', ref);
    });
    const definitions = asArray(asObject(output.evidence.find(item => item.operation === 'securityRatePolicies')?.data)['ratePolicies']).map(asObject);
    const actions = asArray(asObject(output.evidence.find(item => item.operation === 'securityRatePolicyActions')?.data)['ratePolicyActions']).map(asObject);
    const id = (row: JsonObject) => {
      const value = row['id'] ?? row['ratePolicyId'];
      return typeof value === 'number' || typeof value === 'string' ? String(value) : null;
    };
    output.inferences.push({ kind: 'rate_limiting_configuration_overview', configId: ref.configId, policyId: ref.policyId ?? null, version: selected.version, environment: ref.environment, runtimeVerified: false, endpointApplicabilityEvaluated: false,
      associationBasis: 'ID_NOT_ARRAY_POSITION', actionsConsulted: output.evidence.some(item => item.operation === 'securityRatePolicyActions'),
      pageAssociations: definitions.map(definition => ({ ratePolicyId: id(definition), action: actions.find(action => id(definition) !== null && id(action) === id(definition))?.['action'] ?? null })),
      limitation: 'Relaciona somente as páginas retornadas. Ação ausente nesta página não comprova ausência de ação. Controles, critérios e match targets ainda precisam ser interpretados.',
    });
    output.limitations.push('Existência de rate policy não comprova aplicação ao endpoint. Cruze ações, controles habilitados, critérios e match targets; sem policyId as ações não são consultadas.');
    return output;
  }

  async activations(ref: { configId: number; environment?: 'PRODUCTION' | 'STAGING' | undefined } & Page & TimeWindow, context: InvestigationContext): Promise<InvestigationResult> {
    const reply = await this.reader.read('securityActivations', { configId: ref.configId }, {}, context);
    const history = asObject(reply.data)['activationHistory'];
    if (!Array.isArray(history)) throw new InvestigationError('INVALID_RESPONSE', 'API não retornou activationHistory.');
    const entries = history.filter(item => !ref.environment || asObject(item)['network'] === ref.environment);
    const filtered = filterTimeWindow(entries, ref);
    const page = localPage(filtered.entries, ref, this.settings.maxResults);
    const item = apiEvidence(reply, { configId: ref.configId, environment: ref.environment ?? 'BOTH', fromTime: ref.fromTime ?? null, toTime: ref.toTime ?? null }, page.items);
    item.pagination = { ...page.pagination, timeFilterAppliedBeforePagination: true, unknownTimestampCount: filtered.unknownTimestampCount };
    return result([item], ['Histórico de ativações de segurança; status e horário não devem ser confundidos com ativações de CDN.', 'Registros sem horário válido são preservados, mas não comprovam ocorrência dentro da janela informada.']);
  }

  async compare(ref: { configId: number; fromVersion: number; toVersion: number } & Page, context: InvestigationContext): Promise<InvestigationResult> {
    const before = await this.reader.read('securityExport', { configId: ref.configId, version: ref.fromVersion }, {}, context);
    const after = await this.reader.read('securityExport', { configId: ref.configId, version: ref.toVersion }, {}, context);
    const diff = compareJson(before.data, after.data, ref.offset, Math.min(ref.limit, this.settings.maxResults), () => context.checkpoint());
    const item = apiEvidence(after, { configId: ref.configId, fromVersion: ref.fromVersion, toVersion: ref.toVersion }, { ...diff, fromRetrievedAt: before.retrievedAt, toRetrievedAt: after.retrievedAt });
    item.operation = 'securityExport × 2; structural comparison';
    item.pagination = asObject(diff['pagination']);
    return { ...result([item], ['Export síncrono GET documentado; nenhum job assíncrono é criado. Diff inclui metadados e não comprova efeito operacional. Export pode ser restrito ou indisponível para seu contrato.']), inferences: [{ kind: 'configuration_comparison_overview', api: 'Application Security', configId: ref.configId, ...asObject(diff['summary']) }] };
  }

  private resource(ref: SecuritySelection, version: number): JsonObject {
    return { configId: ref.configId, version, selector: ref.version === undefined ? ref.environment : 'EXPLICIT_VERSION', environment: ref.version === undefined && ref.environment !== 'LATEST' ? ref.environment : null };
  }

  private sliceReply(reply: ApiReply, resource: JsonObject, arrayKey: string | null, page: Page): InvestigationResult {
    if (!arrayKey) return result([apiEvidence(reply, resource)]);
    const data = asObject(reply.data);
    const entries = data[arrayKey];
    if (!Array.isArray(entries)) throw new InvestigationError('INVALID_RESPONSE', `Resposta sem o array esperado ${arrayKey}; não comprova ausência da configuração.`, { api: reply.api, operation: reply.operation });
    const sliced = localPage(entries, page, this.settings.maxResults);
    const item = apiEvidence(reply, resource, { ...data, [arrayKey]: sliced.items });
    item.pagination = sliced.pagination;
    return result([item]);
  }
}
