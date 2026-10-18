/**
 * Shared runtime type guards. Internal to studio-sdk — never re-exported from
 * `index.ts` or any subpath, so it stays off the public plugin surface.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `record[key]` when `key` is one of the record's own keys, else `undefined`. A key
 * that names a built-in object member (`toString`, `constructor`, `__proto__`) reads
 * only the record's own entry, never the inherited member.
 */
export function ownValue<T>(
  record: Readonly<Record<string, T>> | undefined,
  key: string,
): T | undefined {
  return record !== undefined && Object.hasOwn(record, key) ? record[key] : undefined;
}
