/**
 * The inline row for naming a new scope, validated before it becomes a pending zone.
 */
import { Button, Field, TextInput } from '@tai42/studio-sdk';
import { type CSSProperties, type ReactNode, useState } from 'react';

import { PUBLIC_MARKER } from './scope-mapping';

const inlineFormStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-2)',
  alignItems: 'flex-end',
  marginTop: 'var(--tai-space-3)',
};

const SCOPE_ID_RE = /^[a-zA-Z0-9_\- ]+$/;

export function CreateScopeRow({
  existingIds,
  onCreate,
}: {
  readonly existingIds: ReadonlySet<string>;
  readonly onCreate: (scopeId: string) => void;
}): ReactNode {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setError('Enter a scope name.');
      return;
    }
    if (!SCOPE_ID_RE.test(trimmed)) {
      setError('Scope names may contain only letters, numbers, spaces, hyphens and underscores.');
      return;
    }
    if (trimmed === PUBLIC_MARKER) {
      setError('“public” is the reserved public marker, not a scope. Use the Public zone.');
      return;
    }
    if (existingIds.has(trimmed)) {
      setError('A scope with that name already exists.');
      return;
    }
    onCreate(trimmed);
    setValue('');
    setError(null);
  };

  return (
    <div style={inlineFormStyle}>
      <Field label="New scope" error={error ?? undefined} style={{ flex: 1 }}>
        <TextInput
          aria-label="New scope name"
          value={value}
          autoComplete="off"
          onChange={(event) => {
            setValue(event.target.value);
            if (error !== null) setError(null);
          }}
        />
      </Field>
      <Button type="button" variant="primary" onClick={submit}>
        Add scope
      </Button>
    </div>
  );
}
