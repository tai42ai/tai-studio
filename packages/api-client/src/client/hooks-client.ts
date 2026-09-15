/** Hook listing, registration and topic-verifier sub-client. */
import { encodeSegment } from '../http';
import * as s from '../schemas';
import type { Transport } from './transport';

/**
 * Body for binding a webhook verifier to a topic
 * (PUT `/api/hooks/topics/{topic}/verifier`). `verifier` is a registered verifier
 * NAME, resolved against the live registry at bind time (an unknown name is a loud
 * 400). `config` is that verifier's config object — it carries a `secret_env` name,
 * never a secret value — and defaults to `{}` when omitted.
 */
export interface TopicVerifierBody {
  readonly verifier: string;
  readonly config?: Record<string, unknown>;
}

export function hooksClient(t: Transport) {
  const { req } = t;
  return {
    listHooks: (topic?: string, signal?: AbortSignal) =>
      req('/api/hooks', s.hookList, { signal, query: topic === undefined ? undefined : { topic } }),
    registerHook: (params: s.HookRegister) =>
      req('/api/hooks', s.hookRegistered, { method: 'POST', body: params }),
    unregisterHook: (name: string) =>
      req(`/api/hooks/${encodeSegment(name)}`, s.hookRemoved, { method: 'DELETE' }),
    // The registered webhook-verifier catalog — the only source the bind picker
    // reads (names only; an empty registry is a valid empty list).
    listHookVerifiers: (signal?: AbortSignal) =>
      req('/api/hooks/verifiers', s.hookVerifiers, { signal }),
    // Bind a verifier to a topic (locks its otherwise-open public ingress). A PUT
    // replaces any existing binding; an unknown verifier name is a loud 400.
    setTopicVerifier: (topic: string, body: TopicVerifierBody) =>
      req(`/api/hooks/topics/${encodeSegment(topic)}/verifier`, s.topicVerifierSet, {
        method: 'PUT',
        body,
      }),
    // Unbind a topic's verifier (re-opens its public ingress). 404 when no binding.
    deleteTopicVerifier: (topic: string) =>
      req(`/api/hooks/topics/${encodeSegment(topic)}/verifier`, s.topicVerifierRemoved, {
        method: 'DELETE',
      }),
  };
}
