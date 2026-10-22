import { asObject, stringValue } from './json.js';
import type { JsonValue } from './json.js';

export interface TimeWindow { fromTime?: string | undefined; toTime?: string | undefined }

export function filterTimeWindow(entries: JsonValue[], window: TimeWindow): { entries: JsonValue[]; unknownTimestampCount: number } {
  const from = window.fromTime ? Date.parse(window.fromTime) : -Infinity;
  const to = window.toTime ? Date.parse(window.toTime) : Infinity;
  let unknownTimestampCount = 0;
  const filtered = entries.filter(entry => {
    const row = asObject(entry);
    const value = stringValue(row['activationDate']) ?? stringValue(row['submitDate']);
    const time = value ? Date.parse(value) : NaN;
    if (!Number.isFinite(time)) { unknownTimestampCount++; return true; }
    return time >= from && time <= to;
  }).map(entry => {
    const row = asObject(entry);
    const value = stringValue(row['activationDate']) ?? stringValue(row['submitDate']);
    return !value || !Number.isFinite(Date.parse(value)) ? { ...row, timeWindowMembership: 'UNKNOWN' } : entry;
  });
  return { entries: filtered, unknownTimestampCount };
}
