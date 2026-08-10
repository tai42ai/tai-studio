/**
 * The `/` landing route. Capabilities are UNKNOWABLE before authentication, so
 * the app cannot pick a fixed post-login destination up front. Instead the login
 * default returnTo is `/`, and this route resolves the caller's capability
 * projection and replace-navigates to the FIRST feature entry the projection
 * covers, iterating {@link FEATURE_TOKENS} (Dashboard first by construction).
 *
 * A covered target ALWAYS exists — the `settings` token is `'always'`-covered —
 * so there is no "no access" state; the worst case lands on Settings. The
 * navigation REPLACES history (a push would trap Back on `/`), which also makes
 * it read as an initial-load navigation, so the shell's route-change focus move
 * correctly stands down for it.
 *
 *   loading → a skeleton placeholder;
 *   ready   → replace-navigate to the first covered entry;
 *   failed  → the shell's own retry treatment, plus a sign-out escape.
 */
import { useEffect, type ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button, ErrorState, Skeleton, useAuth, useCapabilities } from '@tai42/studio-sdk';

import { FEATURE_TOKENS, PATH } from './routes';
import { tokenCovered } from './token-requirements';

export function LandingRoute(): ReactNode {
  const { state, retry } = useCapabilities();
  const { logout } = useAuth();
  const navigate = useNavigate();

  // The first covered entry under a ready projection; Dashboard leads the list,
  // and `settings` guarantees the search never comes back empty.
  const target =
    state.status === 'ready'
      ? FEATURE_TOKENS.find((token) => tokenCovered(state.projection, token))
      : undefined;

  useEffect(() => {
    if (target !== undefined) void navigate({ href: PATH[target], replace: true });
  }, [target, navigate]);

  if (state.status === 'failed') {
    return (
      <div className="tai-stack">
        <ErrorState
          message="Your access could not be loaded. Retry to reload, or sign out."
          onRetry={retry}
        />
        <div>
          <Button variant="secondary" onClick={logout}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  // Loading, or ready and navigating away: a skeleton stands in until the
  // destination route takes over. It carries no accessible content of its own —
  // the landed page is what the operator reads.
  return (
    <div className="tai-stack" aria-hidden="true" data-testid="landing-skeleton">
      <Skeleton height={28} width="30%" />
      <Skeleton height={16} width="60%" />
      <Skeleton height={16} width="45%" />
    </div>
  );
}
