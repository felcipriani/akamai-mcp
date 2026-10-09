import { setTimeout as delay } from 'node:timers/promises';
import type { Settings } from '../configuration/config.js';
import type { InvestigationContext } from '../application/context.js';
import { InvestigationError } from '../domain/errors.js';
import { asObject, parseJson, selectFields } from '../domain/json.js';

export interface HttpReply { text: string; headers: Headers; retrievedAt: string }
export type HeaderFactory = () => Record<string, string>;

async function boundedBody(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new InvestigationError('RESPONSE_TOO_LARGE', 'Resposta excede o limite de bytes. Reduza o escopo.', { maxBytes });
      }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    reader.releaseLock();
  }
}

function retryDelay(response: Response, attempt: number, cap: number): number | null {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    const milliseconds = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(milliseconds) && milliseconds > cap) return null;
    if (Number.isFinite(milliseconds)) return Math.max(0, milliseconds);
  }
  return Math.min(cap, 500 * 2 ** attempt + Math.floor(Math.random() * 250));
}

function upstreamError(status: number, text: string, api: string, operation: string): InvestigationError {
  let problem = {};
  try { problem = selectFields(asObject(parseJson(text)), ['type', 'title', 'requestId']); } catch { problem = {}; }
  const details = { api, operation, httpStatus: status, problem };
  if (status === 401) return new InvestigationError('AUTHENTICATION_FAILED', 'Autenticação recusada pela API.', details);
  if (status === 403) return new InvestigationError('PERMISSION_DENIED', 'API recusou acesso; isso não comprova ausência de licença.', details);
  if (status === 404) return new InvestigationError('NOT_FOUND', 'Recurso não encontrado; escopo ou disponibilidade podem influenciar a resposta.', details);
  if (status === 416) return new InvestigationError('OFFSET_EXPIRED', 'Offset SIEM expirado; consulte um período dentro da retenção.', details);
  if (status === 428) return new InvestigationError('FEATURE_AVAILABILITY_UNKNOWN', 'Pré-condição da API não satisfeita. Verifique a configuração SIEM.', details);
  if (status === 429) return new InvestigationError('RATE_LIMITED', 'Limite de requisições atingido.', details, true);
  return new InvestigationError('UPSTREAM_ERROR', 'API retornou erro.', details, status >= 500);
}

export class BoundedHttpClient {
  constructor(private readonly settings: Settings) {}

  async request(
    url: URL,
    method: 'GET' | 'POST',
    body: string,
    headers: HeaderFactory,
    context: InvestigationContext,
    api: string,
    operation: string,
    beforeAttempt: () => Promise<void> = async () => {},
  ): Promise<HttpReply> {
    for (let attempt = 0; attempt <= this.settings.maxRetries; attempt++) {
      context.consumeRequest();
      await beforeAttempt();
      context.checkpoint();
      const timeout = AbortSignal.timeout(this.settings.requestTimeoutMs);
      const signal = AbortSignal.any([context.signal, timeout]);
      try {
        const init: RequestInit = { method, headers: headers(), signal, redirect: 'manual' };
        if (method === 'POST') init.body = body;
        const response = await fetch(url, init);
        const text = await boundedBody(response, this.settings.maxResponseBytes);
        if (response.ok) return { text, headers: response.headers, retrievedAt: new Date().toISOString() };
        const error = upstreamError(response.status, text, api, operation);
        if (![429, 502, 503, 504].includes(response.status) || attempt === this.settings.maxRetries) throw error;
        const waitMs = retryDelay(response, attempt, this.settings.maxRetryDelayMs);
        if (waitMs === null) throw error;
        await delay(waitMs, undefined, { signal: context.signal });
      } catch (error) {
        context.checkpoint();
        if (error instanceof InvestigationError) throw error;
        if (timeout.aborted) throw new InvestigationError('TIMEOUT', 'Timeout da requisição.', { api, operation }, true);
        if (attempt === this.settings.maxRetries) throw new InvestigationError('NETWORK_ERROR', 'Falha de rede; dados internos omitidos.', { api, operation }, true);
        await delay(Math.min(this.settings.maxRetryDelayMs, 500 * 2 ** attempt), undefined, { signal: context.signal });
      }
    }
    throw new InvestigationError('INTERNAL_ERROR', 'Fluxo de requisição encerrado inesperadamente.');
  }
}
