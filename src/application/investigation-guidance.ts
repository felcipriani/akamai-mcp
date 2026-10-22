import { asArray, asObject, selectFields, stringValue } from '../domain/json.js';
import type { JsonObject } from '../domain/json.js';
import type { InvestigationResult } from '../domain/results.js';

export interface GuidedResult extends InvestigationResult { coverage: JsonObject; nextActions: JsonObject[] }

export function investigationGuidance(tool: string, input: JsonObject, output: InvestigationResult): GuidedResult {
  const actions: JsonObject[] = [];
  const seen = new Set<string>();
  const add = (nextTool: string, args: JsonObject, reason: string, required = true) => {
    const action = { tool: nextTool, arguments: args, reason, requiredForExhaustiveDetails: required };
    const key = JSON.stringify(action);
    if (!seen.has(key)) { seen.add(key); actions.push(action); }
  };
  const overview = output.inferences.find(item => item['kind'] === 'cdn_configuration_overview');
  const comparison = tool === 'compare_property_versions' ? output.inferences.find(item => item['kind'] === 'configuration_comparison_overview') : undefined;
  let pending = 0;
  let unknownTimes = 0;
  for (const source of output.evidence) {
    const p = source.pagination;
    const r = source.resource;
    if (typeof p['unknownTimestampCount'] === 'number') unknownTimes += p['unknownTimestampCount'];
    let nextTool = tool;
    let args = { ...input };
    if (tool === 'investigate_configuration_change') {
      if (source.operation === 'propertyActivations') nextTool = 'get_property_activation_history';
      else if (source.operation === 'securityActivations') nextTool = 'get_security_activation_history';
      else nextTool = source.api === 'PAPI' ? 'compare_property_versions' : 'investigate_configuration_change';
      if (nextTool !== tool) {
        args = selectFields(r, ['propertyId', 'contractId', 'groupId', 'configId', 'fromVersion', 'toVersion', 'subtreePointer', 'fromTime', 'toTime']);
        for (const key of Object.keys(args)) if (args[key] === null) delete args[key];
        args['limit'] = input['limit'] ?? 50;
      } else if (source.operation.startsWith('securityExport')) {
        args = { security: selectFields(r, ['configId', 'fromVersion', 'toVersion']), limit: input['limit'] ?? 50 };
      }
    }
    if (tool === 'get_hostname_overview' && source.api === 'Application Security') {
      nextTool = source.operation === 'securityConfigurations' ? 'list_security_configurations' : 'get_security_policy';
      args = source.operation === 'securityConfigurations' ? {} : selectFields(r, ['configId', 'version', 'policyId']);
      for (const key of Object.keys(args)) if (args[key] === null) delete args[key];
      if (r['section']) args['sections'] = [r['section']];
    }
    if (typeof r['section'] === 'string' && ['get_security_policy', 'get_rate_limiting_configuration'].includes(nextTool)) args['sections'] = [r['section']];
    if (asObject(source.data)['view'] === 'outline') {
      args['view'] = 'outline';
      for (const node of asArray(asObject(source.data)['nodes']).map(asObject).filter(node => node['pointer'] !== '' && node['pointer'] !== input['subtreePointer']).slice(0, 3)) {
        add('get_property_configuration', { ...selectFields(input, ['propertyId', 'contractId', 'groupId', 'environment']), version: r['version'] ?? null, subtreePointer: node['pointer'] ?? '', view: 'auto' }, `Ler a subárvore ${String(node['name'])}; outline não contém o conteúdo completo das regras.`, false);
      }
    }
    if (p['nextCursor'] && typeof p['nextCursor'] === 'object') {
      pending++; add(nextTool, { ...args, ...asObject(p['nextCursor']) }, 'Continuar o inventário; esta consulta cobre somente o lote indicado.');
    } else if (typeof p['nextOffset'] === 'number') {
      pending++; add(nextTool, { ...args, offset: p['nextOffset'] }, overview ? 'Detalhes adicionais; o panorama já analisou a árvore inteira.' : 'Continuar a seção/lista antes de afirmar ausência ou lista completa.');
    } else if (typeof p['nextScopeOffset'] === 'number') {
      pending++; add(nextTool, { ...args, scopeOffset: p['nextScopeOffset'], offset: 0 }, 'Consultar o próximo escopo de properties.');
    }
    if (typeof p['nextCharacter'] === 'number') {
      pending++; add(nextTool, { ...args, startCharacter: p['nextCharacter'] }, 'Ler a continuação do documento antes de concluir sobre o conteúdo completo.');
    }
    if (p['mode'] === 'upstream_page' && typeof p['totalSize'] === 'number' && typeof p['page'] === 'number' && typeof p['pageSize'] === 'number' && p['page'] * p['pageSize'] < p['totalSize']) {
      pending++; add(nextTool, { ...args, page: p['page'] + 1 }, 'Continuar versões de segurança.');
    }
    if (typeof p['nextLink'] === 'string') {
      pending++;
      try {
        const link = new URL(p['nextLink'], 'https://continuation.invalid');
        const offset = Number(link.searchParams.get('offset'));
        if (link.searchParams.has('offset') && Number.isSafeInteger(offset) && offset >= 0 && offset <= 1000000) add(nextTool, { ...args, offset }, 'Continuar pelos parâmetros permitidos; não executar a URL retornada pela fonte.');
      } catch { /* An invalid source link must not discard available evidence. */ }
    }
    if (source.operation === 'search_public_indexes') {
      for (const entry of asArray(source.data).map(asObject).slice(0, 3)) {
        if (typeof entry['id'] === 'string') add('get_akamai_documentation', { documentationId: entry['id'] }, 'Ler a referência encontrada; o índice contém somente título e descrição.', false);
      }
    }
    if (source.operation === 'securityPolicies') {
      const policies = asArray(asObject(source.data)['policies']).map(asObject);
      for (const policy of policies.slice(0, 5)) {
        const policyId = stringValue(policy['policyId']);
        if (policyId) add('get_security_policy', { configId: r['configId'] ?? null, version: r['version'] ?? null, policyId }, 'Consultar a policy identificada; o catálogo não contém seus controles ou ações.');
      }
    }
  }
  if (tool === 'search_properties_by_domain') {
    const candidates = output.evidence.flatMap(item => asArray(asObject(item.data)['candidates'])).map(asObject);
    for (let index = 0; index < candidates.length; index += 5) add('get_hostname_overview', {
      hostname: input['domain'] ?? '', properties: candidates.slice(index, index + 5).map(item => selectFields(item, ['propertyId', 'contractId', 'groupId'])),
    }, 'Se domain for o hostname completo, confirmar as candidatas. Para domínio pai, forneça o hostname completo desejado.');
  }
  for (const inference of output.inferences) {
    if (inference['kind'] === 'rate_limiting_configuration_overview' && inference['actionsConsulted'] === false && !output.unavailable.some(item => item['component'] === 'rate_actions')) {
      const scope = selectFields(inference, ['configId', 'version', 'environment']);
      if (typeof inference['policyId'] === 'string') {
        add('get_rate_limiting_configuration', { ...scope, policyId: inference['policyId'], sections: ['actions'] }, 'Consultar as ações da policy conhecida na mesma versão; definições não comprovam habilitação.', false);
      } else add('get_security_policy', { ...scope, sections: ['policy'] }, 'Descobrir policyId na mesma versão para consultar ações; definições não comprovam habilitação.', false);
    }
    if (inference['kind'] !== 'hostname_association' || inference['associationStatus'] !== 'CONFIRMED') continue;
    if (tool === 'get_hostname_overview') add('explain_cdn_behavior', {
      ...selectFields(inference, ['propertyId', 'hostname', 'environment']),
      ...Object.fromEntries(['contractId', 'groupId'].filter(key => inference[key] !== null && inference[key] !== undefined).map(key => [key, inference[key]!])),
      path: '/', focus: 'overview',
    }, 'Ler o panorama da configuração confirmada; informe o path do pedido quando houver.');
  }
  const nameSearch = tool === 'search_properties_by_domain';
  const hostnameCheck = tool === 'get_hostname_overview';
  const outline = output.inferences.some(item => item['kind'] === 'property_configuration_outline');
  const startsAfterBeginning = output.evidence.some(source => ['offset', 'startCharacter', 'scopeOffset'].some(key => typeof source.pagination[key] === 'number' && source.pagination[key] > 0)
    || (typeof source.pagination['page'] === 'number' && source.pagination['page'] > 1));
  const detailsComplete = pending === 0 && !startsAfterBeginning;
  const status = output.status === 'error' ? 'error' : output.status === 'partial' || !detailsComplete || unknownTimes > 0 ? 'partial' : 'success';
  return {
    ...output, status,
    coverage: {
      scope: nameSearch ? 'PROPERTY_NAME_CANDIDATES' : hostnameCheck ? 'SUPPLIED_RESOURCE_CANDIDATES' : 'REQUESTED_RESOURCES',
      analysisComplete: overview?.['analysisComplete'] ?? comparison?.['entireComparisonAnalyzed'] ?? (!outline && detailsComplete && output.unavailable.length === 0 && status === 'success'),
      detailsComplete, pendingContinuations: pending, unavailableSources: output.unavailable.length,
      includesEarlierPages: !startsAfterBeginning,
      unknownTimeRecords: unknownTimes,
      configurationOnly: !tool.includes('documentation'), runtimeVerified: false,
      ...(nameSearch || hostnameCheck ? { hostnameInventoryComplete: false, uniquenessEstablished: false } : {}),
      conclusionLimits: [
        ...(pending ? ['Não afirmar lista exaustiva dos detalhes sem percorrer as continuações.'] : []),
        ...(startsAfterBeginning ? ['Esta resposta não inclui páginas anteriores ao offset/page solicitado; considere as páginas já consultadas na conversa.'] : []),
        ...(nameSearch || hostnameCheck ? ['Uma associação confirmada não demonstra unicidade. A busca por nome não examina hostnames de properties com outros nomes.'] : []),
        ...(output.unavailable.length ? ['Fontes indisponíveis não demonstram ausência de configuração.'] : []),
        ...(unknownTimes ? ['Registros com timeWindowMembership=UNKNOWN não comprovam ocorrência dentro da janela.'] : []),
        'Dados configurados não comprovam aplicação efetiva, tráfego ou causalidade.',
      ],
    },
    nextActions: actions,
  };
}
