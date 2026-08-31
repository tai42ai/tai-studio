/**
 * The minimal fixture app behind the router entry-state invariant test.
 *
 * It is a self-contained @tanstack/react-router app (three routes, NO backend, NO
 * Studio) that mirrors, in miniature, the ONE router behaviour the SDK's
 * per-history-entry state channel is built on: `router.navigate({ to, state })`
 * writes a custom bag into `window.history.state` under the same
 * `studioPluginEntryState` namespace the host uses, and the browser preserves it
 * across back / forward traversal AND a hard document reload.
 *
 * The page projects, into the DOM, exactly what the spec needs to read: the current
 * path, `useLocation().state`, and the RAW `window.history.state` (mirrored through a
 * store so the spec can compare the router's snapshot against what the browser
 * actually persisted).
 */
import { StrictMode, useSyncExternalStore, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  useLocation,
  useRouter,
} from '@tanstack/react-router';

/** The per-history-entry bag the fixture writes — the same namespace the Studio host
 *  stamps onto `history.state`, so the test reads the real channel's shape. */
interface EntryStateBag {
  readonly studioPluginEntryState: {
    readonly demo: { readonly count: number; readonly note: string };
  };
}

const DEMO_STATE: EntryStateBag = { studioPluginEntryState: { demo: { count: 42, note: 'hi' } } };

/**
 * Mirror `window.history.state` into React so the spec can read what the BROWSER
 * actually holds, independent of the router's own location snapshot. Subscribes to
 * `popstate` and to the two history mutators the router drives.
 */
function useHistoryState(): string {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener('popstate', onChange);
      const origPush = window.history.pushState.bind(window.history);
      const origReplace = window.history.replaceState.bind(window.history);
      window.history.pushState = (...args: Parameters<History['pushState']>) => {
        origPush(...args);
        onChange();
      };
      window.history.replaceState = (...args: Parameters<History['replaceState']>) => {
        origReplace(...args);
        onChange();
      };
      return () => {
        window.removeEventListener('popstate', onChange);
        window.history.pushState = origPush;
        window.history.replaceState = origReplace;
      };
    },
    () => JSON.stringify(window.history.state),
  );
}

function Panel({ label }: { label: string }): ReactElement {
  const location = useLocation();
  const router = useRouter();
  const histState = useHistoryState();
  return (
    <div>
      <h1 id="page">{label}</h1>
      <pre id="path">{location.pathname}</pre>
      <pre id="loc-state">{JSON.stringify(location.state)}</pre>
      <pre id="hist-state">{histState}</pre>
      <button
        id="go-b"
        type="button"
        onClick={() => {
          void router.navigate({ to: '/b', state: DEMO_STATE as never });
        }}
      >
        go b with state
      </button>
      <button
        id="go-c"
        type="button"
        onClick={() => {
          void router.navigate({ to: '/c' });
        }}
      >
        go c
      </button>
    </div>
  );
}

const rootRoute = createRootRoute({ component: () => <Outlet /> });
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <Panel label="index" />,
});
const bRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/b',
  component: () => <Panel label="b" />,
});
const cRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/c',
  component: () => <Panel label="c" />,
});

const routeTree = rootRoute.addChildren([indexRoute, bRoute, cRoute]);
const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById('root');
if (rootElement === null) throw new Error('missing #root');
createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
