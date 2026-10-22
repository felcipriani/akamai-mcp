import { loadConfiguration } from '../src/configuration/config.js';
import type { Settings } from '../src/configuration/config.js';
import { InvestigationContext } from '../src/application/context.js';
import type { AkamaiReader, ApiReply } from '../src/application/ports.js';
import type { JsonValue } from '../src/domain/json.js';
import type { Operation, Parameters, Query } from '../src/domain/read-policy.js';
import { InvestigationError } from '../src/domain/errors.js';

export const fakeEnv = {
  AKAMAI_HOST: 'akab-test.luna.akamaiapis.net', AKAMAI_CLIENT_TOKEN: 'fake-client-token',
  AKAMAI_CLIENT_SECRET: 'fake-client-secret', AKAMAI_ACCESS_TOKEN: 'fake-access-token',
};
export const configuration = loadConfiguration(fakeEnv);
export const settings = configuration.settings;
export function context(overrides: Partial<Settings> = {}, signal = new AbortController().signal): InvestigationContext {
  return new InvestigationContext(signal, { ...settings, ...overrides }, new AbortController().signal);
}
export function code(expected: string): (error: unknown) => boolean {
  return error => error instanceof InvestigationError && error.code === expected;
}
export interface ReadCall { operation: Operation; parameters: Parameters; query: Query; hostname?: string | undefined }
export class FixtureReader implements AkamaiReader {
  readonly calls: ReadCall[] = [];
  constructor(private readonly fixture: (call: ReadCall) => JsonValue | Error) {}
  async read(operation: Operation, parameters: Parameters, query: Query, _context: InvestigationContext, hostname?: string): Promise<ApiReply> {
    const call = { operation, parameters, query, hostname };
    this.calls.push(call);
    const value = this.fixture(call);
    if (value instanceof Error) throw value;
    return { api: operation.startsWith('property') ? 'PAPI' : 'Application Security',
      operation, data: value, text: JSON.stringify(value),
      etag: 'fixture-etag', retrievedAt: '2026-10-09T12:00:00Z' };
  }
}
