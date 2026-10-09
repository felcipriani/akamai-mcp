import type { Settings } from '../configuration/config.js';
import { InvestigationError } from '../domain/errors.js';
import { asArray, asObject, nestedItems, positiveVersion, selectFields, stringValue } from '../domain/json.js';
import type { JsonObject } from '../domain/json.js';
import { jsonPointer, localPage } from '../domain/pagination.js';
import type { Page } from '../domain/pagination.js';
import { behaviorEvidence, compareJson } from '../domain/rules.js';
import { result } from '../domain/results.js';
import type { InvestigationResult } from '../domain/results.js';
import type { AkamaiReader } from './ports.js';
import type { InvestigationContext } from './context.js';
import { apiEvidence } from './common.js';

export interface PropertyRef {
  propertyId: string;
  contractId?: string | undefined;
  groupId?: string | undefined;
}
export type Environment = 'PRODUCTION' | 'STAGING' | 'LATEST';
export interface VersionSelection { version?: number | undefined; environment: Environment }
export interface PropertySelection extends PropertyRef, VersionSelection {}

const propertyKeys = ['propertyId', 'propertyName', 'contractId', 'groupId', 'latestVersion', 'productionVersion', 'stagingVersion', 'propertyType', 'ruleFormat'];

export class PropertyInvestigation {
  constructor(private readonly reader: AkamaiReader, private readonly settings: Settings) {}

  private scopeQuery(ref: PropertyRef) { return { contractId: ref.contractId, groupId: ref.groupId }; }

  async scopes(context: InvestigationContext): Promise<JsonObject[]> {
    const reply = await this.reader.read('propertyGroups', {}, {}, context);
    const scopes: JsonObject[] = [];
    for (const item of nestedItems(reply.data, 'groups')) {
      const group = asObject(item);
      for (const contract of asArray(group['contractIds'])) {
        if (typeof contract !== 'string' || typeof group['groupId'] !== 'string') continue;
        scopes.push({ groupId: group['groupId'], contractId: contract, groupName: group['groupName'] ?? null });
      }
    }
    return scopes.sort((left, right) => `${left['groupId']}/${left['contractId']}`.localeCompare(`${right['groupId']}/${right['contractId']}`));
  }

  async list(input: Page & { contractId?: string | undefined; groupId?: string | undefined; scopeOffset: number }, context: InvestigationContext): Promise<InvestigationResult> {
    if (Boolean(input.contractId) !== Boolean(input.groupId)) throw new InvestigationError('INVALID_INPUT', 'Forneça contractId e groupId juntos.');
    let contractId = input.contractId;
    let groupId = input.groupId;
    let scopeCount: number | null = null;
    let nextScopeOffset: number | null = null;
    if (!contractId || !groupId) {
      const scopes = await this.scopes(context);
      scopeCount = scopes.length;
      const scope = scopes[input.scopeOffset];
      if (!scope) return result([], ['Nenhum escopo nesta posição; não comprova ausência de properties em outros escopos.']);
      contractId = stringValue(scope['contractId']) ?? undefined;
      groupId = stringValue(scope['groupId']) ?? undefined;
      nextScopeOffset = input.scopeOffset + 1 < scopes.length ? input.scopeOffset + 1 : null;
    }
    const reply = await this.reader.read('properties', {}, { contractId, groupId }, context);
    const page = localPage(nestedItems(reply.data, 'properties').map(item => selectFields(asObject(item), propertyKeys)), input, this.settings.maxResults);
    const item = apiEvidence(reply, { contractId: contractId ?? null, groupId: groupId ?? null }, page.items);
    item.pagination = { ...page.pagination, scopeOffset: input.scopeOffset, scopeCount, nextScopeOffset };
    item.limitations = ['Uma consulta por par contrato/grupo. Paginação local; o PAPI devolve a lista completa desse escopo. Escopos podem mudar entre consultas.'];
    return result([item]);
  }

  async find(hostname: string, page: Page, context: InvestigationContext): Promise<InvestigationResult> {
    const reply = await this.reader.read('propertySearch', {}, {}, context, hostname);
    const sliced = localPage(nestedItems(reply.data, 'versions'), page, this.settings.maxResults);
    const item = apiEvidence(reply, { hostname }, sliced.items);
    item.pagination = sliced.pagination;
    return result([item], ['Busca documentada contempla versões ativas e a última inativa. Não é inventário de todos os hostnames históricos; resultados devem ser confirmados no ambiente desejado.']);
  }

  async active(ref: PropertyRef, context: InvestigationContext): Promise<InvestigationResult> {
    const reply = await this.reader.read('property', { propertyId: ref.propertyId }, this.scopeQuery(ref), context);
    const property = nestedItems(reply.data, 'properties')[0];
    if (!property) throw new InvestigationError('NOT_FOUND', 'Property não encontrada no escopo informado.');
    return result([apiEvidence(reply, { propertyId: ref.propertyId }, selectFields(asObject(property), propertyKeys))], ['latestVersion é independente de productionVersion e stagingVersion. Ausência de versão ativa não seleciona automaticamente a mais recente.']);
  }

  async resolveVersion(ref: PropertySelection, context: InvestigationContext): Promise<{ version: number; metadata: InvestigationResult }> {
    const metadata = await this.active(ref, context);
    if (ref.version !== undefined) return { version: ref.version, metadata };
    const property = asObject(metadata.evidence[0]?.data);
    const key = ref.environment === 'PRODUCTION' ? 'productionVersion' : ref.environment === 'STAGING' ? 'stagingVersion' : 'latestVersion';
    const version = positiveVersion(property[key]);
    if (version === null) throw new InvestigationError('NOT_FOUND', 'Não há versão disponível para o seletor solicitado.', { propertyId: ref.propertyId, environment: ref.environment });
    return { version, metadata };
  }

  async rules(ref: PropertySelection, context: InvestigationContext) {
    const selected = await this.resolveVersion(ref, context);
    const reply = await this.reader.read('propertyRules', { propertyId: ref.propertyId, version: selected.version }, this.scopeQuery(ref), context);
    const data = asObject(reply.data);
    if (!data['rules']) throw new InvestigationError('INVALID_RESPONSE', 'PAPI não retornou a árvore rules.');
    return { ...selected, reply, data, rules: data['rules'] };
  }

  async configuration(ref: PropertySelection & { subtreePointer: string }, context: InvestigationContext): Promise<InvestigationResult> {
    const configured = await this.rules(ref, context);
    const subtree = jsonPointer(configured.rules, ref.subtreePointer);
    const item = apiEvidence(configured.reply, this.resource(ref, configured.version), {
      ruleFormat: configured.data['ruleFormat'] ?? null,
      etag: configured.reply.etag,
      subtreePointer: ref.subtreePointer,
      rules: subtree,
      metadata: selectFields(configured.data, ['propertyId', 'propertyVersion', 'accountId', 'contractId', 'groupId']),
    });
    return result([...configured.metadata.evidence, item], [
      'Árvore hierárquica preservada. Behaviors podem depender de critérios, herança e ordem; não representam execução comprovada.',
      'Includes, regras avançadas, EdgeWorkers e Cloudlets podem adicionar comportamento não expandido por esta ferramenta. Leitura com validateRules=false.',
      ...(ref.subtreePointer ? ['Subárvore selecionada; obtenha os ancestrais para interpretar critérios e herança.'] : []),
    ]);
  }

  async versions(ref: PropertyRef & Page, context: InvestigationContext): Promise<InvestigationResult> {
    const limit = Math.min(ref.limit, this.settings.maxResults);
    const reply = await this.reader.read('propertyVersions', { propertyId: ref.propertyId }, { ...this.scopeQuery(ref), offset: ref.offset, limit }, context);
    const item = apiEvidence(reply, { propertyId: ref.propertyId }, reply.data);
    const container = asObject(asObject(reply.data)['versions']);
    item.pagination = { mode: 'upstream_offset', offset: ref.offset, limit, nextLink: container['nextLink'] ?? asObject(reply.data)['nextLink'] ?? null };
    return result([item]);
  }

  async compare(ref: PropertyRef & { fromVersion: number; toVersion: number; subtreePointer: string } & Page, context: InvestigationContext): Promise<InvestigationResult> {
    const before = await this.reader.read('propertyRules', { propertyId: ref.propertyId, version: ref.fromVersion }, this.scopeQuery(ref), context);
    const after = await this.reader.read('propertyRules', { propertyId: ref.propertyId, version: ref.toVersion }, this.scopeQuery(ref), context);
    const left = asObject(before.data);
    const right = asObject(after.data);
    if (!left['rules'] || !right['rules']) throw new InvestigationError('INVALID_RESPONSE', 'Árvore ausente na comparação.');
    const diff = compareJson(jsonPointer(left['rules'], ref.subtreePointer), jsonPointer(right['rules'], ref.subtreePointer), ref.offset, Math.min(ref.limit, this.settings.maxResults), () => context.checkpoint());
    const item = apiEvidence(after, { propertyId: ref.propertyId, fromVersion: ref.fromVersion, toVersion: ref.toVersion, subtreePointer: ref.subtreePointer }, {
      ...diff, fromRuleFormat: left['ruleFormat'] ?? null, toRuleFormat: right['ruleFormat'] ?? null,
      fromRetrievedAt: before.retrievedAt, toRetrievedAt: after.retrievedAt,
      fromEtag: before.etag, toEtag: after.etag,
    });
    item.operation = 'propertyRules × 2; structural comparison';
    item.pagination = asObject(diff['pagination']);
    return result([item], ['Diff estrutural local, com arrays em ordem. Versões editáveis podem mudar entre leituras; não é snapshot transacional nem prova do comportamento em runtime.', 'Mudanças de ruleFormat ou includes podem afetar a comparação sem alterar o comportamento efetivo.']);
  }

  async activations(ref: PropertyRef & Page & { environment?: 'PRODUCTION' | 'STAGING' | undefined }, context: InvestigationContext): Promise<InvestigationResult> {
    const reply = await this.reader.read('propertyActivations', { propertyId: ref.propertyId }, this.scopeQuery(ref), context);
    const entries = nestedItems(reply.data, 'activations').filter(item => !ref.environment || asObject(item)['network'] === ref.environment);
    const page = localPage(entries, ref, this.settings.maxResults);
    const item = apiEvidence(reply, { propertyId: ref.propertyId, environment: ref.environment ?? 'BOTH' }, page.items);
    item.pagination = page.pagination;
    return result([item], ['Histórico inclui tentativas e diferentes status. submitDate não é necessariamente horário de conclusão; consulte campos retornados.']);
  }

  async explain(ref: PropertySelection & Page & { hostname: string; path: string; behaviorNames: string[] }, context: InvestigationContext): Promise<InvestigationResult> {
    const configured = await this.rules(ref, context);
    const behaviors = behaviorEvidence(configured.rules, ref.behaviorNames, () => context.checkpoint());
    const page = localPage(behaviors, ref, this.settings.maxResults);
    const item = apiEvidence(configured.reply, { ...this.resource(ref, configured.version), hostname: ref.hostname, path: ref.path }, page.items);
    item.pagination = page.pagination;
    return result([...configured.metadata.evidence, item], ['Evidências de behaviors com todos os critérios ancestrais. hostname/path são contexto, sem avaliação automática de critérios ou cálculo de TTL efetivo.', 'O cliente MCP deve interpretar ordem, critérios desconhecidos, includes e behaviors externos com documentação oficial.']);
  }

  async hostnameAssociation(ref: PropertyRef & { hostname: string; environment: 'PRODUCTION' | 'STAGING' }, context: InvestigationContext): Promise<InvestigationResult> {
    const reply = await this.reader.read('propertyHostnames', { propertyId: ref.propertyId }, {
      ...this.scopeQuery(ref), hostname: ref.hostname, network: ref.environment, offset: 0, limit: 10,
    }, context);
    return result([apiEvidence(reply, { propertyId: ref.propertyId, hostname: ref.hostname, environment: ref.environment }, reply.data)]);
  }

  private resource(ref: PropertySelection, version: number): JsonObject {
    return { propertyId: ref.propertyId, contractId: ref.contractId ?? null, groupId: ref.groupId ?? null, version, selector: ref.version === undefined ? ref.environment : 'EXPLICIT_VERSION', environment: ref.version === undefined && ref.environment !== 'LATEST' ? ref.environment : null };
  }
}
