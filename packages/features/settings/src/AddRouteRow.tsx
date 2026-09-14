/**
 * The per-scope inline row for mapping a route onto a scope, with an optional
 * dynamic-pattern regex covering the route's subtree.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Button, Checkbox, Field, TextInput } from '@tai42/studio-sdk';
import type { AddUrlToScopeBody } from '@tai42/api-client';

const inlineFormStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-2)',
  alignItems: 'flex-end',
  marginTop: 'var(--tai-space-3)',
};

export function AddRouteRow({
  scopeId,
  disabled,
  onAdd,
}: {
  readonly scopeId: string;
  readonly disabled: boolean;
  readonly onAdd: (body: AddUrlToScopeBody) => void;
}): ReactNode {
  const [url, setUrl] = useState('');
  const [usePattern, setUsePattern] = useState(false);
  const [pattern, setPattern] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (): void => {
    const trimmed = url.trim();
    if (!trimmed.startsWith('/')) {
      setError('A route path must start with "/".');
      return;
    }
    const body: AddUrlToScopeBody =
      usePattern && pattern.trim().length > 0
        ? { scope_id: scopeId, url: trimmed, pattern: pattern.trim() }
        : { scope_id: scopeId, url: trimmed };
    onAdd(body);
    setUrl('');
    setPattern('');
    setUsePattern(false);
    setError(null);
  };

  return (
    <div style={inlineFormStyle}>
      <Field label="Add route" error={error ?? undefined} style={{ flex: 1 }}>
        <TextInput
          aria-label={`Add route to ${scopeId}`}
          value={url}
          autoComplete="off"
          placeholder="/some/path"
          disabled={disabled}
          onChange={(event) => {
            setUrl(event.target.value);
            if (error !== null) setError(null);
          }}
        />
      </Field>
      <Checkbox
        label="Dynamic pattern"
        checked={usePattern}
        onCheckedChange={setUsePattern}
        disabled={disabled}
      />
      {usePattern ? (
        <Field label="Pattern (regex)" style={{ flex: 1 }}>
          <TextInput
            aria-label={`Pattern (regex) for route added to ${scopeId}`}
            value={pattern}
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => {
              setPattern(event.target.value);
            }}
          />
        </Field>
      ) : null}
      <Button type="button" variant="primary" disabled={disabled} onClick={submit}>
        Add route
      </Button>
    </div>
  );
}
