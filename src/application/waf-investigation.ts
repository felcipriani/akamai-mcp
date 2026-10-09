import type { Settings } from '../configuration/config.js';
import { InvestigationError } from '../domain/errors.js';
import { asArray, asObject } from '../domain/json.js';
import { localPage } from '../domain/pagination.js';
import { eventMatches, parseEventStream } from '../domain/siem.js';
import type { EventFilters } from '../domain/siem.js';
import { result } from '../domain/results.js';
import type { InvestigationResult } from '../domain/results.js';
import { apiEvidence } from './common.js';
import type { AkamaiReader } from './ports.js';
import type { InvestigationContext } from './context.js';

export interface WafQuery extends EventFilters {
  configIds: number[];
  from?: number | undefined;
  to?: number | undefined;
  offset?: string | undefined;
  apiLimit: number;
  resultOffset: number;
  limit: number;
}

const limitations = [
  'Retenção documentada: últimas 12 horas, com cerca de 5 segundos de latência. Coleta SIEM precisa estar habilitada para as configurações e políticas.',
  'Filtros de IP, hostname, path, requestId, ação, policyId, regra e status são locais, aplicados somente à página recebida. A API não aceita esses filtros.',
  'Modo temporal usa horário de armazenamento, não necessariamente horário do evento. Eventos tardios e latência impedem alegar cobertura completa.',
  'Nenhum evento encontrado não comprova ausência de bloqueio. Alertas e respostas 403 não comprovam, isoladamente, bloqueio do WAF.',
  'Headers, query string, apiKey, ruleData e ruleSelectors foram omitidos para reduzir exposição de dados sensíveis.',
];

export class WafInvestigation {
  constructor(private readonly reader: AkamaiReader, private readonly settings: Settings) {}

  async events(input: WafQuery, context: InvestigationContext): Promise<InvestigationResult> {
    this.validatePeriod(input);
    const query = input.offset !== undefined
      ? { offset: input.offset, limit: input.apiLimit }
      : { from: input.from, to: input.to, limit: input.apiLimit };
    const reply = await this.reader.read('securityEvents', { configIds: input.configIds.join(';') }, query, context);
    const stream = parseEventStream(reply.text, () => context.checkpoint());
    const matching = stream.events.filter(event => eventMatches(event, input));
    const page = localPage(matching, { offset: input.resultOffset, limit: input.limit }, this.settings.maxResults);
    const nextResultOffset = page.pagination['nextOffset'] ?? null;
    const item = apiEvidence(reply, {
      configIds: input.configIds, period: { from: input.from ?? null, to: input.to ?? null },
      inputOffset: input.offset ?? null,
      filters: {
        hostname: input.hostname ?? null, clientIp: input.clientIp ?? null, path: input.path ?? null,
        requestId: input.requestId ?? null, action: input.action ?? null, policyId: input.policyId ?? null,
        ruleId: input.ruleId ?? null, httpStatus: input.httpStatus ?? null,
      },
    }, page.items);
    item.pagination = {
      mode: input.offset === undefined ? 'siem_time' : 'siem_offset',
      apiLimit: input.apiLimit, scanned: stream.events.length, matching: matching.length,
      returned: page.items.length, resultOffset: input.resultOffset, nextResultOffset,
      nextOffset: nextResultOffset === null ? stream.context['offset'] ?? null : null,
      offsetContext: stream.context,
      apiLimitReached: stream.context['limit'] !== undefined,
      timeWindowCoverage: 'not_guaranteed',
    };
    item.limitations = nextResultOffset !== null ? ['Consuma páginas locais usando a mesma consulta e nextResultOffset antes de avançar offset. Releituras da página podem variar; não há snapshot persistente.'] : [];
    return result([item], limitations);
  }

  async request(input: WafQuery & { requestId: string }, context: InvestigationContext): Promise<InvestigationResult> {
    const output = await this.events(input, context);
    const matches = asArray(output.evidence[0]?.data).map(asObject);
    const denied = matches.filter(event => String(event['appliedAction']).toLowerCase() === 'deny');
    output.inferences.push({
      kind: 'request_correlation', requestId: input.requestId,
      assessment: denied.length ? 'siem_reports_deny_for_matching_request' : matches.length ? 'siem_events_found_without_final_deny' : 'insufficient_evidence',
      evidenceIndexes: [0],
      limitations: ['Correlação por requestId exato na página. Não determina comportamento fora dos configIds e do período informados. A ação final tem precedência sobre facets de regra.'],
    });
    return output;
  }

  private validatePeriod(input: WafQuery): void {
    if (input.offset !== undefined) {
      if (input.from !== undefined || input.to !== undefined) throw new InvestigationError('INVALID_INPUT', 'offset não pode coexistir com from/to.');
      return;
    }
    if (input.from === undefined || input.to === undefined) throw new InvestigationError('INVALID_INPUT', 'Informe from e to em epoch seconds, ou apenas offset.');
    const now = Math.floor(Date.now() / 1000);
    if (input.from >= input.to || input.from < now - 43200 || input.to > now - 5) {
      throw new InvestigationError('INVALID_INPUT', 'Período deve estar nas últimas 12 horas, com from < to e to pelo menos 5 segundos anterior ao presente.');
    }
  }
}
