/**
 * The authenticated shell chrome, wired onto the design-system layout classes:
 * a 232 px sidebar beside the scrolling content column at >=1024, a 72 px labelled
 * icon rail from 640, and a sticky 56 px mobile top bar below 640 whose hamburger
 * opens the navigation in a modal drawer. The routed feature page renders in the
 * `<Outlet/>` inside the centred content column.
 *
 * The nav is a PROJECTION of the caller's capabilities (`useCapabilities`): a full
 * projection shows every token, a scoped session shows only the tokens whose backing
 * routes it can reach, loading shows a skeleton, and a `/me` failure shows a loud
 * retryable ErrorState — never an optimistic full nav (the UI fails closed exactly
 * as the server would). The plugin load pass, the route-change focus move, and
 * sign-out live in their own hooks; the nav body, chrome pieces, and content column
 * are their own components.
 *
 * The three-state theme control is rendered ONCE per breakpoint — in the sidebar
 * footer at >=640, in the top bar below 640 — never both in one DOM. Sign-out lives
 * in the sidebar footer at >=640 and in the drawer footer below 640.
 */
import { InteractionsBadge } from '@tai42/feature-interactions';
import {
  coversAnyRoute,
  Drawer,
  isFullProjection,
  MenuIcon,
  PageFillProvider,
  useBreakpoint,
  useCapabilities,
} from '@tai42/studio-sdk';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { importMapIntegrityEnforced } from './integrity';
import { NavBody } from './nav-body';
import type { PluginLoader } from './plugin-loader';
import { Brand, ShellMain, SignOutButton, ThemeControl } from './shell-chrome';
import { usePluginLoadPass } from './use-plugin-load-pass';
import { useRouteChangeFocus } from './use-route-change-focus';
import { useSignOut } from './use-sign-out';

/** The interactions surface the floating badge subscribes to over SSE; a scoped
 * session mounts the badge only when its projection reaches it (fail closed — an
 * uncovered session would otherwise open a stream the server 403s). */
const INTERACTIONS_ROUTE = '/api/interactions';

export function ShellLayout({ loader }: { loader: PluginLoader }): ReactNode {
  const { state, retry } = useCapabilities();
  const { band, isPhone } = useBreakpoint();
  const integrityEnforced = useMemo(() => importMapIntegrityEnforced(), []);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The drawer is a phone-only affordance: its opener (the top-bar hamburger) is
  // hidden at >=640. A drawer left open across a widen would be an orphaned modal
  // and a second VISIBLE "Primary" landmark beside the re-shown sidebar, so close
  // it the moment the band leaves phone.
  useEffect(() => {
    if (!isPhone) setDrawerOpen(false);
  }, [isPhone]);
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const { visibleNavEntries, pluginVersions } = usePluginLoadPass(loader, state);

  // The globally-mounted interactions badge opens an SSE the instant it mounts, so
  // it gates on the projection like the nav does: a scoped session without
  // interactions access never mounts it. While loading/failed it stays absent.
  const interactionsVisible =
    state.status === 'ready' &&
    (isFullProjection(state.projection) || coversAnyRoute(state.projection, [INTERACTIONS_ROUTE]));

  useRouteChangeFocus(closeDrawer);
  const signOut = useSignOut();

  return (
    <div className="tai-shell">
      <a href="#main-content" className="tai-skip-link">
        Skip to content
      </a>

      <aside className="tai-shell-sidebar">
        <Brand />
        <NavBody
          state={state}
          retry={retry}
          visibleNavEntries={visibleNavEntries}
          pluginVersions={pluginVersions}
        />
        {isPhone ? null : (
          <div
            style={{
              marginTop: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--tai-space-3)',
            }}
          >
            <ThemeControl orientation={band === 'compact' ? 'vertical' : 'horizontal'} />
            <SignOutButton compact={band === 'compact'} onSignOut={signOut} />
          </div>
        )}
      </aside>

      <header className="tai-topbar">
        <Brand />
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}>
          {isPhone ? <ThemeControl orientation="horizontal" /> : null}
          <Drawer
            title="Navigation"
            side="left"
            open={drawerOpen}
            onOpenChange={setDrawerOpen}
            trigger={
              <button type="button" className="tai-icon-btn" aria-label="Open navigation">
                <MenuIcon />
              </button>
            }
          >
            <div className="tai-stack">
              <NavBody
                state={state}
                retry={retry}
                visibleNavEntries={visibleNavEntries}
                pluginVersions={pluginVersions}
              />
              <div style={{ marginTop: 'var(--tai-space-2)' }}>
                <SignOutButton compact={false} onSignOut={signOut} />
              </div>
            </div>
          </Drawer>
        </div>
      </header>

      <PageFillProvider>
        <ShellMain integrityEnforced={integrityEnforced} />
      </PageFillProvider>

      {interactionsVisible ? <InteractionsBadge /> : null}
    </div>
  );
}
