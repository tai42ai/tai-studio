/** Shared formatting for a subject row's epoch-seconds `updated_at` (the Updated cell). */

/** The Updated cell's display for a subject row's epoch-seconds `updated_at`: the locale
 * instant, or the raw value when unparseable (the full ISO rides on the cell's `title`). */
export function formatWhen(epochSeconds: number): string {
  const parsed = new Date(epochSeconds * 1000);
  return Number.isNaN(parsed.getTime()) ? String(epochSeconds) : parsed.toLocaleString();
}

/** The full ISO instant for a subject row's `updated_at`, for the Updated cell's `title`
 * (undefined when the epoch is unparseable, so the cell carries no title). */
export function isoWhen(epochSeconds: number): string | undefined {
  const parsed = new Date(epochSeconds * 1000);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
