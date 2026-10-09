import { setTimeout as delay } from 'node:timers/promises';
import type { Configuration } from '../configuration/config.js';
import { packageInfo } from '../configuration/package-info.js';
import type { InvestigationContext } from '../application/context.js';
import { InvestigationError } from '../domain/errors.js';
import { parseJson } from '../domain/json.js';
import { signEdgeGrid } from './edgegrid.js';
import { BoundedHttpClient } from './http.js';
import { permittedRequest } from '../domain/read-policy.js';
import type { Operation, Parameters, Query } from '../domain/read-policy.js';
import type { AkamaiReader, ApiReply } from '../application/ports.js';

export class AkamaiClient implements AkamaiReader {
  private nextSiemRequestAt = 0;
  private readonly http: BoundedHttpClient;

  constructor(private readonly configuration: Configuration) {
    this.http = new BoundedHttpClient(configuration.settings);
  }

  async read(operation: Operation, parameters: Parameters, query: Query, context: InvestigationContext, hostname?: string): Promise<ApiReply> {
    const request = permittedRequest(operation, parameters, query, hostname);
    const siem = operation === 'securityEvents';
    if (siem && !this.configuration.settings.siemEnabled) {
      throw new InvestigationError('FEATURE_NOT_ENABLED', 'Integração SIEM desabilitada localmente; habilite após confirmar contrato e coleta.', { scope: 'local_configuration' });
    }
    if (siem && this.configuration.settings.accountSwitchKey && this.configuration.siemCredentials === this.configuration.credentials) {
      throw new InvestigationError('CONFIGURATION_ERROR', 'SIEM não suporta accountSwitchKey. Configure credenciais SIEM da conta de destino.');
    }
    const credentials = siem ? this.configuration.siemCredentials : this.configuration.credentials;
    if (!credentials) throw new InvestigationError('CONFIGURATION_ERROR', 'Credenciais Akamai não configuradas. Configure pelo ambiente seguro; documentação pública e protocolo MCP permanecem disponíveis.');
    const url = new URL(request.path, `https://${credentials.host}`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    if (!siem && this.configuration.settings.accountSwitchKey) url.searchParams.set('accountSwitchKey', this.configuration.settings.accountSwitchKey);
    if (operation === 'propertyRules') url.searchParams.set('validateRules', 'false');
    if (operation === 'propertyVersionHostnames') url.searchParams.set('validateHostnames', 'false');
    const reply = await this.http.request(url, request.method, request.body, () => ({
      Authorization: signEdgeGrid(credentials, request.method, url, request.body),
      Accept: 'application/json', 'Content-Type': 'application/json',
      'User-Agent': `${packageInfo.name}/${packageInfo.version}`,
      ...(request.api === 'PAPI' ? { 'PAPI-Use-Prefixes': 'true' } : {}),
    }), context, request.api, operation, siem ? () => this.reserveSiemSlot(context) : undefined);
    const metadata = { text: reply.text, etag: reply.headers.get('etag'), retrievedAt: reply.retrievedAt, api: request.api, operation };
    if (siem) return { ...metadata, data: null };
    try { return { ...metadata, data: parseJson(reply.text) }; }
    catch { throw new InvestigationError('INVALID_RESPONSE', 'Resposta JSON inválida ou profunda demais.', { api: request.api, operation }); }
  }

  private async reserveSiemSlot(context: InvestigationContext): Promise<void> {
    const slot = Math.max(Date.now(), this.nextSiemRequestAt);
    this.nextSiemRequestAt = slot + 1000;
    const waitMs = slot - Date.now();
    if (waitMs > 0) await delay(waitMs, undefined, { signal: context.signal });
  }
}
