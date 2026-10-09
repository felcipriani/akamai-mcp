import type { Settings } from '../configuration/config.js';
import { InvestigationError } from '../domain/errors.js';

export class InvestigationContext {
  readonly signal: AbortSignal;
  private requests = 0;

  constructor(signal: AbortSignal, private readonly settings: Settings, shutdown: AbortSignal) {
    this.signal = AbortSignal.any([signal, shutdown, AbortSignal.timeout(settings.toolTimeoutMs)]);
  }

  checkpoint(): void {
    if (!this.signal.aborted) return;
    const reason: unknown = this.signal.reason;
    const timeout = reason instanceof Error && reason.name === 'TimeoutError';
    throw new InvestigationError(timeout ? 'TIMEOUT' : 'CANCELLED', timeout ? 'Prazo da investigação excedido.' : 'Investigação cancelada.');
  }

  consumeRequest(): void {
    this.checkpoint();
    if (++this.requests > this.settings.maxRequestsPerTool) {
      throw new InvestigationError('BUDGET_EXCEEDED', 'Limite de requisições desta ferramenta atingido. Reduza o escopo.');
    }
  }
}
