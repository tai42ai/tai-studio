/** Hook listing, registration and topic-verifier response schemas. */
import { z } from 'zod';
import { hookParams } from './served';

// The hand-written hook response DTOs: the fire-door authority enum, the list rows and
// their wrapper, and the per-topic verifier/trigger metadata. The served hook DOCUMENT
// schemas (`hookSubject`/`hookParams`/`hookRegister`) are generated from the contract
// bundle and re-exported at the top of this file, not defined here.

/** A fire door — who may trigger a path, not what the fire may do. A string enum. */
export const triggerAuth = z.enum([
  'public',
  'verifier',
  'token',
  'token+api_key',
  'out-of-service',
]);
export type TriggerAuth = z.infer<typeof triggerAuth>;

export const hookList = z.object({
  items: z.array(hookParams),
  total: z.number(),
  // Per-topic verifier bindings: the topic name maps to the verifier bound to it
  // and that verifier's config (which carries a `secret_env` name, never a secret
  // value). Tolerant of an older/empty response, which omits the key entirely.
  topic_verifiers: z
    .record(
      z.string(),
      z.object({ verifier: z.string(), config: z.record(z.string(), z.unknown()) }),
    )
    .default({}),
  // Per-topic fire door (topic → door). Tolerant of an older response omitting it.
  trigger_auth: z.record(z.string(), triggerAuth).default({}),
});
export type HookList = z.infer<typeof hookList>;

export const hookRegistered = z.object({
  registered: z.boolean(),
  name: z.string(),
});

export const hookRemoved = z.object({
  removed: z.boolean(),
  name: z.string(),
});

// The registered webhook-verifier catalog (`GET /api/hooks/verifiers`) — the
// sorted verifier NAMES only, never any verifier's config. An empty registry is a
// valid empty array. This is the ONLY source the topic-verifier bind picker reads.
export const hookVerifiers = z.array(z.string());

/** `PUT /api/hooks/topics/{topic}/verifier` — the bound topic + verifier name. */
export const topicVerifierSet = z.object({ topic: z.string(), verifier: z.string() });

/** `DELETE /api/hooks/topics/{topic}/verifier` — the unbound topic. */
export const topicVerifierRemoved = z.object({ removed: z.boolean(), topic: z.string() });
