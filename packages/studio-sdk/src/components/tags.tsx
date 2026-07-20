/**
 * Tag rendering + authoring, shared across features. `TagChips` displays a list of
 * labels as escaped chips (server strings are arbitrary — React escapes every one,
 * never an HTML sink). `TagsInput` is the controlled add/remove editor.
 *
 * These live in the SDK because more than one feature (presets, agents, and the
 * version-history panel's per-version tag editor) needs the same control; a single
 * canonical copy keeps the affordance identical everywhere.
 */
import { useState, type ReactNode } from 'react';

import { Badge } from './badge';
import { Button } from './primitives';
import { TextInput } from './inputs';

/** Read-only chips for a list of tags. Renders nothing when there are none. */
export function TagChips({ tags }: { readonly tags: readonly string[] }): ReactNode {
  if (tags.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 'var(--tai-space-1)' }}>
      {tags.map((tag) => (
        <Badge key={tag} variant="primary">
          {tag}
        </Badge>
      ))}
    </span>
  );
}

/**
 * Controlled tag editor. The caller owns the `value` list; `onChange` receives the
 * next list on every add/remove. A blank or duplicate entry is ignored (never a
 * silent duplicate chip). Enter or comma commits the draft chip.
 */
export function TagsInput({
  value,
  onChange,
  disabled,
}: {
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly disabled?: boolean;
}): ReactNode {
  const [draft, setDraft] = useState('');

  const add = (): void => {
    const tag = draft.trim();
    if (tag === '' || value.includes(tag)) {
      setDraft('');
      return;
    }
    onChange([...value, tag]);
    setDraft('');
  };

  const remove = (tag: string): void => {
    onChange(value.filter((existing) => existing !== tag));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
      <div style={{ display: 'flex', gap: 'var(--tai-space-2)' }}>
        <TextInput
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            // Enter or comma commits the draft chip.
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add();
            }
          }}
          placeholder="Add a tag…"
          aria-label="Add a tag"
          disabled={disabled}
        />
        <Button type="button" onClick={add} disabled={disabled}>
          Add tag
        </Button>
      </div>
      {value.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--tai-space-1)' }}>
          {value.map((tag) => (
            <span
              key={tag}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--tai-space-1)' }}
            >
              <Badge variant="primary">{tag}</Badge>
              <Button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => {
                  remove(tag);
                }}
                disabled={disabled}
                style={{ padding: '0 var(--tai-space-2)' }}
              >
                ×
              </Button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
