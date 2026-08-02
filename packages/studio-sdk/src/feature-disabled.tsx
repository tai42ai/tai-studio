/**
 * The shared "this DB-backed feature is not configured" client idiom — one helper,
 * every consumer.
 *
 * A deployment leaves a database-backed feature cleanly OFF by configuring no store
 * for it. The skeleton then answers that feature's WRITES with an HTTP 501
 * `NotSupportedError` carrying a machine code ending `-not-configured`
 * (`<feature>-not-configured`); collection reads stay 200-empty and named reads
 * 404, so only a write (or a terminal read stream) reveals the OFF state. `OFF is a
 * state, not an error`: a consumer keys on this predicate to hide or disable the
 * write affordance and show the muted `FeatureDisabled` note that names the enabling
 * env var — never a loud red ErrorState or a retry loop.
 *
 * The predicate DUCK-TYPES the error (a numeric `status` / string `code`) rather
 * than `instanceof ApiError`: this package is the leaf of the plugin boundary and
 * must not import `@tai42/api-client` at runtime — the same reason `useSse` matches
 * `ApiUnauthorizedError` by name.
 */
import type { ReactNode } from 'react';

import { EmptyState } from './components/primitives';

/**
 * True when `error` is a disabled-feature refusal from the skeleton: an HTTP 501, or
 * a `code` ending `-not-configured`. The `code` is authoritative; the 501 status is
 * the fallback signal — either alone is enough.
 */
export function isFeatureDisabled(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { status, code } = error as { status?: unknown; code?: unknown };
  if (status === 501) return true;
  return typeof code === 'string' && code.endsWith('-not-configured');
}

export interface FeatureDisabledProps {
  /** The human name of the OFF feature, e.g. `Interactions`. */
  readonly feature: string;
  /** The env var that turns it on, named verbatim so an operator can act. */
  readonly envVar: string;
}

/**
 * The muted, honest OFF state for a feature whose store this deployment has not
 * configured. A `role="status"` EmptyState (never the loud alert ErrorState): the
 * feature is not broken, it is simply off, and the copy names the enabling env var.
 */
export function FeatureDisabled({ feature, envVar }: FeatureDisabledProps): ReactNode {
  return (
    <div data-testid="feature-disabled">
      <EmptyState
        title={`${feature} is not configured`}
        description={`This deployment has no store configured for ${feature.toLowerCase()}. Set ${envVar} to enable it.`}
      />
    </div>
  );
}
