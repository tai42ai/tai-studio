/**
 * A pending save's age as an operator reads it: "3 minutes ago" for an ISO instant. A value
 * that does not parse renders verbatim rather than collapsing into a placeholder that hides it.
 */
const RELATIVE_TIME = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** Largest-first, so the first unit whose span the gap reaches is the one used. */
const RELATIVE_UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
];

/** "3 minutes ago" / "now" for an ISO instant; `nowMs` is injectable so a render is deterministic. */
export function formatAge(iso: string, nowMs: number = Date.now()): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const deltaSeconds = (ms - nowMs) / 1000;
  for (const [unit, span] of RELATIVE_UNITS) {
    if (Math.abs(deltaSeconds) >= span) {
      return RELATIVE_TIME.format(Math.round(deltaSeconds / span), unit);
    }
  }
  return RELATIVE_TIME.format(0, 'second');
}
