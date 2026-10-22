export function normalizedHostname(value: string): string {
  return value.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
}
