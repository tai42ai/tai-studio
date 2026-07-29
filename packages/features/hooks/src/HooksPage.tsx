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
import {
  Card,
  Field,
  PageHeader,
  Stack,
  TextInput,
  coversAnyRoute,
  isFullProjection,
  useCapabilities,
  type PageProps,
} from '@tai42/studio-sdk';

import { HooksList } from './HooksList';
import { RegisterHookForm } from './RegisterHookForm';
import { TopicVerifierForm } from './TopicVerifierForm';
import { TriggerLinksList } from './TriggerLinksList';

/** The trigger-links CRUD read/write surface, matched by prefix for section
 * VISIBILITY: a full (admin / gate-off) projection or a hooks-granted (read or
 * write) non-admin whose projection reaches these routes sees the section; an
 * ungranted caller does not. Fails closed until the projection is ready. */
const TRIGGER_LINKS_ROUTE = '/api/hooks/trigger-links';

export function HooksPage(_props: PageProps<'hooks'>): ReactNode {
  const [topic, setTopic] = useState('');
  const { state } = useCapabilities();

  const triggerLinksVisible =
    state.status === 'ready' &&
    (isFullProjection(state.projection) || coversAnyRoute(state.projection, [TRIGGER_LINKS_ROUTE]));

  return (
    <Stack gap={6}>
      <PageHeader eyebrow="Integrations" title="Hooks" />

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
      {triggerLinksVisible ? <TriggerLinksList /> : null}
      <TopicVerifierForm />
      <RegisterHookForm />
    </Stack>
  );
}
