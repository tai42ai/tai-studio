/**
 * The trigger-link expiry picker's choices and their mapping to the wire
 * `ttl_seconds`. Expiry is the creator's EXPLICIT choice: there is no default
 * option (the picker starts unselected; submitting without one is a loud error),
 * and `Permanent` maps to an explicit `null` — never `0` (the null-vs-0 trap: the
 * server reads `0` as a loud 400, `null` as a permanent link).
 */

/** A picker choice value (the RadioGroup option value). */
export type ExpiryChoice = 'permanent' | '3600' | '86400' | '604800' | 'custom';

export interface ExpiryOption {
  readonly value: ExpiryChoice;
  readonly label: string;
}

/** The picker options, in display order. No option is pre-selected. */
export const EXPIRY_OPTIONS: readonly ExpiryOption[] = [
  { value: 'permanent', label: 'Permanent' },
  { value: '3600', label: '1 hour' },
  { value: '86400', label: '1 day' },
  { value: '604800', label: '7 days' },
  { value: 'custom', label: 'Custom…' },
];

/** The fixed presets' `ttl_seconds` (a permanent link is an explicit `null`). */
const PRESET_TTL: Record<Exclude<ExpiryChoice, 'custom'>, number | null> = {
  permanent: null,
  '3600': 3600,
  '86400': 86400,
  '604800': 604800,
};

/**
 * Resolve a picker choice (+ the custom-seconds field when `custom`) to the wire
 * `ttl_seconds`. A custom value must be a POSITIVE INTEGER — `0`, a negative, a
 * fractional (`3600.5`), or a non-numeric value throws a LOUD message that blocks
 * submit; the store's physical upper bound is trusted to the server's 400. The
 * `Permanent` preset returns an explicit `null`.
 */
export function resolveTtlSeconds(choice: ExpiryChoice, customSeconds: string): number | null {
  if (choice !== 'custom') return PRESET_TTL[choice];
  const trimmed = customSeconds.trim();
  if (!/^\d+$/.test(trimmed) || Number(trimmed) <= 0) {
    throw new Error('Custom expiry must be a positive whole number of seconds.');
  }
  return Number(trimmed);
}
