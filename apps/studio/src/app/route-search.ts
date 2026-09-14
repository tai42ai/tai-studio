/**
 * URL-search parsing for the shell's typed routes, plus {@link safeInternalPath}.
 * Every parser is tolerant: a malformed hand-edited value is dropped (or coerced)
 * rather than thrown, so a bad URL never breaks navigation — the route renders with
 * that field absent.
 */
import type { RouteSearch } from '@tai42/studio-sdk';

/**
 * A same-origin internal path safe to redirect to after login. Only an
 * unambiguous root-relative path is accepted: it must start with a single `/` and
 * carry no backslash or control character. A browser folds `\` to `/` and strips
 * tab/newline/CR from a URL before navigating, so a value like `/\evil.com` or
 * `/<tab>/evil.com` would otherwise normalize into a protocol-relative `//host`
 * cross-origin open redirect. Anything ambiguous — protocol-relative `//host`, an
 * absolute URL with a scheme/host, or a value not rooted at `/` — falls back to
 * the root `/`, where the capability-gated landing route picks the destination.
 */
export function safeInternalPath(raw: string | undefined): string {
  if (raw === undefined) return '/';
  // Reject backslashes (browsers fold `\` to `/`) and C0 control chars + DEL
  // (browsers strip tab/newline/CR from URLs), either of which can turn a
  // `/…`-looking value into a protocol-relative `//host` cross-origin redirect.
  // eslint-disable-next-line no-control-regex -- rejecting control chars is the point.
  if (/[\\\x00-\x1f\x7f]/.test(raw)) return '/';
  // Root-relative only, and never protocol-relative (`//host`).
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  return raw;
}

/** A finite string enum: returns the value only when it is one of `allowed`. */
export function parseEnum<T extends string>(raw: unknown, allowed: readonly T[]): T | undefined {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : undefined;
}

/** A finite number: coerces strings/numbers via `Number`, dropping NaN and non-finite. */
export function parseNumber(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Tags accepted as a JSON string array or a comma-separated list; blanks dropped. */
export function parseTags(raw: unknown): string[] | undefined {
  const fromString = (value: string): string[] => {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is string => typeof item === 'string');
        }
      } catch {
        // A malformed JSON array falls through to comma-splitting the raw string.
      }
    }
    return trimmed.split(',');
  };
  const values = Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string')
    : typeof raw === 'string'
      ? fromString(raw)
      : [];
  const tags = values.map((tag) => tag.trim()).filter((tag) => tag.length > 0);
  return tags.length > 0 ? tags : undefined;
}

/**
 * Parse the `/observability` URL search into its typed shape. Every field is
 * optional (a bare `/observability` is valid); malformed user-typed values are
 * dropped rather than thrown so a hand-edited URL never breaks navigation.
 */
export function parseObservabilitySearch(
  search: Record<string, unknown>,
): RouteSearch<'observability'> {
  return {
    tab: parseEnum(search.tab, ['dashboard', 'tracing'] as const),
    from: typeof search.from === 'string' ? search.from : undefined,
    to: typeof search.to === 'string' ? search.to : undefined,
    tags: parseTags(search.tags),
    status: parseEnum(search.status, ['error', 'success'] as const),
    minCost: parseNumber(search.minCost),
    maxCost: parseNumber(search.maxCost),
    minTokens: parseNumber(search.minTokens),
    maxTokens: parseNumber(search.maxTokens),
    minLatencyMs: parseNumber(search.minLatencyMs),
    maxLatencyMs: parseNumber(search.maxLatencyMs),
    sort: parseEnum(search.sort, ['createdAt', 'cost', 'latencyMs', 'totalTokens'] as const),
    dir: parseEnum(search.dir, ['asc', 'desc'] as const),
    trace: typeof search.trace === 'string' ? search.trace : undefined,
  };
}

/**
 * Parse the `/marketplace` URL search into its typed shape. Every field is
 * optional (a bare `/marketplace` is valid); malformed user-typed values are
 * dropped rather than thrown so a hand-edited URL never breaks navigation.
 */
export function parseMarketplaceSearch(
  search: Record<string, unknown>,
): RouteSearch<'marketplace'> {
  return {
    tab: parseEnum(search.tab, ['browse', 'installed'] as const),
    q: typeof search.q === 'string' ? search.q : undefined,
    kind: typeof search.kind === 'string' ? search.kind : undefined,
    category: typeof search.category === 'string' ? search.category : undefined,
    tags: parseTags(search.tags),
    sort: parseEnum(search.sort, ['downloads', 'updated', 'name', 'relevance'] as const),
    plugin: typeof search.plugin === 'string' ? search.plugin : undefined,
  };
}
