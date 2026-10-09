import { InvestigationError, publicError } from '../domain/errors.js';
import type { Evidence, InvestigationResult } from '../domain/results.js';
import type { JsonObject } from '../domain/json.js';
import type { ApiReply } from './ports.js';
import type { InvestigationContext } from './context.js';

export function apiEvidence(reply: ApiReply, resource: JsonObject, data = reply.data): Evidence {
  return { api: reply.api, operation: reply.operation, resource, data, retrievedAt: reply.retrievedAt, pagination: {}, limitations: [] };
}

export async function collect(
  output: InvestigationResult,
  component: string,
  resource: JsonObject,
  context: InvestigationContext,
  task: () => Promise<InvestigationResult>,
): Promise<void> {
  try {
    context.checkpoint();
    const part = await task();
    output.evidence.push(...part.evidence);
    output.inferences.push(...part.inferences);
    output.unavailable.push(...part.unavailable);
    output.limitations.push(...part.limitations);
    if (part.status !== 'success') output.status = 'partial';
  } catch (error) {
    context.checkpoint();
    if (error instanceof InvestigationError && error.code === 'BUDGET_EXCEEDED') throw error;
    output.status = 'partial';
    output.unavailable.push({ component, resource, error: publicError(error) });
  }
}
