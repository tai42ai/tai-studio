/** Edit one attachment's static declaration values, over the template's declarations schema. */
import { useState, type ReactNode } from 'react';
import { FormDialog, SchemaForm } from '@tai42/studio-sdk';
import type {
  StateAttachment,
  StateAttachmentBody,
  StateTemplateListItem,
} from '@tai42/api-client';
import { useApi } from '@tai42/studio-sdk';

import { declarationsSchema, declaresAnything } from './stateTemplateSchemas';
import { reconcileOrphans, type OrphanRecord } from './reconcileOrphans';
import { OrphanResolveFields } from './OrphanResolveFields';

export interface EditDeclarationsDialogProps {
  readonly stateName: string;
  readonly attachment: StateAttachment;
  readonly template: StateTemplateListItem | undefined;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

export function EditDeclarationsDialog({
  stateName,
  attachment,
  template,
  onClose,
  onSaved,
}: EditDeclarationsDialogProps): ReactNode {
  const api = useApi();
  const schema = declarationsSchema(template);
  const [value, setValue] = useState<unknown>(attachment.declarations);
  // When the edit would orphan open records the server refuses with a 422 whose body
  // carries `{ reconcile: true, orphans: [...] }`; the resolve step keys on THAT
  // structured data and the operator names a reconcile resolution.
  const [orphans, setOrphans] = useState<readonly OrphanRecord[] | null>(null);
  const [resolution, setResolution] = useState('');

  const onSubmit = async (): Promise<void> => {
    const body: StateAttachmentBody = {
      declarations: (value ?? {}) as Record<string, unknown>,
      // Once the refusal has surfaced, the retry carries the close directive.
      ...(orphans !== null ? { options: { orphans: 'close', resolution } } : {}),
    };
    try {
      await api.patchStateAttachment(stateName, attachment.template, body);
      onSaved();
    } catch (error) {
      // A reconcile refusal reveals the resolve view from its STRUCTURED payload; any
      // other error surfaces as-is. The throw keeps the dialog open — FormDialog closes
      // ONLY on a resolved submit.
      const found = reconcileOrphans(error);
      if (orphans === null && found !== null) setOrphans(found);
      throw error;
    }
  };

  return (
    <FormDialog
      title={`Edit declarations of '${attachment.template}'`}
      submitLabel={orphans !== null ? 'Close orphans and save' : 'Save changes'}
      pendingLabel="Saving"
      submitDisabled={orphans !== null && resolution.trim() === ''}
      onSubmit={onSubmit}
      onClose={onClose}
    >
      {declaresAnything(schema) ? (
        <SchemaForm schema={schema} value={value} onChange={setValue} />
      ) : (
        <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
          This template declares nothing.
        </p>
      )}
      {orphans !== null ? (
        <OrphanResolveFields
          orphans={orphans}
          resolution={resolution}
          onResolutionChange={setResolution}
        />
      ) : null}
    </FormDialog>
  );
}
