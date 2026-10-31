/**
 * The typed entry a name picker draws when the session may not list the names (the
 * read answered 403): `ToolPicker`, `AgentPicker` and `ChannelPicker` all draw it. The
 * server checks a named reference on save, so a reader who knows the name can still
 * fill the field; the picker's note under the input says why there is no list.
 *
 * The input holds a draft while the reader types and hands the trimmed name to
 * `onChange` on blur or Enter, so a host that acts on every change (an "add" control
 * that appends each emitted name) receives one whole name, never each keystroke. Enter
 * commits instead of submitting the enclosing form, since the form would otherwise read
 * the value from before the commit. A blank draft emits nothing: the input shows the
 * stored value again.
 */
import { type KeyboardEvent, type ReactNode, useId, useState } from 'react';

import { useFieldControl } from './field';
import { TextInput } from './inputs';

const NOTE_STYLE = { margin: 0, color: 'var(--tai-color-text-muted)' } as const;

export interface TypedNameEntryProps {
  /** The stored name, or `null` for none. */
  readonly value: string | null;
  readonly onChange: (name: string) => void;
  readonly disabled: boolean;
  /** Names the input when no enclosing `Field` labels it; a `Field`'s label wins. */
  readonly ariaLabel: string | undefined;
  /** The sentence under the input: why there is no list, and what saving checks. */
  readonly note: string;
}

export function TypedNameEntry({
  value,
  onChange,
  disabled,
  ariaLabel,
  note,
}: TypedNameEntryProps): ReactNode {
  const noteId = useId();
  const labelled = useFieldControl().id !== undefined;
  const [draft, setDraft] = useState<string | undefined>(undefined);

  const commit = (): void => {
    if (draft === undefined) return;
    const name = draft.trim();
    setDraft(undefined);
    if (name !== '' && name !== value) onChange(name);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commit();
  };

  return (
    <>
      <TextInput
        value={draft ?? value ?? ''}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
        disabled={disabled}
        aria-label={labelled ? undefined : ariaLabel}
        aria-describedby={noteId}
        autoComplete="off"
        spellCheck={false}
      />
      <p id={noteId} role="status" style={NOTE_STYLE}>
        {note}
      </p>
    </>
  );
}
