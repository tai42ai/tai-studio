/**
 * The host-injected configuration for a form's on-change reaction round-trip,
 * and the transport it uses when the host points it at its own door.
 *
 * WHY IT IS INJECTED: the reaction door differs PER SURFACE. The in-app Studio inbox
 * reacts through the authenticated door `POST /api/interactions/{id}/react` (the default
 * here). A page served by the web channel plugin must instead route reactions through the
 * plugin's OWN session door — the interaction ticket is held server-side and never
 * reaches the browser — so that host sets `reactionEndpoint` to its same-origin door. The
 * form renderer never hard-codes the path; the serving page chooses it.
 */
import type { FormUpdate, ReactionEvent } from '@tai42/api-client';
import { schemas } from '@tai42/api-client';
import { useApi } from '@tai42/studio-sdk';
import { createContext, useContext, useMemo } from 'react';

export interface InteractionReactionConfig {
  /**
   * The same-origin URL the on-change reaction round-trip POSTs `{event, values}` to.
   * Absent → the in-app authenticated door `POST /api/interactions/{id}/react`. A host
   * page sets this per surface (the web channel page points it at the plugin's own
   * session door); the in-app Studio inbox leaves it unset.
   */
  readonly reactionEndpoint?: string;
}

const InteractionReactionConfigContext = createContext<InteractionReactionConfig>({});

/** Set the reaction configuration for the form surfaces mounted beneath it. */
export const InteractionReactionConfigProvider = InteractionReactionConfigContext.Provider;

/** The reaction configuration the enclosing host set; `{}` (the authed door) by default. */
export function useInteractionReactionConfig(): InteractionReactionConfig {
  return useContext(InteractionReactionConfigContext);
}

/** One reaction round-trip for an interaction: `{event, values}` → the form update. */
export type Reactor = (event: ReactionEvent, values: unknown) => Promise<FormUpdate>;

/**
 * The reactor the enclosing surface chose: a host-provided same-origin endpoint, or — by
 * default — the in-app authenticated door `POST /api/interactions/{id}/react`. Either way
 * the caller passes only the event and the partial values.
 */
export function useFormReactor(interactionId: string): Reactor {
  const api = useApi();
  const { reactionEndpoint } = useInteractionReactionConfig();
  return useMemo<Reactor>(
    () =>
      reactionEndpoint === undefined
        ? (event, values) => api.reactInteraction(interactionId, event, values)
        : (event, values) => postFormReaction(reactionEndpoint, event, values),
    [api, interactionId, reactionEndpoint],
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A host door's refusal of a reaction: `message` is the response's `error` (else its status
 * text), `reason` the response's own `reason` string when it sent one, else `null`. The
 * form draws the caller's could-not-update line with `reason` in its `{reason}` token, and
 * the surface's own line with `message`.
 */
export class FormReactionRequestError extends Error {
  readonly reason: string | null;
  constructor(message: string, reason: string | null) {
    super(message);
    this.name = 'FormReactionRequestError';
    this.reason = reason;
  }
}

/** The loud error of a failed reaction response (`{error, reason}`, else the status text). */
async function reactionRequestError(response: Response): Promise<FormReactionRequestError> {
  const fallback = response.statusText !== '' ? response.statusText : 'the reaction request failed';
  try {
    const body: unknown = await response.json();
    if (isRecord(body)) {
      const message = typeof body.error === 'string' ? body.error : fallback;
      const reason = typeof body.reason === 'string' ? body.reason : null;
      return new FormReactionRequestError(message, reason);
    }
  } catch {
    // Fall through to the status text — a non-JSON error body is itself the failure.
  }
  return new FormReactionRequestError(fallback, null);
}

/**
 * POST a reaction to a host-provided `endpoint` and return the parsed form update. A
 * same-origin request carrying the surface's own session (credentials), never the inbox
 * api-key — the host door owns its authentication. A non-ok response or a malformed
 * update throws LOUDLY, so the caller surfaces it and never applies a stale value.
 */
export async function postFormReaction(
  endpoint: string,
  event: ReactionEvent,
  values: unknown,
): Promise<FormUpdate> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ event, values }),
  });
  if (!response.ok) throw await reactionRequestError(response);
  const body: unknown = await response.json();
  // Accept the platform's `{ data }` envelope or a bare update body.
  const payload = isRecord(body) && 'data' in body ? body.data : body;
  return schemas.formUpdate.parse(payload);
}
