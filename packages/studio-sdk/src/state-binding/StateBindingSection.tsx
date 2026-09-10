/**
 * The collapsed "Bind state (optional)" section every platform door screen adds
 * below its own fields. It is chrome only — the door fetches the catalogs (via its
 * own api-client + query stack) and passes them in; this wraps `StateBindingEditor`
 * in a keyboard-native disclosure that opens when a binding already exists.
 */
import { useState, type ReactNode } from 'react';

import { Button } from '../components/primitives';
import { StateBindingEditor, type StateBindingEditorProps } from './StateBindingEditor';

export interface StateBindingSectionProps extends StateBindingEditorProps {
  /** Copy on the disclosure toggle. */
  readonly label?: string;
}

export function StateBindingSection({
  label = 'Bind state (optional)',
  ...editor
}: StateBindingSectionProps): ReactNode {
  const [open, setOpen] = useState((editor.value?.states.length ?? 0) > 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
      <Button
        type="button"
        variant="ghost"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        {label}
      </Button>
      {open ? <StateBindingEditor {...editor} /> : null}
    </div>
  );
}
