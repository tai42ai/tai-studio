/** Hook listing, registration and topic-verifier response schemas. */
import { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

// The hook response schemas: the fire-door authority enum, the list rows and their
// wrapper, and the per-topic verifier/trigger metadata. The served hook DOCUMENT schemas
// (`hookSubject`/`hookParams`/`hookRegister`) are re-exported from `./served`.

/** A fire door — who may trigger a path, not what the fire may do. A string enum. */
export const triggerAuth = openapi.hookListView.shape.trigger_auth.valueType;
export type TriggerAuth = z.infer<typeof triggerAuth>;

export const hookList = openapi.hookListView.extend({
  // Per-topic verifier bindings: the topic name maps to the verifier bound to it and that
  // verifier's config (which carries a `secret_env` name, never a secret value). Hand-typed:
  // the spec publishes a binding as an open value.
  topic_verifiers: z.record(
    z.string(),
    z.object({ verifier: z.string(), config: z.record(z.string(), z.unknown()) }),
  ),
});
export type HookList = z.infer<typeof hookList>;

export const hookRegistered = openapi.hookRegisterResult;

export const hookRemoved = openapi.removedByName;

// The registered webhook-verifier catalog (`GET /api/hooks/verifiers`) — the
// sorted verifier NAMES only, never any verifier's config. An empty registry is a
// valid empty array. This is the ONLY source the topic-verifier bind picker reads.
export const hookVerifiers = openapi.stringListResponse;

/** `PUT /api/hooks/topics/{topic}/verifier` — the bound topic + verifier name. */
export const topicVerifierSet = openapi.topicVerifierView;

/** `DELETE /api/hooks/topics/{topic}/verifier` — the unbound topic. */
export const topicVerifierRemoved = openapi.removedByTopic;
