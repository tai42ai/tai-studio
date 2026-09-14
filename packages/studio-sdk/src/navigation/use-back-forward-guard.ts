/**
 * The browser back/forward and full-unload arm of the navigation guard. While any
 * guard is armed it intercepts `popstate` — canceling the move by re-pushing the
 * committed entry, consulting the guards once, and replaying the move on approval —
 * and installs a `beforeunload` prompt. It attaches the listeners only while armed,
 * mirroring the registry's armed state into React.
 */
import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

import type { NavigationGuardRegistry } from './guard-registry';
import type { CommittedEntry } from './guarded-navigation';

export function useBackForwardGuard(
  registry: NavigationGuardRegistry,
  committedRef: RefObject<CommittedEntry | null>,
): void {
  // Mirror the registry's armed state into React so the browser listeners attach only
  // while at least one guard is armed.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    setArmed(registry.hasArmedGuards());
    return registry.subscribe(() => {
      setArmed(registry.hasArmedGuards());
    });
  }, [registry]);

  useEffect(() => {
    if (!armed) return;

    // The protected entry (URL + state); a back/forward landing elsewhere is first
    // canceled back to here while the guard is consulted.
    committedRef.current = { href: window.location.href, state: window.history.state };
    // Set while replaying a guard-approved back/forward, so its `popstate` passes
    // through instead of being re-intercepted.
    let bypass = false;
    // Latched while a decision is pending, so a second Back mid-decision keeps canceling
    // without starting a concurrent `registry.run()` — one gesture, one dialog.
    let pending = false;
    // Restore pushes stacked for the pending decision, so an approved replay unwinds
    // exactly that far in one `go(-depth)`. Reset per decision.
    let restores = 0;

    const onPopState = () => {
      if (bypass) {
        bypass = false;
        committedRef.current = { href: window.location.href, state: window.history.state };
        return;
      }
      if (!registry.hasArmedGuards()) {
        committedRef.current = { href: window.location.href, state: window.history.state };
        return;
      }
      const committed = committedRef.current;
      if (committed === null) return;
      // Cancel the browser's move by pushing the committed entry on top of wherever it
      // landed. popstate exposes no direction/distance and the router owns
      // `history.state`, so restore can only push, not delete. A vetoed forward thus
      // strands a stub entry — an accepted limit the next pushState truncates.
      window.history.pushState(committed.state, '', committed.href);
      restores += 1;
      if (pending) return;
      pending = true;
      void registry.run().then((allowed) => {
        pending = false;
        const depth = restores;
        restores = 0;
        if (!allowed) return;
        bypass = true;
        window.history.go(-depth);
      });
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Browsers below the floor (Chrome 108) gate the prompt on a set `returnValue`,
      // not `preventDefault` alone; the string is ignored. Typed deprecated, still required.
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- required beforeunload trigger for the supported browser range.
      event.returnValue = '';
    };

    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      committedRef.current = null;
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [armed, registry, committedRef]);
}
