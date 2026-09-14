/**
 * Human-readable instant formatting for the worker fleet: a relative "3 minutes ago"
 * seen-since label and a full absolute rendering for the tooltip. A value that does
 * not parse renders verbatim rather than collapsing into a placeholder that hides bad
 * data.
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

/** "3 minutes ago" / "now" for an ISO instant. `nowMs` is injectable so a render is
 * deterministic under test. */
export function formatRelativeInstant(iso: string, nowMs: number = Date.now()): string {
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

/** The full local rendering of an ISO instant — the seen-since / last-op tooltip. */
export function formatAbsoluteInstant(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString();
}
