/**
 * One settings-class field, typed by its schema descriptor: a nested-group reference
 * (read-only), a secret RevealInput, a boolean checkbox, a numeric input, or a text
 * input. A pending edit (keyed by env var) overrides the reported value.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Checkbox, Field, NumberInput, RevealInput, TextInput } from '@tai42/studio-sdk';

import {
  isNestedRef,
  labelOf,
  placeholderOf,
  toBool,
  toText,
  type SettingsFieldModel,
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

  if (field.secret) {
    const current = pending[field.env_var] ?? toText(field.value);
    return (
      <Field label={label} description={description}>
        <RevealInput
          idPrefix={`settings-secret-${field.env_var}`}
          value={current}
          placeholder={placeholder}
          readOnly={readOnly}
          onChange={(value) => {
            onChange(field.env_var, value);
          }}
        />
      </Field>
    );
  }

  if (field.type === 'boolean') {
    const checked =
      field.env_var in pending ? pending[field.env_var] === 'true' : toBool(field.value);
    return (
      <div style={fieldStyle}>
        <Checkbox
          label={label}
          checked={checked}
          disabled={readOnly}
          onCheckedChange={(next) => {
            onChange(field.env_var, next ? 'true' : 'false');
          }}
        />
        {description !== undefined ? <p style={descriptionStyle}>{description}</p> : null}
      </div>
    );
  }

  if (field.type === 'integer' || field.type === 'number') {
    const current = pending[field.env_var] ?? toText(field.value);
    return (
      <Field label={label} description={description}>
        <NumberInput
          value={current}
          placeholder={placeholder}
          disabled={readOnly}
          autoComplete="off"
          onChange={(event) => {
            onChange(field.env_var, event.target.value);
          }}
        />
      </Field>
    );
  }

  const current = pending[field.env_var] ?? toText(field.value);
  return (
    <Field label={label} description={description}>
      <TextInput
        value={current}
        placeholder={placeholder}
        disabled={readOnly}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          onChange(field.env_var, event.target.value);
        }}
      />
    </Field>
  );
}
