import type { JsonObject, JsonValue } from './json.js';

export interface Evidence {
  api: string;
  operation: string;
  resource: JsonObject;
  retrievedAt: string;
  data: JsonValue;
  pagination: JsonObject;
  limitations: string[];
}

export interface InvestigationResult {
  status: 'success' | 'partial' | 'error';
  evidence: Evidence[];
  inferences: JsonObject[];
  unavailable: JsonObject[];
  limitations: string[];
}

export function result(evidence: Evidence[], limitations: string[] = []): InvestigationResult {
  return { status: 'success', evidence, inferences: [], unavailable: [], limitations };
}

export function evidence(
  api: string,
  operation: string,
  resource: JsonObject,
  data: JsonValue,
  pagination: JsonObject = {},
  limitations: string[] = [],
): Evidence {
  return { api, operation, resource, data, pagination, limitations, retrievedAt: new Date().toISOString() };
}
