import type { Settings } from '../configuration/config.js';
import type { InvestigationContext } from '../application/context.js';
import type { DocumentationProduct, DocumentationSource, DocumentReply } from '../application/ports.js';
import { InvestigationError } from '../domain/errors.js';
import { BoundedHttpClient } from './http.js';

const allowedSections: Record<DocumentationProduct, readonly string[]> = {
  'property-mgr': ['reference', 'docs'],
  'application-security': ['reference', 'changelog'],
  'siem-integration': ['reference', 'docs'],
};

export class PublicDocumentationSource implements DocumentationSource {
  private readonly http: BoundedHttpClient;

  constructor(settings: Settings) { this.http = new BoundedHttpClient(settings); }

  async index(product: DocumentationProduct, section: string, context: InvestigationContext): Promise<DocumentReply> {
    if (!allowedSections[product]?.includes(section)) throw new InvestigationError('OPERATION_NOT_ALLOWED', 'Índice documental não permitido.');
    return this.read(`/${product}/${section}/llms.txt`, context);
  }

  async page(documentationId: string, context: InvestigationContext): Promise<DocumentReply> {
    if (!/^(property-mgr|application-security|siem-integration)\/(reference|docs|changelog)\/[a-z0-9][a-z0-9-]{0,180}$/.test(documentationId)) {
      throw new InvestigationError('OPERATION_NOT_ALLOWED', 'Página documental fora da política.');
    }
    return this.read(`/${documentationId}.md`, context);
  }

  private async read(path: string, context: InvestigationContext): Promise<DocumentReply> {
    const url = new URL(path, 'https://techdocs.akamai.com');
    const reply = await this.http.request(url, 'GET', '', () => ({ Accept: 'text/markdown,text/plain' }), context, 'Akamai TechDocs', 'documentation_read');
    return { text: reply.text, retrievedAt: reply.retrievedAt, url: url.href };
  }
}
