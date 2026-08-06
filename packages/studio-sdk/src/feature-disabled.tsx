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
 * write affordance and show the muted `FeatureDisabled` note, whose remediation line
 * is the SERVER's own message — never a loud red ErrorState or a retry loop, and
 * never a client-composed env-var string.
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

/**
 * The remediation line for a refusal: the skeleton's own `message` (which names the
 * missing configuration), else its machine `code`. The client NEVER composes this —
 * a refusal carrying neither is a contract breach and raises.
 */
export function featureDisabledMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const { message, code } = error as { message?: unknown; code?: unknown };
    if (typeof message === 'string' && message !== '') return message;
    if (typeof code === 'string' && code !== '') return code;
  }
  throw new Error('featureDisabledMessage: refusal carried neither a message nor a code');
}

export interface FeatureDisabledProps {
  /** The human name of the OFF feature, e.g. `Interactions`. */
  readonly feature: string;
  /** The server's own remediation line, shown verbatim (never a client-composed string). */
  readonly message: string;
}

/**
 * The muted, honest OFF state for a feature whose store this deployment has not
 * configured. A `role="status"` EmptyState (never the loud alert ErrorState): the
 * feature is not broken, it is simply off, and the copy shows the server's own
 * remediation message.
 */
export function FeatureDisabled({ feature, message }: FeatureDisabledProps): ReactNode {
  return (
    <div data-testid="feature-disabled">
      <EmptyState title={`${feature} is not configured`} description={message} />
    </div>
  );
}
