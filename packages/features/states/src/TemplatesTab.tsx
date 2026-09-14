/**
 * The Templates tab. {@link AttachmentsTable} lists this state's attachments with
 * Edit-declarations and Detach actions and an `Attach template` door; below,
 * {@link TemplateCatalog} lists every platform template with an upload door and a
 * guarded delete. Attach / edit run through {@link AttachTemplateDialog} and
 * {@link EditDeclarationsDialog}.
 */
import { useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FeatureDisabled,
  featureDisabledMessage,
  isFeatureDisabled,
  useApi,
} from '@tai42/studio-sdk';
import type { StateAttachment, StateDetail } from '@tai42/api-client';

import { stateAttachmentsKey, stateDetailKey, stateTemplatesKey, statesListKey } from './keys';
import { AttachmentsTable } from './AttachmentsTable';
import { AttachTemplateDialog } from './AttachTemplateDialog';
import { EditDeclarationsDialog } from './EditDeclarationsDialog';
import { TemplateCatalog } from './TemplateCatalog';

export function TemplatesTab({ state }: { readonly state: StateDetail }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const templatesQuery = useQuery({
    queryKey: stateTemplatesKey,
    queryFn: ({ signal }) => api.listStateTemplates(signal),
  });

  const [attachOpen, setAttachOpen] = useState(false);
  const [editAttachment, setEditAttachment] = useState<StateAttachment | null>(null);

  const invalidateState = (): void => {
    void queryClient.invalidateQueries({ queryKey: stateDetailKey(state.name) });
    void queryClient.invalidateQueries({ queryKey: statesListKey });
    void queryClient.invalidateQueries({ queryKey: stateAttachmentsKey(state.name) });
    // Attach/detach changes the catalog's server-derived `attached_to` count (and the
    // Delete gating that reads it), so the catalog query must refetch too.
    void queryClient.invalidateQueries({ queryKey: stateTemplatesKey });
  };

  if (templatesQuery.isError && isFeatureDisabled(templatesQuery.error)) {
    return (
      <FeatureDisabled feature="States" message={featureDisabledMessage(templatesQuery.error)} />
    );
  }

  const templates = templatesQuery.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-5)' }}>
      <AttachmentsTable
        state={state}
        onAttach={() => {
          setAttachOpen(true);
        }}
        onEdit={setEditAttachment}
        onInvalidate={invalidateState}
      />

      <TemplateCatalog
        templates={templates}
        loading={templatesQuery.isPending}
        error={templatesQuery.error}
      />

      {attachOpen ? (
        <AttachTemplateDialog
          stateName={state.name}
          schema={state.effective_schema ?? {}}
          attachedTemplates={state.attachments.map((a) => a.template)}
          templates={templates}
          onClose={() => {
            setAttachOpen(false);
          }}
          onAttached={() => {
            setAttachOpen(false);
            invalidateState();
          }}
        />
      ) : null}

      {editAttachment !== null ? (
        <EditDeclarationsDialog
          stateName={state.name}
          attachment={editAttachment}
          template={templates.find((t) => t.name === editAttachment.template)}
          onClose={() => {
            setEditAttachment(null);
          }}
          onSaved={() => {
            setEditAttachment(null);
            invalidateState();
          }}
        />
      ) : null}
    </div>
  );
}
