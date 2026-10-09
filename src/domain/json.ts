import { InvestigationError } from './errors.js';

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asObject(value: JsonValue | undefined): JsonObject {
  if (isObject(value)) return value as JsonObject;
  return {};
}

export function asArray(value: JsonValue | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

export function stringValue(value: JsonValue | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

export function positiveVersion(value: JsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function parseJson(text: string): JsonValue {
  const value: unknown = JSON.parse(text);
  return toJson(value);
}

export function toJson(value: unknown, depth = 0): JsonValue {
  if (depth > 128) throw new Error('JSON_DEPTH_LIMIT');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item: unknown) => toJson(item, depth + 1));
  if (!isObject(value)) throw new Error('INVALID_JSON_VALUE');
  const result: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (item !== undefined) result[key] = toJson(item, depth + 1);
  }
  return result;
}

export function nestedItems(value: JsonValue, key: string): JsonValue[] {
  const items = asObject(asObject(value)[key])['items'];
  if (!Array.isArray(items)) throw new InvestigationError('INVALID_RESPONSE', `Resposta sem ${key}.items.`);
  return items;
}

export function selectFields(value: JsonObject, keys: readonly string[]): JsonObject {
  const result: JsonObject = {};
  for (const key of keys) {
    const item = value[key];
    if (item !== undefined) result[key] = item;
  }
  return result;
}
