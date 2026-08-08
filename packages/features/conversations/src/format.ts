/**
 * Display formatters for the conversation monitor. The wire carries FLOAT EPOCH
 * SECONDS (not ISO strings), so every timestamp on screen goes through these:
 * a relative label for scanning a list, and the absolute local rendering as the
 * title beside it. A non-finite value is shown verbatim rather than swallowed
 * into a placeholder that hides bad data.
 */

/** Shown where a value is genuinely absent (an unanswered exchange, no address). */
export const EMPTY_PLACEHOLDER = '—';

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** Largest-first, so the first unit whose span the gap reaches is the one used. */
const UNITS: readonly (readonly [Intl.RelativeTimeFormatUnit, number])[] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
];

/**
 * "3 minutes ago" / "in 2 hours" / "now" for an epoch-seconds instant. `nowMs`
 * is injectable so a render is deterministic under test.
 */
export function formatRelativeEpoch(seconds: number, nowMs: number = Date.now()): string {
  if (!Number.isFinite(seconds)) return String(seconds);
  const delta = seconds - nowMs / 1000;
  for (const [unit, span] of UNITS) {
    if (Math.abs(delta) >= span) return RELATIVE.format(Math.round(delta / span), unit);
  }
  return RELATIVE.format(0, 'second');
}

/**
 * Pinned to `en`, unlike the relative formatter above: the nouns handed to
 * {@link countOf} are English literals written in the calling component, so the
 * category must be chosen by English's rules whatever locale the browser runs in.
 */
const PLURAL = new Intl.PluralRules('en');

/**
 * "1 thread" / "2 threads" — a count with its noun agreeing. Announcements are
 * SPOKEN, where a mismatched noun is heard rather than skimmed past.
 */
export function countOf(count: number, singular: string, plural: string): string {
  return `${String(count)} ${PLURAL.select(count) === 'one' ? singular : plural}`;
}

/** The full local rendering of an epoch-seconds instant — the relative label's title. */
export function formatAbsoluteEpoch(seconds: number): string {
  if (!Number.isFinite(seconds)) return String(seconds);
  return new Date(seconds * 1000).toLocaleString();
}
