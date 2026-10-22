import type { JsonValue } from '../domain/json.js';
import type { Operation, Parameters, Query } from '../domain/read-policy.js';
import type { InvestigationContext } from './context.js';

export interface ApiReply {
  api: string;
  operation: Operation;
  data: JsonValue;
  text: string;
  etag: string | null;
  retrievedAt: string;
}

export interface AkamaiReader {
  read(operation: Operation, parameters: Parameters, query: Query, context: InvestigationContext): Promise<ApiReply>;
}

export type DocumentationProduct = 'property-mgr' | 'application-security';
export interface DocumentReply { text: string; retrievedAt: string; url: string }
export interface DocumentationSource {
  index(product: DocumentationProduct, section: string, context: InvestigationContext): Promise<DocumentReply>;
  page(documentationId: string, context: InvestigationContext): Promise<DocumentReply>;
}
