/**
 * The bind-topic-verifier form's state and server wiring: the verifier catalog (the
 * only source of pickable names), the full hooks list (topic suggestions + the
 * "replaces the current binding" notice), and the PUT mutation. `config` is parsed
 * as an optional JSON object; a bad value is a loud field error that blocks submit.
 */
import { useState, type SyntheticEvent } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { errorMessage, useApi } from '@tai42/studio-sdk';
import type { HookList, TopicVerifierBody } from '@tai42/api-client';

import { HOOKS_KEY_ROOT, hookVerifiersKey, hooksListKey } from './keys';
import { parseJsonObject } from './jsonObjectField';

export interface TopicVerifierFormState {
  readonly topic: string;
  readonly setTopic: (value: string) => void;
  readonly verifier: string;
  readonly setVerifier: (value: string) => void;
  readonly config: string;
  readonly setConfig: (value: string) => void;
  readonly submitted: boolean;
  readonly configError: string | null;
  readonly verifiersQuery: UseQueryResult<readonly string[]>;
  readonly hooksQuery: UseQueryResult<HookList>;
  readonly mutation: UseMutationResult<unknown, Error, TopicVerifierBody>;
  readonly catalogEmpty: boolean;
  readonly topicMissing: boolean;
  readonly verifierMissing: boolean;
  readonly existingBinding: HookList['topic_verifiers'][string] | undefined;
  readonly topicSuggestions: readonly string[];
  readonly onSubmit: (event: SyntheticEvent) => void;
}

export function useTopicVerifierForm(): TopicVerifierFormState {
  const api = useApi();
  const queryClient = useQueryClient();

  const [topic, setTopic] = useState('');
  const [verifier, setVerifier] = useState('');
  const [config, setConfig] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const verifiersQuery = useQuery({
    queryKey: hookVerifiersKey,
    queryFn: ({ signal }) => api.listHookVerifiers(signal),
  });
  const hooksQuery = useQuery({
    queryKey: hooksListKey(''),
    queryFn: ({ signal }) => api.listHooks(undefined, signal),
  });

  const mutation = useMutation({
    mutationFn: (body: TopicVerifierBody) => api.setTopicVerifier(topic.trim(), body),
    onSuccess: () => {
      setTopic('');
      setVerifier('');
      setConfig('');
      setSubmitted(false);
      setConfigError(null);
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === HOOKS_KEY_ROOT });
    },
  });

  const catalogEmpty = verifiersQuery.isSuccess && verifiersQuery.data.length === 0;
  const topicMissing = topic.trim() === '';
  const verifierMissing = verifier.trim() === '';

  const trimmedTopic = topic.trim();
  const bindings = hooksQuery.data?.topic_verifiers;
  // Own-property only; a prototype key must not read as a binding.
  const existingBinding =
    trimmedTopic === '' || bindings === undefined || !Object.hasOwn(bindings, trimmedTopic)
      ? undefined
      : bindings[trimmedTopic];
  const topicSuggestions = [...new Set((hooksQuery.data?.items ?? []).map((h) => h.topic))].sort();

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    setSubmitted(true);
    setConfigError(null);
    if (topicMissing || verifierMissing || catalogEmpty) return;

    let configValue: Record<string, unknown>;
    try {
      configValue = parseJsonObject(config, 'config') ?? {};
    } catch (error) {
      setConfigError(errorMessage(error));
      return;
    }

    // A blank config is omitted (the server defaults it to {}); a non-empty one rides.
    const body: TopicVerifierBody =
      Object.keys(configValue).length > 0
        ? { verifier: verifier.trim(), config: configValue }
        : { verifier: verifier.trim() };
    mutation.mutate(body);
  };

  return {
    topic,
    setTopic,
    verifier,
    setVerifier,
    config,
    setConfig,
    submitted,
    configError,
    verifiersQuery,
    hooksQuery,
    mutation,
    catalogEmpty,
    topicMissing,
    verifierMissing,
    existingBinding,
    topicSuggestions,
    onSubmit,
  };
}
