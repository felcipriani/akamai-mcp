import { createHash, createHmac, randomUUID } from 'node:crypto';
import type { Credentials } from '../configuration/config.js';

function hmac(value: string, key: string): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('base64');
}

export function signEdgeGrid(credentials: Credentials, method: 'GET' | 'POST', url: URL, body: string, instant: { timestamp: string; nonce: string } = {
  timestamp: new Date().toISOString().replace(/-/g, '').replace(/\.\d{3}Z$/, '+0000'), nonce: randomUUID(),
}): string {
  const { timestamp, nonce } = instant;
  const authorization = `EG1-HMAC-SHA256 client_token=${credentials.clientToken};access_token=${credentials.accessToken};timestamp=${timestamp};nonce=${nonce};`;
  const contentHash = method === 'POST' && body.length > 0
    ? createHash('sha256').update(Buffer.from(body, 'utf8').subarray(0, 131072)).digest('base64')
    : '';
  const canonicalRequest = [method, 'https', url.host, url.pathname + url.search, '', contentHash, authorization].join('\t');
  return `${authorization}signature=${hmac(canonicalRequest, hmac(timestamp, credentials.clientSecret))}`;
}
