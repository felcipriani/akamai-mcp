import { InvestigationError } from './errors.js';
import { asArray, asObject, selectFields } from './json.js';
import type { JsonObject, JsonValue } from './json.js';

export function behaviorEvidence(rules: JsonValue, names: string[], checkpoint: () => void): JsonValue[] {
  const output: JsonValue[] = [];
  let visited = 0;
  const walk = (value: JsonValue, pointer: string, ancestors: JsonValue[], depth: number): void => {
    checkpoint();
    if (++visited > 100000 || depth > 100) throw new InvestigationError('RESPONSE_TOO_LARGE', 'Árvore de regras excede o limite de análise.');
    const rule = asObject(value);
    const condition = { pointer, ...selectFields(rule, ['name', 'criteria', 'criteriaMustSatisfy', 'options']) };
    const conditions = [...ancestors, condition];
    asArray(rule['behaviors']).forEach((item, index) => {
      const behavior = asObject(item);
      if (names.length && !names.includes(String(behavior['name']))) return;
      output.push({ pointer: `${pointer}/behaviors/${index}`, behavior, ancestorConditions: conditions });
    });
    asArray(rule['children']).forEach((child, index) => walk(child, `${pointer}/children/${index}`, conditions, depth + 1));
  };
  walk(rules, '', [], 0);
  return output;
}

export type BehaviorFocus = 'overview' | 'cache' | 'origin' | 'headers' | 'all';

export function focusedBehaviors(entries: JsonValue[], focus: BehaviorFocus, names: string[]): JsonValue[] {
  return entries.filter(entry => {
    const name = String(asObject(asObject(entry)['behavior'])['name']);
    if (names.length) return names.includes(name);
    if (focus === 'all') return true;
    if (focus === 'cache') return /cache|caching/i.test(name);
    if (focus === 'origin') return /origin/i.test(name);
    if (focus === 'headers') return /header/i.test(name);
    return ['origin', 'caching', 'cacheId', 'cacheError'].includes(name);
  });
}

export function cdnOverview(entries: JsonValue[], requestedPath: string): JsonObject {
  const catalog = new Map<string, number>();
  for (const entry of entries) {
    const name = String(asObject(asObject(entry)['behavior'])['name'] ?? 'UNKNOWN');
    catalog.set(name, (catalog.get(name) ?? 0) + 1);
  }
  const named = (name: string) => entries.map(asObject).filter(entry => asObject(entry['behavior'])['name'] === name);
  const caching = named('caching');
  const modes = new Map<string, number>();
  for (const entry of caching) {
    const mode = String(asObject(asObject(entry['behavior'])['options'])['behavior'] ?? 'UNKNOWN');
    modes.set(mode, (modes.get(mode) ?? 0) + 1);
  }
  const timed = caching.filter(entry => asObject(asObject(entry['behavior'])['options'])['behavior'] === 'MAX_AGE');
  const examples = timed.slice(0, 3).map(entry => ({
    ...entry,
    cacheKeyDirectivesInSameRule: entries.map(asObject).filter(other => {
      const pointer = String(entry['pointer']).split('/behaviors/')[0];
      return String(other['pointer']).startsWith(`${pointer}/behaviors/`) && asObject(other['behavior'])['name'] === 'cacheId';
    }),
  }));
  return {
    kind: 'cdn_configuration_overview', analysisComplete: true, analysisScope: 'ENTIRE_FETCHED_RULE_TREE',
    totalBehaviorsAnalyzed: entries.length, requestedPath, pathEvaluated: false, runtimeVerified: false,
    behaviorCatalog: [...catalog].slice(0, 30).map(([name, count]) => ({ name, count })), behaviorCatalogComplete: catalog.size <= 30,
    cache: {
      cachingDirectiveCount: caching.length,
      storageModes: [...modes].map(([mode, count]) => ({ mode, count })),
      allCachingDirectivesAreNoStore: caching.length > 0 && modes.size === 1 && modes.has('NO_STORE'),
      timeBasedCachingRuleCount: timed.length,
      timeBasedCachingExamples: examples, examplesComplete: timed.length <= examples.length,
      errorCachingDirectiveCount: named('cacheError').length,
      applicability: 'Interpretar todos os critérios ancestrais, ordem e herança. MAX_AGE configurado não comprova TTL efetivo ou HIT. Includes e comportamento externo não foram expandidos.',
    },
    originDirectiveCount: named('origin').length,
    headerDirectiveCount: entries.filter(entry => /header/i.test(String(asObject(asObject(entry)['behavior'])['name']))).length,
  };
}

export function ruleOutline(rules: JsonValue, checkpoint: () => void): JsonObject[] {
  const rows: JsonObject[] = [];
  const walk = (value: JsonValue, pointer: string, depth: number): void => {
    checkpoint();
    if (rows.length > 100000 || depth > 100) throw new InvestigationError('RESPONSE_TOO_LARGE', 'Árvore excede o limite de outline.');
    const rule = asObject(value);
    rows.push({ pointer, name: rule['name'] ?? null, criteriaCount: asArray(rule['criteria']).length,
      behaviorNames: asArray(rule['behaviors']).map(item => asObject(item)['name'] ?? null), childCount: asArray(rule['children']).length });
    asArray(rule['children']).forEach((child, index) => walk(child, `${pointer}/children/${index}`, depth + 1));
  };
  walk(rules, '', 0);
  return rows;
}

function escapePointer(key: string): string { return key.replace(/~/g, '~0').replace(/\//g, '~1'); }

export function compareJson(before: JsonValue, after: JsonValue, offset: number, limit: number, checkpoint: () => void): JsonObject {
  const changes: JsonValue[] = [];
  let count = 0;
  let visited = 0;
  const kinds = { added: 0, removed: 0, changed: 0 };
  const add = (path: string, oldValue: JsonValue | undefined, newValue: JsonValue | undefined): void => {
    const kind = oldValue === undefined ? 'added' : newValue === undefined ? 'removed' : 'changed';
    kinds[kind]++;
    if (count++ < offset || changes.length >= limit) return;
    const entry: JsonObject = { path, kind };
    if (oldValue !== undefined) entry['before'] = oldValue;
    if (newValue !== undefined) entry['after'] = newValue;
    changes.push(entry);
  };
  const walk = (left: JsonValue | undefined, right: JsonValue | undefined, path: string, depth: number): void => {
    checkpoint();
    if (++visited > 200000 || depth > 128) throw new InvestigationError('RESPONSE_TOO_LARGE', 'Comparação excede o limite de complexidade.');
    if (left === right) return;
    if (Array.isArray(left) && Array.isArray(right)) {
      for (let index = 0; index < Math.max(left.length, right.length); index++) walk(left[index], right[index], `${path}/${index}`, depth + 1);
      return;
    }
    if (left !== null && right !== null && typeof left === 'object' && typeof right === 'object' && !Array.isArray(left) && !Array.isArray(right)) {
      const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
      for (const key of [...keys].sort()) walk(left[key], right[key], `${path}/${escapePointer(key)}`, depth + 1);
      return;
    }
    add(path, left, right);
  };
  walk(before, after, '', 0);
  const nextOffset = offset + changes.length < count ? offset + changes.length : null;
  return { changes, summary: { totalChanges: count, changeKinds: kinds, entireComparisonAnalyzed: true, runtimeEffectDetermined: false }, pagination: { mode: 'local_diff', offset, limit, total: count, returned: changes.length, nextOffset }, comparison: 'structural_json', preservesArrayOrder: true };
}
