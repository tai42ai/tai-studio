/**
 * The attachments section: a table of this state's attached templates (template, path,
 * parameter and declaration counts) with per-attachment Edit-declarations and Detach
 * actions, plus an `Attach template` button. Detach runs behind a danger confirm; on
 * success the caller re-reads the affected queries via `onInvalidate`.
 */
import type { StateAttachment, StateDetail } from '@tai42/api-client';
import {
  Badge,
  Button,
  ConfirmDialog,
  EditIcon,
  EmptyState,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  UnplugIcon,
  useApi,
} from '@tai42/studio-sdk';
import { useMutation } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

export interface AttachmentsTableProps {
  readonly state: StateDetail;
  readonly onAttach: () => void;
  readonly onEdit: (attachment: StateAttachment) => void;
  readonly onInvalidate: () => void;
}

export function AttachmentsTable({
  state,
  onAttach,
  onEdit,
  onInvalidate,
}: AttachmentsTableProps): ReactNode {
  const api = useApi();
  const [detach, setDetach] = useState<string | null>(null);

  const detachMutation = useMutation({
    mutationFn: (template: string) => api.detachStateTemplate(state.name, template),
    onSuccess: () => {
      setDetach(null);
      onInvalidate();
    },
  });

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--tai-space-2)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Attachments</h3>
        <Button type="button" variant="primary" onClick={onAttach}>
          Attach template
        </Button>
      </div>
      {state.attachments.length === 0 ? (
        <EmptyState
          title="No templates attached"
          description="Attach a template to add its structure, template jq and declarations to this state."
          action={
            <Button type="button" variant="primary" onClick={onAttach}>
              Attach template
            </Button>
          }
        />
      ) : (
        // Wide content scrolls INSIDE the card rather than clipping the split-view pane.
        <div style={{ overflowX: 'auto' }}>
          <Table>
            <THead>
              <TR>
                <TH>Template</TH>
                <TH>Path</TH>
                <TH>Parameters</TH>
                <TH>Declarations</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {state.attachments.map((attachment) => (
                <TR key={`${attachment.template}:${attachment.path.join('/')}`}>
                  <TD>
                    <Badge variant="primary">{attachment.template}</Badge>
                  </TD>
                  <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>
                    {attachment.path.length > 0 ? attachment.path.join(' / ') : '(root)'}
                  </TD>
                  <TD>{Object.keys(attachment.parameters).length}</TD>
                  <TD>{Object.keys(attachment.declarations).length}</TD>
                  <TD>
                    <div
                      style={{
                        display: 'flex',
                        gap: 'var(--tai-space-2)',
                        justifyContent: 'flex-end',
                        flexWrap: 'nowrap',
                      }}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label="Edit declarations"
                        title="Edit declarations"
                        onClick={() => {
                          onEdit(attachment);
                        }}
                      >
                        <EditIcon aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label="Detach"
                        title="Detach"
                        style={{ color: 'var(--tai-color-danger)' }}
                        onClick={() => {
                          setDetach(attachment.template);
                        }}
                      >
                        <UnplugIcon aria-hidden="true" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {detach !== null ? (
        <ConfirmDialog
          title={`Detach '${detach}' from '${state.name}'?`}
          confirmLabel="Detach"
          pendingLabel="Detaching"
          confirmVariant="danger"
          isPending={detachMutation.isPending}
          error={detachMutation.error}
          onConfirm={() => {
            detachMutation.mutate(detach);
          }}
          onClose={() => {
            if (!detachMutation.isPending) setDetach(null);
          }}
        >
          The template&rsquo;s structure, template jq and declarations are removed from this state;
          stored data under the attachment path stays.
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
