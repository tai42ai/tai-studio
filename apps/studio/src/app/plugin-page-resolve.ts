/**
 * Runtime resolution of a plugin-page URL to a registered contribution.
 *
 * Studio-plugin pages are NOT compile-time routes; they resolve here from the
 * registry the plugin populated at import time. Resolution is LONGEST registered
 * `path` prefix wins: a page that declared a {@link PluginPageParamsSchema} is
 * addressable under its `path` prefix and consumes the remainder as its `params`
 * input; a page with NO schema (or a schema without `parseParams`) matches only its
 * EXACT path — the pre-deep-link behavior, unchanged.
 *
 * Validation lives here rather than in the route because TanStack's `validateSearch`
 * is compile-time per-route and cannot see a runtime contribution's schema. A schema
 * parser that THROWS yields an `invalid` resolution (the caller renders a loud error
 * card); a page that never declared a schema forwards neither `params` nor `search`.
 */
import type { RegisteredPage } from '@tai42/studio-sdk';

export type PluginPageResolution =
  | { readonly status: 'not-found' }
  | { readonly status: 'invalid'; readonly page: RegisteredPage; readonly error: string }
  | {
      readonly status: 'matched';
      readonly page: RegisteredPage;
      readonly params: Record<string, unknown> | undefined;
      readonly search: Record<string, unknown> | undefined;
    };

/** A page that matched the URL, carrying the sub-path remainder after its prefix. */
interface Candidate {
  readonly page: RegisteredPage;
  readonly remainder: string;
}

/**
 * Whether the URL `path` is covered by `prefix` under the `/`-boundary rule: an exact
 * match, or a strictly deeper sub-path (`prefix/…`). The boundary stops `flow` from
 * matching `flowers`. This is the single-winner prefix semantic shared with the shell
 * nav's active-entry highlight (see `shell-layout.tsx`).
 */
export function pathHasPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Whether `page` can consume a non-empty sub-path remainder (declared a param parser). */
function acceptsSubPath(page: RegisteredPage): boolean {
  return page.params?.parseParams !== undefined;
}

/** The candidate pages the URL `path` matches, each with its post-prefix remainder. */
function candidatesFor(pages: readonly RegisteredPage[], path: string): Candidate[] {
  const matches: Candidate[] = [];
  for (const page of pages) {
    if (path === page.path) {
      matches.push({ page, remainder: '' });
    } else if (acceptsSubPath(page) && pathHasPrefix(path, page.path)) {
      matches.push({ page, remainder: path.slice(page.path.length + 1) });
    }
  }
  return matches;
}

/**
 * Resolve `path` (the splat under `/plugins/{pluginId}/`) + `rawSearch` against the
 * plugin's registered pages. `pages` must already be filtered to the owning plugin.
 */
export function resolvePluginPage(
  pages: readonly RegisteredPage[],
  path: string,
  rawSearch: Record<string, unknown>,
): PluginPageResolution {
  const candidates = candidatesFor(pages, path);
  if (candidates.length === 0) return { status: 'not-found' };

  // Longest registered prefix wins; a tie cannot happen (paths are unique per plugin).
  candidates.sort((a, b) => b.page.path.length - a.page.path.length);
  const winner = candidates[0];
  if (winner === undefined) return { status: 'not-found' };
  const { page, remainder } = winner;
  const schema = page.params;

  let params: Record<string, unknown> | undefined;
  let search: Record<string, unknown> | undefined;
  try {
    if (schema?.parseParams !== undefined) params = schema.parseParams(remainder);
    if (schema?.parseSearch !== undefined) search = schema.parseSearch(rawSearch);
  } catch (error) {
    return {
      status: 'invalid',
      page,
      error: error instanceof Error ? error.message : String(error),
    };
  }
  return { status: 'matched', page, params, search };
}
