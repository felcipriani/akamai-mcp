import type { Settings } from '../configuration/config.js';
import { InvestigationError, publicError } from '../domain/errors.js';
import { asObject, nestedItems, selectFields, stringValue } from '../domain/json.js';
import type { JsonObject } from '../domain/json.js';
import { localPage } from '../domain/pagination.js';
import type { Page } from '../domain/pagination.js';
import { evidence, result } from '../domain/results.js';
import type { InvestigationResult } from '../domain/results.js';
import type { InvestigationContext } from './context.js';
import type { AkamaiReader } from './ports.js';
import { PropertyInvestigation } from './property-investigation.js';

export interface DomainSearch extends Page { domain: string; scopeOffset: number; maxScopes: number }

export class PropertyDiscovery {
  constructor(private readonly reader: AkamaiReader, private readonly properties: PropertyInvestigation, private readonly settings: Settings) {}

  async search(input: DomainSearch, context: InvestigationContext): Promise<InvestigationResult> {
    const scopes = await this.properties.scopes(context);
    const batchSize = Math.min(input.maxScopes, this.settings.maxRequestsPerTool - 1);
    if (batchSize < 1) throw new InvestigationError('BUDGET_EXCEEDED', 'O inventário exige pelo menos duas requisições por chamada.');
    // DNS labels are literal; callers cannot supply executable regular expressions.
    const escaped = input.domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?:^|\\.)${escaped}(?=$|_)`, 'i');
    const candidates: JsonObject[] = [];
    const sources: JsonObject[] = [];
    const output = result([]);
    let end = input.scopeOffset;
    let propertiesScanned = 0;
    let interrupted = false;
    for (const scope of scopes.slice(input.scopeOffset, input.scopeOffset + batchSize)) {
      context.checkpoint();
      const contractId = stringValue(scope['contractId']) ?? undefined;
      const groupId = stringValue(scope['groupId']) ?? undefined;
      try {
        const reply = await this.reader.read('properties', {}, { contractId, groupId }, context);
        const items = nestedItems(reply.data, 'properties');
        propertiesScanned += items.length;
        sources.push({ ...scope, retrievedAt: reply.retrievedAt, propertiesScanned: items.length });
        for (const item of items) {
          const property = asObject(item);
          if (!pattern.test(stringValue(property['propertyName']) ?? '')) continue;
          candidates.push({
            ...selectFields(property, ['propertyId', 'propertyName', 'latestVersion', 'productionVersion', 'stagingVersion']),
            contractId: contractId ?? null, groupId: groupId ?? null, groupName: scope['groupName'] ?? null,
            matchReason: 'PROPERTY_NAME_DOMAIN', associationStatus: 'NOT_CHECKED',
          });
        }
      } catch (error) {
        context.checkpoint();
        output.status = 'partial';
        output.unavailable.push({ component: 'property_inventory_scope', resource: scope, error: publicError(error) });
        if (error instanceof InvestigationError && error.code === 'BUDGET_EXCEEDED') { interrupted = true; break; }
      }
      end++;
    }
    const page = localPage(candidates, input, Math.min(this.settings.maxResults, 50));
    const nextCursor = page.pagination['nextOffset'] !== null
      ? { scopeOffset: input.scopeOffset, offset: page.pagination['nextOffset'] ?? 0 }
      : end < scopes.length ? { scopeOffset: end, offset: 0 } : null;
    const inventoryComplete = input.scopeOffset === 0 && end >= scopes.length && !output.unavailable.length && !interrupted;
    const item = evidence('PAPI', 'properties; local domain filter', { domain: input.domain }, {
      candidates: page.items,
      lookupStatus: candidates.length ? 'CANDIDATES_FOUND' : 'NO_NAME_MATCH_IN_BATCH',
      sources,
      coverage: { coverageScope: 'PROPERTY_NAME_CANDIDATES', scopeCount: scopes.length, startScopeOffset: input.scopeOffset, endScopeOffset: end, scopesSucceeded: sources.length, propertiesScanned, inventoryComplete, hostnameInventoryComplete: false, uniquenessEstablished: false },
      nextAction: page.items.length ? 'CONFIRM_HOSTNAME_ASSOCIATION' : nextCursor ? 'CONTINUE_SEARCH_WITH_NEXT_CURSOR' : 'CHECK_HOSTNAMES_OF_DIFFERENTLY_NAMED_PROPERTIES',
    });
    const { complete: batchPageComplete, ...pagination } = page.pagination;
    item.pagination = { ...pagination, batchPageComplete: batchPageComplete ?? false, mode: 'inventory_batch', scopeOffset: input.scopeOffset, maxScopes: batchSize, nextCursor };
    output.evidence.push(item);
    if (nextCursor || output.unavailable.length) output.status = 'partial';
    output.limitations.push('Filtro local literal por domínio nos nomes: domínio exato ou subdomínios, com sufixo de nome como _dsa. Nomes não confirmam associação CDN; properties com outros nomes podem atender o hostname.',
      'Confirme o hostname completo e o ambiente com get_hostname_overview. Para uma property, encerre a descoberta ao confirmar uma associação; para todas, percorra nextCursor. Erros de escopo deixam a cobertura parcial.',
      'O cursor relê o lote para paginar candidatas; o inventário pode mudar entre chamadas. Ausência de correspondência no nome não comprova ausência do hostname.');
    return output;
  }
}
