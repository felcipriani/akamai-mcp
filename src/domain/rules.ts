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

function escapePointer(key: string): string { return key.replace(/~/g, '~0').replace(/\//g, '~1'); }

export function compareJson(before: JsonValue, after: JsonValue, offset: number, limit: number, checkpoint: () => void): JsonObject {
  const changes: JsonValue[] = [];
  let count = 0;
  let visited = 0;
  const add = (path: string, oldValue: JsonValue | undefined, newValue: JsonValue | undefined): void => {
    if (count++ < offset || changes.length >= limit) return;
    const entry: JsonObject = { path, kind: oldValue === undefined ? 'added' : newValue === undefined ? 'removed' : 'changed' };
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
  return { changes, pagination: { mode: 'local_diff', offset, limit, total: count, returned: changes.length, nextOffset }, comparison: 'structural_json', preservesArrayOrder: true };
}
