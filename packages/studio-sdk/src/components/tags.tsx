/**
 * Tag rendering + authoring, shared across features. `TagChips` displays a list of
 * labels as escaped chips (server strings are arbitrary — React escapes every one,
 * never an HTML sink). `TagsInput` is the controlled add/remove editor.
 *
 * A tag is a `tai-chip tai-chip-static`: it reads, it is not a control. The
 * control beside it is the `tai-icon-btn` that removes it, which carries the
 * accessible name ("Remove tag <tag>") because its `CloseIcon` is decorative.
 *
 * These live in the SDK because more than one feature (presets, agents, and the
 * version-history panel's per-version tag editor) needs the same control; a single
 * canonical copy keeps the affordance identical everywhere.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';

import { CloseIcon } from './icons';
import { Button } from './primitives';
import { TextInput } from './inputs';

/** A tag and its remove control read as one unit, tighter than the row default. */
const tagGroupStyle: CSSProperties = { gap: 'var(--tai-space-1)' };

/** Read-only chips for a list of tags. Renders nothing when there are none. */
export function TagChips({ tags }: { readonly tags: readonly string[] }): ReactNode {
  if (tags.length === 0) return null;
  return (
    <span className="tai-row" style={tagGroupStyle}>
      {tags.map((tag) => (
        <span key={tag} className="tai-chip tai-chip-static">
          {tag}
        </span>
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
    <div className="tai-stack tai-stack-2">
      <div className="tai-row">
        {/* The input takes the row; the button keeps its intrinsic width. */}
        <div style={{ flex: 1 }}>
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
        </div>
        <Button type="button" onClick={add} disabled={disabled}>
          Add tag
        </Button>
      </div>
      {value.length > 0 ? (
        <div className="tai-row">
          {value.map((tag) => (
            <span key={tag} className="tai-row" style={tagGroupStyle}>
              <span className="tai-chip tai-chip-static">{tag}</span>
              <button
                type="button"
                className="tai-icon-btn"
                aria-label={`Remove tag ${tag}`}
                onClick={() => {
                  remove(tag);
                }}
                disabled={disabled}
              >
                <CloseIcon />
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
