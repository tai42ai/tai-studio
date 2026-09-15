/**
 * Bind a webhook verifier to a topic — the write surface that locks a topic's
 * otherwise-OPEN public ingress (`POST|GET /universal_webhook/{topic}` is
 * unauthenticated until a verifier is bound).
 *
 *  - `topic` — a required free-text field; existing hook topics are offered as
 *    `datalist` suggestions, but any topic string is allowed.
 *  - `verifier` — a `Select` fed only by the verifier catalog (see
 *    {@link VerifierSelectField}).
 *  - `config` — an optional JSON object, loud-parsed. The `shared_secret` verifier's
 *    shape is `{"header": …, "secret_env": …}` — the config names a secret ENV VAR,
 *    never the secret value itself.
 *
 * A submit `PUT`s the binding; on success the form resets and the hooks list is
 * invalidated. A PUT on an already-bound topic REPLACES it — the form shows an
 * inline notice of the binding it will replace. Any 4xx surfaces verbatim in a loud
 * inline `ErrorState`.
 */
import {
  Button,
  Card,
  errorMessage,
  ErrorState,
  Field,
  Spinner,
  Textarea,
  TextInput,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { useTopicVerifierForm } from './useTopicVerifierForm';
import { VerifierSelectField } from './VerifierSelectField';

export function TopicVerifierForm(): ReactNode {
  const form = useTopicVerifierForm();
  const listId = 'topic-verifier-topics';

  return (
    <Card>
      <h2 style={{ margin: '0 0 var(--tai-space-4)', fontSize: 'var(--tai-text-lg)' }}>
        Bind topic verifier
      </h2>
      <form
        aria-label="Bind topic verifier"
        onSubmit={form.onSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}
      >
        {form.hooksQuery.isError ? (
          <p role="alert" style={{ margin: 0, color: 'var(--tai-color-warning)' }}>
            Could not load existing hooks: {errorMessage(form.hooksQuery.error)}. Topic suggestions
            and replace detection are unavailable; a bind will still replace any existing binding on
            this topic.
          </p>
        ) : null}
        <Field
          label="Topic"
          description="The webhook topic to lock. Its public ingress is OPEN until a verifier is bound."
          error={form.submitted && form.topicMissing ? 'A topic is required.' : undefined}
        >
          <TextInput
            value={form.topic}
            list={listId}
            placeholder="e.g. events.created"
            autoComplete="off"
            onChange={(event) => {
              form.setTopic(event.target.value);
            }}
          />
          <datalist id={listId}>
            {form.topicSuggestions.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        {form.existingBinding !== undefined ? (
          <p role="status" style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
            Replaces the current <strong>{form.existingBinding.verifier}</strong> binding on this
            topic.
          </p>
        ) : null}

        <VerifierSelectField
          verifiersQuery={form.verifiersQuery}
          verifier={form.verifier}
          setVerifier={form.setVerifier}
          submitted={form.submitted}
          verifierMissing={form.verifierMissing}
          catalogEmpty={form.catalogEmpty}
        />

        <Field
          label="Config (JSON)"
          description='A JSON object of verifier config. The shared_secret verifier takes {"header": "…", "secret_env": "…"} — secret_env is the ENV VAR NAME, never the secret value. Blank means none.'
          error={form.configError ?? undefined}
        >
          <Textarea
            value={form.config}
            rows={4}
            spellCheck={false}
            placeholder='{ "header": "X-Signature", "secret_env": "EVENTS_SECRET" }'
            onChange={(event) => {
              form.setConfig(event.target.value);
            }}
          />
        </Field>

        {form.mutation.isError ? <ErrorState message={errorMessage(form.mutation.error)} /> : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-3)' }}>
          <Button
            type="submit"
            variant="primary"
            disabled={form.mutation.isPending || form.catalogEmpty}
          >
            {form.mutation.isPending ? <Spinner label="Binding" /> : null}
            Bind verifier
          </Button>
        </div>
      </form>
    </Card>
  );
}
