/**
 * `ToolPicker`'s typed entry: the control it draws when the session may not list tools
 * (the read answered 403). The server checks a named tool on save, so a reader who
 * knows the name can still fill the field; the note under the input says why there is
 * no list.
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

/** The sentence under the typed entry, naming why there is no list and what saving does. */
export const TOOL_LIST_REFUSED_NOTE =
  "This session cannot list tools, so type the tool's exact name. Saving checks that the deployment serves it.";

const NOTE_STYLE = { margin: 0, color: 'var(--tai-color-text-muted)' } as const;

export interface ToolNameEntryProps {
  /** The stored name, or `null` for none. */
  readonly value: string | null;
  readonly onChange: (toolName: string) => void;
  readonly disabled: boolean;
  /** Names the input when no enclosing `Field` labels it; a `Field`'s label wins. */
  readonly ariaLabel: string | undefined;
}

export function ToolNameEntry({
  value,
  onChange,
  disabled,
  ariaLabel,
}: ToolNameEntryProps): ReactNode {
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
        {TOOL_LIST_REFUSED_NOTE}
      </p>
    </>
  );
}
