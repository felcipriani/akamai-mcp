import { InvestigationError } from './errors.js';
import type { JsonObject, JsonValue } from './json.js';

export interface Page { offset: number; limit: number }

export function localPage(items: JsonValue[], page: Page, cap: number): { items: JsonValue[]; pagination: JsonObject } {
  const limit = Math.min(page.limit, cap);
  const selected = items.slice(page.offset, page.offset + limit);
  const nextOffset = page.offset + selected.length < items.length ? page.offset + selected.length : null;
  return { items: selected, pagination: { mode: 'local', offset: page.offset, limit, total: items.length, returned: selected.length, nextOffset, complete: nextOffset === null && page.offset === 0 } };
}

export function jsonPointer(value: JsonValue, pointer: string): JsonValue {
  if (!pointer) return value;
  if (!pointer.startsWith('/')) throw new InvestigationError('INVALID_INPUT', 'subtreePointer deve ser JSON Pointer.');
  let current: JsonValue | undefined = value;
  for (const part of pointer.slice(1).split('/')) {
    if (/~(?:[^01]|$)/.test(part)) throw new InvestigationError('INVALID_INPUT', 'Escape JSON Pointer inválido.');
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new InvestigationError('INVALID_INPUT', 'JSON Pointer proibido.');
    if (Array.isArray(current)) current = /^(0|[1-9]\d*)$/.test(key) ? current[Number(key)] : undefined;
    else if (current !== null && typeof current === 'object' && current !== undefined) current = Object.hasOwn(current, key) ? current[key] : undefined;
    else current = undefined;
    if (current === undefined) throw new InvestigationError('NOT_FOUND', 'Subárvore não encontrada.');
  }
  return current;
}
