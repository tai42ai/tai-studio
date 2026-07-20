/**
 * Hooks page: the surface for lifecycle hooks registered on the skeleton. A
 * topic filter drives the list query (its value is part of the query key, so
 * typing a topic refetches); below it the registered-hooks table and a register
 * form. The `hooks` route carries no search parameters, so the page reads none.
 *
 * All server state flows through TanStack Query with loud loading / empty /
 * error surfaces owned by {@link HooksList} and {@link RegisterHookForm}.
 */
import { useState, type ReactNode } from 'react';
import { Card, Field, TextInput, type PageProps } from '@tai42/studio-sdk';

import { HooksList } from './HooksList';
import { RegisterHookForm } from './RegisterHookForm';
import { TopicVerifierForm } from './TopicVerifierForm';

export function HooksPage(_props: PageProps<'hooks'>): ReactNode {
  const [topic, setTopic] = useState('');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-6)' }}>
      <h1 style={{ margin: 0, fontSize: 'var(--tai-text-xl)' }}>Hooks</h1>

      <Card>
        <Field
          label="Filter by topic"
          description="Show only hooks on this topic. Blank lists every hook."
        >
          <TextInput
            value={topic}
            placeholder="e.g. orders.created"
            onChange={(event) => {
              setTopic(event.target.value);
            }}
          />
        </Field>
      </Card>

      <HooksList topic={topic} />
      <TopicVerifierForm />
      <RegisterHookForm />
    </div>
  );
}
