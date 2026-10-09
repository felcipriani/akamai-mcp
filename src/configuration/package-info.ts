import { readFileSync } from 'node:fs';
import * as z from 'zod/v4';

export const packageInfo = z.object({ name: z.string(), version: z.string() }).parse(
  JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')),
);
