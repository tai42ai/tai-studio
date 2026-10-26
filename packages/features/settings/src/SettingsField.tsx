/**
 * One settings-class field, typed by its schema descriptor: a nested-group reference
 * (read-only), a secret RevealInput, a boolean checkbox, a numeric input, or a text
 * input. A pending edit (keyed by env var) overrides the reported value.
 *
 * A field the deployment's own environment sets is locked: its control shows the
 * reported value read-only beside a "Set by the deployment" badge that describes it
 * (`aria-describedby`), and it never reports an edit, so it never enters the pending
 * map a save posts.
 */
import { Checkbox, Field, NumberInput, RevealInput, TextInput } from '@tai42/studio-sdk';
import { type CSSProperties, type ReactNode, useId } from 'react';

import { DeploymentSetBadge } from './deployment-lock';
import {
  isDeploymentSet,
  isNestedRef,
  labelOf,
  placeholderOf,
  type SettingsFieldModel,
  toBool,
  toText,
} from './settings-field';

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

// The field stacks its parts in a column; the lock badge keeps its own width.
const lockStyle: CSSProperties = { alignSelf: 'flex-start' };

export function SettingsField({
  field,
  pending,
  readOnly,
  onChange,
}: {
  readonly field: SettingsFieldModel;
  readonly pending: Record<string, string>;
  readonly readOnly: boolean;
  readonly onChange: (envVar: string, value: string) => void;
}): ReactNode {
  const lockId = `${useId()}-deployment-lock`;
  if (isNestedRef(field)) {
    return (
      <div style={fieldStyle}>
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
  const locked = isDeploymentSet(field);
  const disabled = readOnly || locked;
  const current = locked ? toText(field.value) : (pending[field.env_var] ?? toText(field.value));
  const edit = (value: string): void => {
    if (!locked) onChange(field.env_var, value);
  };
  const describedBy = locked ? lockId : undefined;
  const lockBadge = locked ? (
    <div style={lockStyle}>
      <DeploymentSetBadge id={lockId} />
    </div>
  ) : null;

  if (field.secret) {
    return (
      <Field label={label} description={description}>
        <RevealInput
          idPrefix={`settings-secret-${field.env_var}`}
          value={current}
          placeholder={placeholder}
          readOnly={disabled}
          aria-describedby={describedBy}
          onChange={edit}
        />
        {lockBadge}
      </Field>
    );
  }

  if (field.type === 'boolean') {
    const checked =
      !locked && field.env_var in pending ? pending[field.env_var] === 'true' : toBool(field.value);
    return (
      <div style={fieldStyle}>
        <Checkbox
          label={label}
          checked={checked}
          disabled={disabled}
          aria-describedby={describedBy}
          onCheckedChange={(next) => {
            edit(next ? 'true' : 'false');
          }}
        />
        {lockBadge}
        {description !== undefined ? <p style={descriptionStyle}>{description}</p> : null}
      </div>
    );
  }

  if (field.type === 'integer' || field.type === 'number') {
    return (
      <Field label={label} description={description}>
        <NumberInput
          value={current}
          placeholder={placeholder}
          disabled={disabled}
          aria-describedby={describedBy}
          autoComplete="off"
          onChange={(event) => {
            edit(event.target.value);
          }}
        />
        {lockBadge}
      </Field>
    );
  }

  return (
    <Field label={label} description={description}>
      <TextInput
        value={current}
        placeholder={placeholder}
        disabled={disabled}
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          edit(event.target.value);
        }}
      />
      {lockBadge}
    </Field>
  );
}
