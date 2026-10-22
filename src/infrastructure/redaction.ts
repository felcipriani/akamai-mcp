import type { Configuration } from '../configuration/config.js';
import { asObject } from '../domain/json.js';
import type { JsonValue, JsonObject } from '../domain/json.js';

const sensitiveKey = /(?:authorization|cookie|password|passwd|secret|private.?key|api.?key|access.?token|client.?token|session.?token|auth.?token|signature)/i;
const sensitiveHeader = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key)$/i;

export class Redactor {
  private readonly secrets: string[];

  constructor(configuration: Configuration) {
    const credentials = configuration.credentials;
    this.secrets = [...new Set(credentials ? [
      credentials.clientToken, credentials.clientSecret, credentials.accessToken,
    ] : [])].filter(value => value.length > 0).sort((left, right) => right.length - left.length);
  }

  text(value: string): string {
    let clean = value;
    for (const secret of this.secrets) clean = clean.replaceAll(secret, '[REDACTED]');
    return clean.replace(/EG1-HMAC-SHA256\s+[^\r\n]+/g, '[REDACTED_EDGEGRID]');
  }

  json(value: JsonValue): JsonValue {
    if (typeof value === 'string') return this.text(value);
    if (value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(item => this.json(item));
    const result: JsonObject = Object.create(null) as JsonObject;
    const headerName = value['headerName'] ?? value['name'];
    const sensitiveNamedValue = typeof headerName === 'string' && sensitiveHeader.test(headerName);
    for (const [key, item] of Object.entries(value)) {
      result[this.text(key)] = sensitiveKey.test(key) || (sensitiveNamedValue && /^(value|headerValue|newHeaderValue)$/i.test(key))
        ? '[REDACTED]'
        : this.json(item);
    }
    const options = asObject(value['options']);
    const namedHeader = options['customHeaderName'] ?? options['headerName'];
    if (typeof namedHeader === 'string' && sensitiveHeader.test(namedHeader) && result['options']) {
      const redactedOptions = asObject(result['options']);
      for (const key of ['customHeaderValue', 'headerValue', 'newHeaderValue', 'value']) {
        if (Object.hasOwn(redactedOptions, key)) redactedOptions[key] = '[REDACTED]';
      }
    }
    return result;
  }
}

export function logEvent(event: string, fields: { tool?: string; code?: string; status?: string } = {}): void {
  process.stderr.write(`${JSON.stringify({ timestamp: new Date().toISOString(), event, ...fields })}\n`);
}
