/**
 * The `/plugins/$pluginId/$` surface. Studio-plugin pages are NOT part of the
 * compile-time route tree — they resolve at runtime from the registry the plugin
 * bundles populated at import time. The route loader awaits the load pass, so by
 * the time this renders the gate has resolved: a cold deep link suspends on the
 * loader, then paints (no 404 on first paint).
 *
 * Loud-error contract: a plugin whose bundle failed (version mismatch / load
 * error) or a broken registry renders an error card, never a blank page; a request
 * for a plugin/path with no registered page renders a loud "not found" card.
 *
 * The route boundary passes `/plugins/*` through untouched, so this page owns its
 * own capability gate. It mirrors the {@link RouteCapabilityBoundary} state machine:
 * a loading projection shows the boundary's content skeleton (never the page, whose
 * reads would 403), a failed projection renders nothing (fail closed — the nav's
 * ErrorState is the loud surface), and only a ready projection reaches the
 * registry/plugin-error checks and the page's own contribution gate.
 */
import { useMemo, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { EmptyState, ErrorState, useCapabilities } from '@tai42/studio-sdk';
import type { RegisteredPage } from '@tai42/studio-sdk';
import { getContributions } from '@tai42/studio-sdk/host';
import { useLocation } from '@tanstack/react-router';

import { contributionCovered } from './token-requirements';
import { ContentSkeleton } from './route-capability-boundary';
import { resolvePluginPage, type PluginPageResolution } from './plugin-page-resolve';
import type { PluginLoader } from './plugin-loader';

export function PluginPage({
  loader,
  pluginId,
  path,
}: {
  loader: PluginLoader;
  pluginId: string;
  path: string;
}): ReactNode {
  const registryError = useStore(loader.store, (s) => s.registryError);
  const errors = useStore(loader.store, (s) => s.errors);
  const { state } = useCapabilities();
  // The RAW search of the current location. The plugin catch-all route declares no
  // `validateSearch` (TanStack's is compile-time per-route and cannot see a runtime
  // contribution's schema), so validation happens HERE against the matched page's
  // own schema — this is the unvalidated bag it validates.
  const rawSearch = useLocation({ select: (location) => location.search }) as Record<
    string,
    unknown
  >;

  const resolution = useMemo<PluginPageResolution>(() => {
    // Contributions are registered by the bundle at import time; the route loader
    // has already awaited the pass, so reading them here is deterministic. Resolution
    // is LONGEST-registered-prefix-wins; a page with no params schema matches only its
    // exact path (the pre-deep-link behavior).
    const pages: readonly RegisteredPage[] = getContributions().pages.filter(
      (page) => page.pluginId === pluginId,
    );
    return resolvePluginPage(pages, path, rawSearch);
  }, [pluginId, path, rawSearch]);
  // Mirror the route boundary's capability state machine before touching any
  // plugin data: while the projection is LOADING show the same content skeleton the
  // boundary uses (never the page), and on a FAILED projection render nothing (fail
  // closed — the shell nav's ErrorState is the loud, single surface). Only a ready
  // projection reaches the registry/plugin-error checks and the contribution gate.
  if (state.status === 'loading') return <ContentSkeleton />;
  if (state.status === 'failed') return null;

  if (registryError !== null) {
    return (
      <ErrorState message={`The Studio-plugin registry could not be loaded: ${registryError}`} />
    );
  }

  const pluginError = errors[pluginId];
  if (pluginError !== undefined) {
    return <ErrorState message={`Studio plugin “${pluginId}” failed to load: ${pluginError}`} />;
  }

  if (resolution.status === 'not-found') {
    return (
      <EmptyState
        title="Page not found"
        description={`No Studio-plugin page is registered at “${pluginId}/${path}”.`}
      />
    );
  }

  // A page matched by prefix but its sub-path or search failed the contribution's own
  // schema: render a LOUD error card, never a blank or half-populated view. The schema
  // parser's throw carries the reason.
  if (resolution.status === 'invalid') {
    return (
      <ErrorState message={`The link to “${pluginId}/${path}” is not valid: ${resolution.error}`} />
    );
  }

  const match = resolution.page;

  // A page is gated by its declared `requiredCapabilities` the same way its nav
  // entry is (absent ⇒ full projection only). A scoped session that does not cover
  // it sees a clear "not available" state, never the page — the server stays the
  // authority for the page's own data doors. The projection is `ready` here (loading
  // and failed returned above).
  if (!contributionCovered(state.projection, match.requiredCapabilities)) {
    return (
      <EmptyState
        title="Not available"
        description={`The Studio-plugin page “${pluginId}/${path}” is outside your session’s capabilities.`}
      />
    );
  }

  // Forward the validated sub-path `params` and `search` (present only when the page
  // declared a schema; a schemaless page receives neither, unchanged).
  const PageComponent = match.component;
  return (
    <PageComponent pluginId={pluginId} params={resolution.params} search={resolution.search} />
  );
}
