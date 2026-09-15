/**
 * The per-row Edit door: a `Dialog` that supplies the chrome for a chrome-free
 * {@link RegisterHookForm} prefilled from the row's hook, saving back over it and
 * closing on success.
 */
import type { HookParams } from '@tai42/api-client';
import { Dialog } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { RegisterHookForm } from './RegisterHookForm';

export interface EditHookDialogProps {
  readonly hook: HookParams;
  readonly onClose: () => void;
}

export function EditHookDialog({ hook, onClose }: EditHookDialogProps): ReactNode {
  return (
    <Dialog
      open
      title="Edit hook"
      description={`Save to replace the current registration for "${hook.name}".`}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <RegisterHookForm initial={hook} onClose={onClose} />
    </Dialog>
  );
}
