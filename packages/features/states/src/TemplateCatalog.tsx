/** The state-template catalog: every platform template, with an upload door and a
 * guarded delete (refused while any state still attaches the template). */
import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Skeleton,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import type { StateTemplateListItem } from '@tai42/api-client';

import { stateTemplatesKey } from './keys';
import { useTemplateUpload } from './useTemplateUpload';
import { TemplateCatalogTable } from './TemplateCatalogTable';
import { ReplaceConfirmDialog } from './ReplaceConfirmDialog';

export interface TemplateCatalogProps {
  readonly templates: readonly StateTemplateListItem[];
  readonly loading: boolean;
  readonly error: unknown;
}

export function TemplateCatalog({ templates, loading, error }: TemplateCatalogProps): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const upload = useTemplateUpload();
  const { pendingReplace } = upload;
  const [deleteName, setDeleteName] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.deleteStateTemplate(name),
    onSuccess: () => {
      setDeleteName(null);
      void queryClient.invalidateQueries({ queryKey: stateTemplatesKey });
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
        <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>State templates</h3>
        <label className="tai-btn" style={{ cursor: 'pointer' }}>
          Upload template
          <input
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(event) => void upload.onFile(event)}
          />
        </label>
      </div>
      {upload.uploadError !== null ? (
        <p role="alert" style={{ margin: 0, color: 'var(--tai-color-err-text)' }}>
          {upload.uploadError}
        </p>
      ) : null}
      {loading ? (
        <Skeleton height={120} />
      ) : error !== null && error !== undefined ? (
        <ErrorState message={errorMessage(error)} />
      ) : templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Upload a template document to give states a declared structure, template jq and declarations."
        />
      ) : (
        <TemplateCatalogTable templates={templates} onDelete={setDeleteName} />
      )}

      {deleteName !== null ? (
        <ConfirmDialog
          title={`Delete template '${deleteName}'?`}
          confirmLabel="Delete template"
          pendingLabel="Deleting"
          confirmVariant="danger"
          isPending={deleteMutation.isPending}
          error={deleteMutation.error}
          onConfirm={() => {
            deleteMutation.mutate(deleteName);
          }}
          onClose={() => {
            if (!deleteMutation.isPending) setDeleteName(null);
          }}
        >
          Deleting removes the document. This can not be undone.
        </ConfirmDialog>
      ) : null}

      {pendingReplace !== null ? (
        <ReplaceConfirmDialog
          title={`Replace template '${pendingReplace.name}'?`}
          confirmLabel="Replace template"
          onClose={() => {
            upload.setPendingReplace(null);
          }}
          onReplace={async () => {
            await upload.putTemplate(pendingReplace.name, pendingReplace.body, true);
            upload.setPendingReplace(null);
          }}
        >
          A template with this name exists. Replacing it rewrites the document; attached states keep
          their values and are re-validated.
        </ReplaceConfirmDialog>
      ) : null}
    </section>
  );
}
