/**
 * The states master table (left pane). One row per declared state, opening `?state=`
 * to drive the detail pane. `Declare state` opens the create form; `Upload` reads a
 * `.json` state or state-template document and PUTs it by its `kind` (a name clash
 * prompts a danger Replace confirm — see {@link useStateUpload}). Loading and read
 * errors surface loudly; an empty list offers the declare door.
 */
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  errorMessage,
  useApi,
  useAppNavigate,
} from '@tai42/studio-sdk';

import { DeclareStateDialog } from './DeclarationTab';
import { statesListKey } from './keys';
import { useStateUpload } from './state-upload';
import { StatesToolbar } from './StatesToolbar';
import { StatesTable } from './StatesTable';
import { ReplaceConfirmDialog } from './ReplaceConfirmDialog';

export function StatesList({ selected }: { readonly selected: string | undefined }): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();
  // Split mode: a state is open on the detail pane, so the master pane is narrow.
  const compact = selected !== undefined;
  const query = useQuery({
    queryKey: statesListKey,
    queryFn: ({ signal }) => api.listStates(signal),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const upload = useStateUpload({ onRefetch: () => query.refetch() });
  const { pendingReplace } = upload;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
      <StatesToolbar
        refreshing={query.isFetching}
        uploading={upload.uploading}
        onRefresh={() => void query.refetch()}
        onDeclare={() => {
          setCreateOpen(true);
        }}
        onFile={(event) => void upload.onFile(event)}
      />

      {upload.uploadError !== null ? (
        <p role="alert" style={{ margin: 0, color: 'var(--tai-color-err-text)' }}>
          {upload.uploadError}
        </p>
      ) : null}

      {query.isPending ? (
        <Skeleton height={200} />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <Card>
          <EmptyState
            title="No states declared"
            description="Declare a state to give every door one document per subject."
            action={
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setCreateOpen(true);
                }}
              >
                Declare state
              </Button>
            }
          />
        </Card>
      ) : (
        <Card>
          <StatesTable states={query.data} selected={selected} compact={compact} />
        </Card>
      )}

      {createOpen ? (
        <DeclareStateDialog
          onClose={() => {
            setCreateOpen(false);
          }}
          onCreated={(name) => {
            setCreateOpen(false);
            navigate('states', { state: name });
          }}
        />
      ) : null}

      {pendingReplace !== null ? (
        <ReplaceConfirmDialog
          title={`Replace '${pendingReplace.name}'?`}
          confirmLabel="Replace"
          onClose={() => {
            upload.setPendingReplace(null);
          }}
          onReplace={async () => {
            await upload.putDocument(
              pendingReplace.document,
              pendingReplace.name,
              pendingReplace.body,
              true,
            );
            upload.setPendingReplace(null);
          }}
        >
          A {pendingReplace.document === 'state-template' ? 'state-template' : 'state'} named{' '}
          <strong>{pendingReplace.name}</strong> already exists. Replace it with the uploaded
          document?
        </ReplaceConfirmDialog>
      ) : null}
    </div>
  );
}
