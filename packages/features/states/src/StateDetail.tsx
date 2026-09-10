/**
 * The per-state detail pane: the header (name, description, subject-kind badges, and a
 * Delete-state danger action) over the four tabs — Declaration, Templates, Records,
 * Consumers — driven by `?tab=`. The composite read (`GET /api/states/{name}`) feeds
 * every tab, so a feature that is OFF surfaces once here as the muted `FeatureDisabled`
 * note; a name that does not resolve shows a not-found empty state.
 */
import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AppLink,
  ArrowLeftIcon,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Skeleton,
  Tabs,
  errorMessage,
  isFeatureDisabled,
  featureDisabledMessage,
  FeatureDisabled,
  useApi,
  useAppNavigate,
  type RouteSearch,
} from '@tai42/studio-sdk';
import { ApiError } from '@tai42/api-client';

import { DeclarationTab } from './DeclarationTab';
import { TemplatesTab } from './TemplatesTab';
import { RecordsTab } from './RecordsTab';
import { ConsumersTab } from './ConsumersTab';
import { stateDetailKey, statesListKey } from './keys';

const PERSON_KIND = 'person';

type StatesTab = NonNullable<RouteSearch<'states'>['tab']>;

export function StateDetail({
  name,
  tab,
}: {
  readonly name: string;
  readonly tab: StatesTab | undefined;
}): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();
  const queryClient = useQueryClient();
  const activeTab: StatesTab = tab ?? 'declaration';

  const query = useQuery({
    queryKey: stateDetailKey(name),
    queryFn: ({ signal }) => api.getState(name, signal),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteState(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: statesListKey });
      navigate('states', {});
    },
  });

  if (query.isError && isFeatureDisabled(query.error)) {
    return (
      <Card>
        <FeatureDisabled feature="States" message={featureDisabledMessage(query.error)} />
      </Card>
    );
  }
  if (query.isError && query.error instanceof ApiError && query.error.status === 404) {
    return (
      <Card>
        <EmptyState
          title={`No state named '${name}'`}
          description="It may have been deleted. Choose another state from the list."
        />
      </Card>
    );
  }
  if (query.isPending) {
    return (
      <Card>
        <Skeleton height={240} />
      </Card>
    );
  }
  if (query.isError) {
    return (
      <Card>
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </Card>
    );
  }

  const state = query.data;

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}
      data-testid="state-detail"
    >
      <div>
        <AppLink
          to="states"
          search={{}}
          className="tai-btn tai-btn-ghost"
          aria-label="Back to states"
        >
          <ArrowLeftIcon />
          Back to states
        </AppLink>
      </div>

      <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--tai-space-2)',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 'var(--tai-text-lg)' }}>{state.name}</h2>
          <DeleteStateButton
            name={state.name}
            pending={deleteMutation.isPending}
            error={deleteMutation.error}
            onConfirm={() => {
              deleteMutation.mutate();
            }}
          />
        </div>
        {state.description !== '' ? (
          <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>{state.description}</p>
        ) : null}
        <div style={{ display: 'flex', gap: 'var(--tai-space-1)', flexWrap: 'wrap' }}>
          {state.subject_kinds.map((kind) => (
            <Badge key={kind} variant={kind === PERSON_KIND ? 'primary' : 'neutral'}>
              {kind}
            </Badge>
          ))}
        </div>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={(next) => {
          navigate('states', { state: name, tab: next as StatesTab });
        }}
        items={[
          {
            value: 'declaration',
            label: 'Declaration',
            content: <DeclarationTab state={state} />,
          },
          { value: 'templates', label: 'Templates', content: <TemplatesTab state={state} /> },
          { value: 'records', label: 'Records', content: <RecordsTab state={state} /> },
          { value: 'consumers', label: 'Consumers', content: <ConsumersTab state={state} /> },
        ]}
      />
    </div>
  );
}

/** The Delete-state danger action; a `DeclarationInUseError` (409) renders in-dialog. */
function DeleteStateButton({
  name,
  pending,
  error,
  onConfirm,
}: {
  readonly name: string;
  readonly pending: boolean;
  readonly error: unknown;
  readonly onConfirm: () => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setOpen(true);
        }}
      >
        Delete state
      </Button>
      {open ? (
        <ConfirmDialog
          title={`Delete state '${name}'?`}
          confirmLabel="Delete"
          pendingLabel="Deleting"
          confirmVariant="danger"
          isPending={pending}
          error={error as Error | string | null}
          onConfirm={onConfirm}
          onClose={() => {
            if (!pending) setOpen(false);
          }}
        >
          Records and attachments are deleted. This can not be undone.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
