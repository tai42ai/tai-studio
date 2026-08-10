/**
 * Bind a webhook verifier to a topic — the write surface that locks a topic's
 * otherwise-OPEN public ingress (`POST|GET /universal_webhook/{topic}` is
 * unauthenticated until a verifier is bound).
 *
 *  - `topic` — a required free-text field. Existing hook topics are offered as
 *    `datalist` suggestions, but any topic string is allowed: a verifier can be
 *    bound before any hook on that topic exists.
 *  - `verifier` — a `Select` fed ONLY by `GET /api/hooks/verifiers` (never a
 *    hardcoded list). Four-state: loading disables the picker; a load error is
 *    loud with retry; an EMPTY registry is an honest inline note and disables
 *    submit (a bind would 400 with no verifier to name); otherwise the names.
 *  - `config` — an optional JSON object, loud-parsed (bad JSON / non-object is an
 *    inline `Field` error that blocks the request). The `shared_secret` verifier's
 *    shape is `{"header": …, "secret_env": …}` — the config names a secret ENV VAR,
 *    never the secret value itself.
 *
 * A submit `PUT`s the binding; on success the form resets and the hooks list is
 * invalidated so the read-only per-topic display re-renders the new binding. A PUT
 * on an already-bound topic REPLACES it — the form shows an inline notice of the
 * binding it will replace. Any 4xx (unknown verifier, bad body) surfaces verbatim
 * in a loud inline `ErrorState`.
 */
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AppLink,
  Button,
  Card,
  ErrorState,
  Field,
  Select,
  Spinner,
  Textarea,
  TextInput,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import type { TopicVerifierBody } from '@tai42/api-client';

import { HOOKS_KEY_ROOT, hookVerifiersKey, hooksListKey } from './keys';

/** Parse the `config` textarea; blank means `{}`. Throws a loud message on bad input. */
function parseConfig(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (trimmed === '') return {};
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Invalid JSON: ${errorMessage(error)}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid JSON: config must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

export function TopicVerifierForm(): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const [topic, setTopic] = useState('');
  const [verifier, setVerifier] = useState('');
  const [config, setConfig] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // The verifier catalog: the ONLY source of pickable verifier names.
  const verifiersQuery = useQuery({
    queryKey: hookVerifiersKey,
    queryFn: ({ signal }) => api.listHookVerifiers(signal),
  });
  // The full (unfiltered) hooks list: feeds topic suggestions and the
  // "replaces the current binding" notice. Shares the list root so a bind's
  // invalidation refetches it.
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
      configValue = parseConfig(config);
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

  const listId = 'topic-verifier-topics';

  return (
    <Card>
      <h2 style={{ margin: '0 0 var(--tai-space-4)', fontSize: 'var(--tai-text-lg)' }}>
        Bind topic verifier
      </h2>
      <form
        aria-label="Bind topic verifier"
        onSubmit={onSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}
      >
        {hooksQuery.isError ? (
          <p role="alert" style={{ margin: 0, color: 'var(--tai-color-warning)' }}>
            Could not load existing hooks: {errorMessage(hooksQuery.error)}. Topic suggestions and
            replace detection are unavailable; a bind will still replace any existing binding on
            this topic.
          </p>
        ) : null}
        <Field
          label="Topic"
          description="The webhook topic to lock. Its public ingress is OPEN until a verifier is bound."
          error={submitted && topicMissing ? 'A topic is required.' : undefined}
        >
          <TextInput
            value={topic}
            list={listId}
            placeholder="e.g. events.created"
            autoComplete="off"
            onChange={(event) => {
              setTopic(event.target.value);
            }}
          />
          <datalist id={listId}>
            {topicSuggestions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        {existingBinding !== undefined ? (
          <p role="status" style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
            Replaces the current <strong>{existingBinding.verifier}</strong> binding on this topic.
          </p>
        ) : null}

        <Field
          label="Verifier"
          error={
            submitted && verifierMissing && !catalogEmpty ? 'A verifier is required.' : undefined
          }
          // Only the Select branch claims the field's control id; the error and
          // empty branches render no labelable element, so `for` would dangle.
          group={verifiersQuery.isError || catalogEmpty}
        >
          {verifiersQuery.isError ? (
            <ErrorState
              message={errorMessage(verifiersQuery.error)}
              onRetry={() => void verifiersQuery.refetch()}
            />
          ) : catalogEmpty ? (
            <p role="status" style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
              No webhook verifiers registered.{' '}
              <AppLink to="marketplace" search={{ kind: 'webhook-verifier' }} className="tai-link">
                Browse marketplace
              </AppLink>
            </p>
          ) : (
            <Select
              options={(verifiersQuery.data ?? []).map((name) => ({ value: name, label: name }))}
              value={verifier}
              placeholder={verifiersQuery.isPending ? 'Loading verifiers…' : 'Select a verifier'}
              disabled={verifiersQuery.isPending}
              onValueChange={setVerifier}
            />
          )}
        </Field>

        <Field
          label="Config (JSON)"
          description='A JSON object of verifier config. The shared_secret verifier takes {"header": "…", "secret_env": "…"} — secret_env is the ENV VAR NAME, never the secret value. Blank means none.'
          error={configError ?? undefined}
        >
          <Textarea
            value={config}
            rows={4}
            spellCheck={false}
            placeholder='{ "header": "X-Signature", "secret_env": "EVENTS_SECRET" }'
            onChange={(event) => {
              setConfig(event.target.value);
            }}
          />
        </Field>

        {mutation.isError ? <ErrorState message={errorMessage(mutation.error)} /> : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-3)' }}>
          <Button type="submit" variant="primary" disabled={mutation.isPending || catalogEmpty}>
            {mutation.isPending ? <Spinner label="Binding" /> : null}
            Bind verifier
          </Button>
        </div>
      </form>
    </Card>
  );
}
