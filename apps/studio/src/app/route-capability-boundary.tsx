/**
 * The ROUTE capability boundary: the content-area companion to the shell's
 * capability-projected nav. The nav hides a token a scoped session cannot reach;
 * this seals the matching page so a direct URL to that same token does not render
 * a wall of reads the server would 403.
 *
 * It derives the current {@link FeatureToken} from the location by inverse lookup
 * of the {@link PATH} map (first-segment match under the shared segment-boundary
 * rule), then gates the routed `<Outlet/>` on the capability projection exactly as
 * the nav does:
 *
 * - loading  → a content Skeleton (mirrors the nav skeleton; never render a page
 *   whose reads may 403 before the gate is known).
 * - failed   → nothing (the nav's ErrorState + retry is the loud, single surface;
 *   fail closed).
 * - ready & covered → the page (`children`).
 * - ready & NOT covered → a static neutral panel; deliberately NOT a redirect, since
 *   the landing route may itself be uncovered (redirect-loop risk).
 *
 * A pathname that maps to NO token (the plugin catch-all `/plugins/*`) passes
 * through untouched — that surface gates itself via `contributionCovered`.
 */
import type { ReactNode } from 'react';
import { useLocation } from '@tanstack/react-router';
import { EmptyState, Skeleton, useCapabilities } from '@tai42/studio-sdk';

import { FEATURE_TOKENS, PATH, type FeatureToken } from './routes';
import { tokenCovered } from './token-requirements';

/**
 * The feature token backing a pathname, or `null` when none does (the plugin
 * catch-all). A token's single-segment {@link PATH} matches the pathname when it is
 * that path or a segment-nested descendant of it — the same segment-boundary rule
 * the projection coverage test uses, so `/tools/x` maps to `tools` while a sibling
 * like `/tools-schema` would not.
 */
function tokenForPathname(pathname: string): FeatureToken | null {
  return (
    FEATURE_TOKENS.find(
      (token) => pathname === PATH[token] || pathname.startsWith(`${PATH[token]}/`),
    ) ?? null
  );
}

/** Placeholder content shown while the capability projection loads, mirroring the
 * nav skeleton so the page reserves its space instead of flashing reads that 403.
 * Exported so the plugin page (which the boundary passes through) shows the same
 * loading placeholder while it mirrors this state machine. */
export function ContentSkeleton(): ReactNode {
  return (
    <div
      aria-hidden="true"
      data-testid="route-content-skeleton"
      style={{ display: 'grid', gap: 'var(--tai-space-4)' }}
    >
      <Skeleton width="30%" height={28} />
      <Skeleton height={120} />
      <Skeleton height={120} />
    </div>
  );
}

export function RouteCapabilityBoundary({ children }: { children: ReactNode }): ReactNode {
  const { pathname } = useLocation();
  const { state } = useCapabilities();

  // No backing token (e.g. `/plugins/*`) → pass through; that surface gates itself.
  const token = tokenForPathname(pathname);
  if (token === null) return <>{children}</>;

  // Mirror the nav: skeleton while loading, nothing on failure (the nav ErrorState is
  // the loud surface), and only render the page once the projection covers its token.
  if (state.status === 'loading') return <ContentSkeleton />;
  if (state.status === 'failed') return null;
  if (tokenCovered(state.projection, token)) return <>{children}</>;

  return <EmptyState title="This area isn't available for your session." />;
}
