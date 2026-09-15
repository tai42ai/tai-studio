/**
 * The Settings tab (schema view — the PRIMARY settings surface): renders one
 * card per registered settings class from `GET /api/config/settings-schema`,
 * with a typed input per field. Secret fields render MASKED through `RevealInput`.
 * Nested-group fields render a muted reference to the group that owns them.
 *
 * Edits accumulate into a pending `Record<env_var, string>`; Save posts the whole
 * pending map through the env merge door (`setEnvConfig`). The store is env strings,
 * so every edited value is serialised the way pydantic-settings re-parses it.
 *
 * State follows the shared convention: <Spinner> while loading, <ErrorState> (loud)
 * on any failure — a rejected request or a zod mismatch is always a visible error,
 * never a silent render. Read-only config mode disables every input and Save.
 */
import {
  Button,
  Card,
  EmptyState,
  errorMessage,
  ErrorState,
  Spinner,
  useApi,
} from '@tai42/studio-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type CSSProperties, type ReactNode, useState } from 'react';

import { envConfigKey, settingsSchemaKey } from './keys';
import { SettingsField } from './SettingsField';

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

const groupHeadingStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-lg)',
  color: 'var(--tai-color-text)',
};

const groupSubtitleStyle: CSSProperties = {
  margin: '2px 0 var(--tai-space-4)',
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
  fontFamily: 'var(--tai-font-mono)',
};

const fieldsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

const descriptionStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-3)',
  marginTop: 'var(--tai-space-2)',
};

export interface SettingsTabProps {
  readonly readOnly: boolean;
}

export function SettingsTab({ readOnly }: SettingsTabProps): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const schemaQuery = useQuery({
    queryKey: settingsSchemaKey,
    queryFn: ({ signal }) => api.getSettingsSchema(signal),
  });

  // Pending edits, keyed by env var. A value present here overrides the field's
  // reported value in the input and is what Save posts.
  const [pending, setPending] = useState<Record<string, string>>({});

  const mutation = useMutation({
    mutationFn: (env: Record<string, string>) => api.setEnvConfig(env),
    onSuccess: () => {
      setPending({});
      void queryClient.invalidateQueries({ queryKey: settingsSchemaKey });
      void queryClient.invalidateQueries({ queryKey: envConfigKey });
    },
  });

  const setValue = (envVar: string, value: string): void => {
    setPending((current) => ({ ...current, [envVar]: value }));
  };

  if (schemaQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(schemaQuery.error)}
        onRetry={() => {
          void schemaQuery.refetch();
        }}
      />
    );
  }
  if (schemaQuery.isPending) {
    return <Spinner label="Loading settings" />;
  }

  const { groups } = schemaQuery.data;
  const hasEdits = Object.keys(pending).length > 0;

  if (groups.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No settings"
          description="No settings classes are registered for this deployment."
        />
      </Card>
    );
  }

  return (
    <div style={listStyle}>
      {groups.map((group) => (
        <Card key={group.qualname}>
          <h3 style={groupHeadingStyle}>{group.name}</h3>
          <p style={groupSubtitleStyle}>{group.module}</p>
          <div style={fieldsStyle}>
            {group.fields.map((field) => (
              <SettingsField
                key={field.name}
                field={field}
                pending={pending}
                readOnly={readOnly}
                onChange={setValue}
              />
            ))}
          </div>
        </Card>
      ))}

      {mutation.isError ? (
        <div>
          <ErrorState message={errorMessage(mutation.error)} />
        </div>
      ) : null}

      {readOnly ? (
        <p role="note" style={descriptionStyle}>
          Configuration is read-only for this deployment. Settings cannot be edited here.
        </p>
      ) : (
        <div style={footerStyle}>
          <Button
            type="button"
            variant="primary"
            disabled={!hasEdits || mutation.isPending}
            onClick={() => {
              mutation.mutate(pending);
            }}
          >
            {mutation.isPending ? <Spinner label="Saving" /> : null}
            Save
          </Button>
        </div>
      )}
    </div>
  );
}
