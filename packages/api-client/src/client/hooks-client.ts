/** Hook listing, registration and topic-verifier sub-client. */
import { apiRoutes, buildPath } from '../generated/api-routes';
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
      req(apiRoutes.get_api_hooks.path, s.hookList, {
        signal,
        query: topic === undefined ? undefined : { topic },
      }),
    registerHook: (params: s.HookRegister) =>
      req(apiRoutes.post_api_hooks.path, s.hookRegistered, { method: 'POST', body: params }),
    unregisterHook: (name: string) =>
      req(buildPath(apiRoutes.delete_api_hooks_name.path, { name }), s.hookRemoved, {
        method: 'DELETE',
      }),
    // The registered webhook-verifier catalog — the only source the bind picker
    // reads (names only; an empty registry is a valid empty list).
    listHookVerifiers: (signal?: AbortSignal) =>
      req(apiRoutes.get_api_hooks_verifiers.path, s.hookVerifiers, { signal }),
    // Bind a verifier to a topic (locks its otherwise-open public ingress). A PUT
    // replaces any existing binding; an unknown verifier name is a loud 400.
    setTopicVerifier: (topic: string, body: TopicVerifierBody) =>
      req(
        buildPath(apiRoutes.put_api_hooks_topics_topic_verifier.path, { topic }),
        s.topicVerifierSet,
        {
          method: 'PUT',
          body,
        },
      ),
    // Unbind a topic's verifier (re-opens its public ingress). 404 when no binding.
    deleteTopicVerifier: (topic: string) =>
      req(
        buildPath(apiRoutes.delete_api_hooks_topics_topic_verifier.path, { topic }),
        s.topicVerifierRemoved,
        {
          method: 'DELETE',
        },
      ),
  };
}
