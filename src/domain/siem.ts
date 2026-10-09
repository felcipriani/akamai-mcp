import { isIP } from 'node:net';
import { InvestigationError } from './errors.js';
import { asObject, parseJson, selectFields, stringValue } from './json.js';
import type { JsonObject, JsonValue } from './json.js';

export interface EventFilters {
  hostname?: string | undefined;
  clientIp?: string | undefined;
  requestId?: string | undefined;
  path?: string | undefined;
  action?: string | undefined;
  policyId?: string | undefined;
  ruleId?: string | undefined;
  httpStatus?: number | undefined;
}

export function normalizedHostname(value: string): string {
  return value.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
}

function ipKey(value: string): string {
  if (isIP(value) === 6) {
    try { return new URL(`http://[${value}]/`).hostname; } catch { return value.toLowerCase(); }
  }
  return value;
}

function decodedFacet(value: JsonValue | undefined): string[] {
  if (value === undefined) return [];
  if (typeof value !== 'string') throw new InvestigationError('INVALID_RESPONSE', 'Facet SIEM não é string.');
  try {
    return decodeURIComponent(value).split(';').map(chunk => {
      if (chunk === '') return '';
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(chunk) || chunk.length % 4 === 1) throw new Error('INVALID_BASE64');
      return Buffer.from(chunk, 'base64').toString('utf8');
    });
  } catch { throw new InvestigationError('INVALID_RESPONSE', 'Codificação de facet SIEM inválida.'); }
}

export function normalizeEvent(raw: JsonValue): JsonObject {
  const event = asObject(raw);
  const attack = asObject(event['attackData']);
  const http = asObject(event['httpMessage']);
  if (!stringValue(http['requestId']) || !stringValue(attack['configId'])) throw new InvestigationError('INVALID_RESPONSE', 'Evento SIEM sem identificadores esperados.');
  const facets = {
    ruleId: decodedFacet(attack['rules']),
    version: decodedFacet(attack['ruleVersions']),
    action: decodedFacet(attack['ruleActions']),
    message: decodedFacet(attack['ruleMessages']),
    tag: decodedFacet(attack['ruleTags']),
  };
  const count = facets.ruleId.length;
  const mismatchedFacets = Object.values(facets).some(items => items.length !== count);
  const rules: JsonObject[] = [];
  for (let index = 0; index < count; index++) rules.push({
    ruleId: facets.ruleId[index] ?? null,
    version: facets.version[index] ?? null,
    action: facets.action[index] ?? null,
    message: facets.message[index] ?? null,
    tag: facets.tag[index] ?? null,
  });
  return {
    configId: attack['configId'] ?? null, policyId: attack['policyId'] ?? null,
    clientIp: attack['clientIP'] ?? null, appliedAction: attack['appliedAction'] ?? null,
    http: selectFields(http, ['requestId', 'host', 'path', 'method', 'start', 'status', 'protocol', 'port', 'tls', 'bytes']),
    rules,
    decodingLimitations: mismatchedFacets ? ['Quantidade desigual de facets; campos ausentes preservados como null.'] : [],
  };
}

export function eventMatches(event: JsonObject, filters: EventFilters): boolean {
  const http = asObject(event['http']);
  if (filters.hostname && normalizedHostname(String(http['host'])) !== filters.hostname) return false;
  if (filters.clientIp && ipKey(String(event['clientIp'])) !== ipKey(filters.clientIp)) return false;
  if (filters.requestId && http['requestId'] !== filters.requestId) return false;
  if (filters.path && http['path'] !== filters.path) return false;
  if (filters.action && String(event['appliedAction']).toLowerCase() !== filters.action.toLowerCase()) return false;
  if (filters.policyId && event['policyId'] !== filters.policyId) return false;
  if (filters.httpStatus && Number(http['status']) !== filters.httpStatus) return false;
  if (filters.ruleId && !Array.isArray(event['rules'])) return false;
  if (filters.ruleId && Array.isArray(event['rules']) && !event['rules'].some(rule => asObject(rule)['ruleId'] === filters.ruleId)) return false;
  return true;
}

export function parseEventStream(text: string, checkpoint: () => void): { events: JsonObject[]; context: JsonObject } {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (!lines.length) throw new InvestigationError('INVALID_RESPONSE', 'SIEM devolveu resposta vazia, sem offset context.');
  const last = lines.pop();
  let context: JsonObject;
  try { context = asObject(parseJson(last ?? '')); }
  catch { throw new InvestigationError('INVALID_RESPONSE', 'Offset context SIEM inválido.'); }
  if (typeof context['total'] !== 'number' || typeof context['offset'] !== 'string' || context['attackData']) {
    throw new InvestigationError('INVALID_RESPONSE', 'SIEM sem linha final de contexto. Resposta pode estar incompleta; repita a consulta original com limit menor.');
  }
  const events = lines.map(line => {
    checkpoint();
    try { return normalizeEvent(parseJson(line)); }
    catch (error) {
      if (error instanceof InvestigationError) throw error;
      throw new InvestigationError('INVALID_RESPONSE', 'Linha JSON SIEM inválida.');
    }
  });
  if (context['total'] !== events.length) throw new InvestigationError('INVALID_RESPONSE', 'Total SIEM diverge das linhas recebidas. Nenhum offset de continuação liberado.');
  return { events, context };
}
