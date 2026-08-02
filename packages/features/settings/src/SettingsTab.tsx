/**
 * The Settings tab (schema view — the PRIMARY settings surface): renders one
 * card per registered settings class from `GET /api/config/settings-schema`,
 * with a typed input per field (string → text, integer/number → number,
 * boolean → checkbox, anything else → text). Secret fields render MASKED
 * through `RevealInput` (display masking only — values are never logged).
 * Nested-group fields (a field pointing at another settings class) are NOT
 * editable here; they render a muted reference to the group that owns them, so
 * the UI links to the already-registered group rather than duplicating it.
 *
 * Edits accumulate into a pending `Record<env_var, string>`; Save posts the
 * whole pending map through the env merge door (`setEnvConfig`). The store is
 * env strings, so every edited value is serialised the way pydantic-settings
 * re-parses it: a string as-is, a number as `String(v)`, a boolean as
 * `"true"`/`"false"`. This round-trip is load-bearing — the owning settings
 * class must parse the posted string back to the edited value.
 *
 * State follows the shared convention: <Spinner> while loading, <ErrorState>
 * (loud) on any failure — a rejected request or a zod mismatch is always a
 * visible error, never a silent render. Read-only config mode disables every
 * input and Save.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  NumberInput,
  RevealInput,
  Spinner,
  TextInput,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import type { SettingsSchema } from '@tai42/api-client';

import { envConfigKey, settingsSchemaKey } from './keys';

type Group = SettingsSchema['groups'][number];
type Field_ = Group['fields'][number];

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

const fieldStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-2)',
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 'var(--tai-text-sm)',
  fontWeight: 600,
  color: 'var(--tai-color-text)',
};

const descriptionStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

const nestedRefStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
  fontStyle: 'italic',
};

const footerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-3)',
  marginTop: 'var(--tai-space-2)',
};

/** Render a scalar field value as the string an input control shows. */
function toText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** Interpret a field value as a boolean for a checkbox. */
function toBool(value: unknown): boolean {
  return value === true || value === 'true';
}

/** True when a field is a reference to another settings group (non-editable). */
function isNestedRef(field: Field_): boolean {
  return field.nested_group !== null && field.env_var === '';
}

/** The visible label — a required field carries a trailing marker. */
function labelOf(field: Field_): string {
  return field.required ? `${field.name} *` : field.name;
}

/**
 * The placeholder shown for an unset field. A field whose declared default is null
 * (no hidden localhost fallback — the None-default doctrine) shows an em-dash, so an
 * empty input reads honestly as "no value, no default" rather than a blank that
 * could imply a silent default.
 */
function placeholderOf(field: Field_): string {
  return field.default === null || field.default === undefined ? '—' : toText(field.default);
}

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

  const renderField = (field: Field_): ReactNode => {
    if (isNestedRef(field)) {
      return (
        <div key={field.name} style={fieldStyle}>
          <span style={fieldLabelStyle}>{field.name}</span>
          <p style={nestedRefStyle} data-testid={`settings-nested-${field.name}`}>
            Configured under the “{field.nested_group}” group below.
          </p>
        </div>
      );
    }

    const label = labelOf(field);
    const description = field.description ?? undefined;
    const placeholder = placeholderOf(field);

    if (field.secret) {
      const current = pending[field.env_var] ?? toText(field.value);
      return (
        <Field key={field.name} label={label} description={description}>
          <RevealInput
            idPrefix={`settings-secret-${field.env_var}`}
            value={current}
            placeholder={placeholder}
            readOnly={readOnly}
            onChange={(value) => {
              setValue(field.env_var, value);
            }}
          />
        </Field>
      );
    }

    if (field.type === 'boolean') {
      const checked =
        field.env_var in pending ? pending[field.env_var] === 'true' : toBool(field.value);
      return (
        <div key={field.name} style={fieldStyle}>
          <Checkbox
            label={label}
            checked={checked}
            disabled={readOnly}
            onCheckedChange={(next) => {
              setValue(field.env_var, next ? 'true' : 'false');
            }}
          />
          {description !== undefined ? <p style={descriptionStyle}>{description}</p> : null}
        </div>
      );
    }

    if (field.type === 'integer' || field.type === 'number') {
      const current = pending[field.env_var] ?? toText(field.value);
      return (
        <Field key={field.name} label={label} description={description}>
          <NumberInput
            value={current}
            placeholder={placeholder}
            disabled={readOnly}
            autoComplete="off"
            onChange={(event) => {
              setValue(field.env_var, event.target.value);
            }}
          />
        </Field>
      );
    }

    const current = pending[field.env_var] ?? toText(field.value);
    return (
      <Field key={field.name} label={label} description={description}>
        <TextInput
          value={current}
          placeholder={placeholder}
          disabled={readOnly}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setValue(field.env_var, event.target.value);
          }}
        />
      </Field>
    );
  };

  return (
    <div style={listStyle}>
      {groups.map((group) => (
        <Card key={group.qualname}>
          <h3 style={groupHeadingStyle}>{group.name}</h3>
          <p style={groupSubtitleStyle}>{group.module}</p>
          <div style={fieldsStyle}>{group.fields.map(renderField)}</div>
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
