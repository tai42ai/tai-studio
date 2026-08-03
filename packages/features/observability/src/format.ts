/**
 * Null-safe display formatters for the observability surfaces. Every metric on
 * the dashboard and the runs table flows through one of these so a missing value
 * never renders as "NaN", "null", or a misleading "0". Zero is a real value (a
 * run can genuinely cost $0); only null / undefined / NaN produce the placeholder.
 */

export const EMPTY_PLACEHOLDER = '—';

function isMissing(value: number | null | undefined): value is null | undefined {
  return value === null || value === undefined || Number.isNaN(value);
}

/** "1234ms" / "1.2s" / "—". */
export function formatLatencyMs(value: number | null | undefined): string {
  if (isMissing(value)) return EMPTY_PLACEHOLDER;
  if (value < 1000) return `${String(Math.round(value))}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

/** "$0.0042" for cents-level, "$0.84" mid, "$12.40" high. */
export function formatCost(value: number | null | undefined): string {
  if (isMissing(value)) return EMPTY_PLACEHOLDER;
  if (value === 0) return '$0';
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(2)}`;
}

/** "1,234" / "—". */
export function formatTokenCount(value: number | null | undefined): string {
  if (isMissing(value)) return EMPTY_PLACEHOLDER;
  return value.toLocaleString();
}

/**
 * A time-series bucket / run timestamp rendered for humans. The wire value is an
 * ISO string (or null for an unbucketed aggregate); an unparseable value is shown
 * verbatim rather than swallowed.
 */
export function formatTimestamp(value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return EMPTY_PLACEHOLDER;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

/** A short numeric label for a chart axis/tooltip, keyed by the plotted metric. */
export function formatMetricValue(metric: string, value: number): string {
  switch (metric) {
    case 'cost':
      return formatCost(value);
    case 'avgLatencyMs':
      return formatLatencyMs(value);
    case 'totalTokens':
    case 'runs':
    default:
      return formatTokenCount(value);
  }
}

/** A compact, escaped one-line preview of an arbitrary run input/output value. */
export function previewValue(value: unknown): string {
  if (value === null || value === undefined) return EMPTY_PLACEHOLDER;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text.length <= 80) return text;
  return `${text.slice(0, 80)}…`;
}

/** Parse a string as JSON, or null when it is not valid JSON. */
function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * The structured tree behind a run preview, or null when the value has no
 * structure to expand. The backend already ships previews as bounded PARSED trees,
 * so an object/array is returned as-is (rather than discarded to an 80-char
 * string); a string that is itself JSON is parsed so it can be explored too, and a
 * plain scalar/string returns null — its inline one-liner is the whole story.
 */
export function previewTree(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    const parsed = tryParseJson(value);
    return parsed !== null && typeof parsed === 'object' ? parsed : null;
  }
  return null;
}
