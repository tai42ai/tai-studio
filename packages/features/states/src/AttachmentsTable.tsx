/**
 * The attachments section: a table of this state's attached templates (template, path,
 * parameter and declaration counts) with per-attachment Edit-declarations and Detach
 * actions, plus an `Attach template` button. Detach runs behind a danger confirm; on
 * success the caller re-reads the affected queries via `onInvalidate`.
 *
 * The confirm lists, as links, every binding that still uses the attachment and holds
 * Detach disabled while the list is non-empty; a refusal at submit that names holders
 * shows them in the same list, with only the refusal's first line as its error.
 */
import { apiRoutes, type StateAttachment, type StateDetail } from '@tai42/api-client';
import {
  Badge,
  Button,
  ConfirmDialog,
  coversAnyRoute,
  EditIcon,
  EmptyState,
  errorMessage,
  HolderPreview,
  type HolderPreviewState,
  isFullProjection,
  previewHolders,
  stateTemplateRefereesKey,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  UnplugIcon,
  useApi,
  useCapabilities,
} from '@tai42/studio-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

const DETACH_PREVIEW_ROUTE = apiRoutes.get_api_states_name_attachments_template_referees.path;

const DETACH_PREVIEW_NO_GRANT =
  'Checking what still uses this is outside your access — it needs read access to states.';

/** The holders that would refuse detaching `template` from `state`, read while the confirm is open. */
function useDetachHolders(state: string, template: string | null): HolderPreviewState {
  const api = useApi();
  const { state: capabilities } = useCapabilities();
  const granted =
    capabilities.status === 'ready' &&
    (isFullProjection(capabilities.projection) ||
      coversAnyRoute(capabilities.projection, [DETACH_PREVIEW_ROUTE]));
  const query = useQuery({
    queryKey: stateTemplateRefereesKey(state, template ?? ''),
    queryFn: ({ signal }) => api.getStateTemplateReferees(state, template ?? '', signal),
    enabled: granted && template !== null,
  });
  if (capabilities.status === 'loading') return { status: 'loading' };
  if (capabilities.status === 'failed') return { status: 'error', error: capabilities.error };
  if (!granted) return { status: 'no-grant', message: DETACH_PREVIEW_NO_GRANT };
  if (query.isError) return { status: 'error', error: query.error };
  if (query.data === undefined) return { status: 'loading' };
  return { status: 'ready', holders: query.data.holders };
}

export interface AttachmentsTableProps {
  readonly state: StateDetail;
  readonly onAttach: () => void;
  readonly onEdit: (attachment: StateAttachment) => void;
  readonly onInvalidate: () => void;
}

/** The attachment rows, each with its Edit-declarations and Detach actions. */
function AttachmentRows({
  attachments,
  onEdit,
  onDetach,
}: {
  readonly attachments: StateDetail['attachments'];
  readonly onEdit: (attachment: StateAttachment) => void;
  readonly onDetach: (template: string) => void;
}): ReactNode {
  return (
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
        {attachments.map((attachment) => (
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
                  style={{ color: 'var(--tai-color-err-text)' }}
                  onClick={() => {
                    onDetach(attachment.template);
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
  );
}

export function AttachmentsTable({
  state,
  onAttach,
  onEdit,
  onInvalidate,
}: AttachmentsTableProps): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [detach, setDetach] = useState<string | null>(null);
  const preview = useDetachHolders(state.name, detach);

  const detachMutation = useMutation({
    mutationFn: (template: string) => api.detachStateTemplate(state.name, template),
    onError: (_error, template) => {
      // The preview went stale (a holder appeared after it); the next open reads afresh.
      void queryClient.invalidateQueries({
        queryKey: stateTemplateRefereesKey(state.name, template),
      });
    },
    onSuccess: () => {
      setDetach(null);
      onInvalidate();
    },
  });

  const refusedHolders = detachMutation.isError ? api.holdersFromError(detachMutation.error) : null;
  const holderState: HolderPreviewState =
    refusedHolders !== null ? { status: 'ready', holders: refusedHolders } : preview;
  const hasHolders = previewHolders(holderState).length > 0;
  // A refusal naming holders shows them in the list, so the error keeps only its headline.
  const detachError = detachMutation.isError
    ? refusedHolders !== null
      ? (errorMessage(detachMutation.error).split('\n')[0] ?? errorMessage(detachMutation.error))
      : detachMutation.error
    : null;

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
          <AttachmentRows
            attachments={state.attachments}
            onEdit={onEdit}
            onDetach={(template) => {
              detachMutation.reset();
              setDetach(template);
            }}
          />
        </div>
      )}

      {detach !== null ? (
        <ConfirmDialog
          title={`Detach '${detach}' from '${state.name}'?`}
          confirmLabel="Detach"
          pendingLabel="Detaching"
          confirmVariant="danger"
          isPending={detachMutation.isPending}
          error={detachError}
          confirmDisabled={hasHolders}
          onConfirm={() => {
            detachMutation.mutate(detach);
          }}
          onClose={() => {
            if (!detachMutation.isPending) setDetach(null);
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
            <p style={{ margin: 0 }}>
              The template&rsquo;s structure, template jq and declarations are removed from this
              state; stored data under the attachment path stays.
            </p>
            <HolderPreview
              state={holderState}
              lead="Still used by — change these bindings first:"
              label={`Holders of ${detach}`}
              onNavigate={() => {
                setDetach(null);
              }}
            />
          </div>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}
