import type { JsonObject } from './json.js';

export type ErrorCode = 'INVALID_INPUT' | 'AUTHENTICATION_FAILED' | 'PERMISSION_DENIED'
  | 'NOT_FOUND' | 'FEATURE_AVAILABILITY_UNKNOWN' | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR' | 'NETWORK_ERROR' | 'TIMEOUT' | 'CANCELLED' | 'RESPONSE_TOO_LARGE'
  | 'INVALID_RESPONSE' | 'OPERATION_NOT_ALLOWED' | 'BUDGET_EXCEEDED'
  | 'CONFIGURATION_ERROR' | 'INTERNAL_ERROR' | 'BUSY';

export class InvestigationError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: JsonObject = {},
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'InvestigationError';
  }
}

export function publicError(error: unknown): JsonObject {
  if (!(error instanceof InvestigationError)) {
    return { code: 'INTERNAL_ERROR', message: 'Falha interna; detalhes sensíveis omitidos.', retryable: false };
  }
  return { code: error.code, message: error.message, details: error.details, retryable: error.retryable };
}
