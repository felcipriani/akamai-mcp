import * as z from 'zod/v4';
import { InvestigationError } from '../domain/errors.js';

const hostname = z.string().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+akamaiapis\.net$/i);
const token = z.string().min(1).max(2048).regex(/^[A-Za-z0-9_./+=-]+$/);
const credentialsSchema = z.object({ host: hostname, clientToken: token, clientSecret: token, accessToken: token });
export type Credentials = z.infer<typeof credentialsSchema>;

const settingsSchema = z.object({
  requestTimeoutMs: z.coerce.number().int().min(1000).max(60000).default(30000),
  toolTimeoutMs: z.coerce.number().int().min(1000).max(300000).default(120000),
  maxRetries: z.coerce.number().int().min(0).max(3).default(2),
  maxRetryDelayMs: z.coerce.number().int().min(100).max(30000).default(10000),
  maxResponseBytes: z.coerce.number().int().min(65536).max(16777216).default(8388608),
  maxToolBytes: z.coerce.number().int().min(8192).max(524288).default(131072),
  maxResults: z.coerce.number().int().min(1).max(500).default(100),
  maxRequestsPerTool: z.coerce.number().int().min(1).max(100).default(30),
  maxConcurrentTools: z.coerce.number().int().min(1).max(8).default(4),
  siemEnabled: z.enum(['true', 'false']).default('false').transform(value => value === 'true'),
  accountSwitchKey: z.string().regex(/^[A-Za-z0-9:_-]{1,256}$/).optional(),
});

export type Settings = z.infer<typeof settingsSchema>;
export interface Configuration { credentials: Credentials | null; siemCredentials: Credentials | null; settings: Settings }

function loadCredentials(env: NodeJS.ProcessEnv, prefix: string): Credentials {
  const parsed = credentialsSchema.safeParse({
    host: env[`${prefix}HOST`],
    clientToken: env[`${prefix}CLIENT_TOKEN`],
    clientSecret: env[`${prefix}CLIENT_SECRET`],
    accessToken: env[`${prefix}ACCESS_TOKEN`],
  });
  if (!parsed.success) throw new InvestigationError('CONFIGURATION_ERROR', `Credenciais ausentes ou inválidas para ${prefix}. Valores omitidos.`);
  return parsed.data;
}

export function loadConfiguration(env: NodeJS.ProcessEnv = process.env): Configuration {
  const keys = ['HOST', 'CLIENT_TOKEN', 'CLIENT_SECRET', 'ACCESS_TOKEN'];
  const hasCredentials = keys.some(key => Boolean(env[`AKAMAI_${key}`]));
  const credentials = hasCredentials ? loadCredentials(env, 'AKAMAI_') : null;
  const siemKeys = ['HOST', 'CLIENT_TOKEN', 'CLIENT_SECRET', 'ACCESS_TOKEN'];
  const hasSiemCredentials = siemKeys.some(key => Boolean(env[`AKAMAI_SIEM_${key}`]));
  const siemCredentials = hasSiemCredentials ? loadCredentials(env, 'AKAMAI_SIEM_') : credentials;
  const parsed = settingsSchema.safeParse({
    requestTimeoutMs: env['AKAMAI_REQUEST_TIMEOUT_MS'], toolTimeoutMs: env['AKAMAI_TOOL_TIMEOUT_MS'],
    maxRetries: env['AKAMAI_MAX_RETRIES'], maxRetryDelayMs: env['AKAMAI_MAX_RETRY_DELAY_MS'],
    maxResponseBytes: env['AKAMAI_MAX_RESPONSE_BYTES'], maxToolBytes: env['AKAMAI_MAX_TOOL_BYTES'],
    maxResults: env['AKAMAI_MAX_RESULTS'], maxRequestsPerTool: env['AKAMAI_MAX_REQUESTS_PER_TOOL'],
    maxConcurrentTools: env['AKAMAI_MAX_CONCURRENT_TOOLS'], siemEnabled: env['AKAMAI_SIEM_ENABLED'],
    accountSwitchKey: env['AKAMAI_ACCOUNT_SWITCH_KEY'] || undefined,
  });
  if (!parsed.success) throw new InvestigationError('CONFIGURATION_ERROR', 'Limites ou opções de execução inválidos. Consulte .env.example.');
  return { credentials, siemCredentials, settings: parsed.data };
}
