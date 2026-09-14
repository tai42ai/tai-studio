/**
 * The document card: shows the subject's document (a `JsonTree`), offers Edit / Erase
 * on an existing record, drives create/edit through {@link DocumentEditor}, and hosts
 * the danger-confirm erase. Loading and read errors surface loudly in place.
 */
import type { ReactNode } from 'react';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  JsonTree,
  Skeleton,
  errorMessage,
} from '@tai42/studio-sdk';
import type { StateSubjectRef } from '@tai42/api-client';

import { DocumentEditor } from './DocumentEditor';
import type { StateRecordController } from './useStateRecord';

export interface RecordDocumentCardProps {
  readonly subject: StateSubjectRef;
  readonly rec: StateRecordController;
}

export function RecordDocumentCard({ subject, rec }: RecordDocumentCardProps): ReactNode {
  const { record, editor, recordQuery, detailQuery } = rec;
  return (
    <>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--tai-space-2)',
            }}
          >
            <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Document</h3>
            {record !== null && editor.mode === 'closed' ? (
              <div style={{ display: 'flex', gap: 'var(--tai-space-2)' }}>
                <Button
                  type="button"
                  onClick={() => {
                    rec.setEditor({ mode: 'edit' });
                  }}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    rec.setEraseOpen(true);
                  }}
                >
                  Erase
                </Button>
              </div>
            ) : null}
          </div>

          {recordQuery.isPending || detailQuery.isPending ? (
            <Skeleton height={160} />
          ) : recordQuery.isError ? (
            <ErrorState
              message={errorMessage(recordQuery.error)}
              onRetry={() => void recordQuery.refetch()}
            />
          ) : editor.mode !== 'closed' ? (
            <DocumentEditor
              schema={rec.effectiveSchema}
              initial={editor.mode === 'edit' ? (record?.data ?? {}) : undefined}
              pending={rec.saveMutation.isPending}
              error={rec.saveMutation.error}
              onCancel={() => {
                rec.setEditor({ mode: 'closed' });
              }}
              onSave={(data) => {
                rec.saveMutation.mutate(data);
              }}
            />
          ) : record === null ? (
            <EmptyState
              title="No record for this subject yet"
              description="Create a document — the form is seeded from the state's schema, so it validates before it is stored."
              action={
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    rec.setEditor({ mode: 'create' });
                  }}
                >
                  Create
                </Button>
              }
            />
          ) : (
            <>
              <JsonTree data={record.data} label="Record document" />
              {record.folded_from.length > 0 ? (
                <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
                  Folded from {record.folded_from.length} other{' '}
                  {record.folded_from.length === 1 ? 'subject' : 'subjects'}.
                </p>
              ) : null}
            </>
          )}
        </div>
      </Card>

      {rec.eraseOpen ? (
        <ConfirmDialog
          title="Erase record"
          confirmLabel="Erase"
          pendingLabel="Erasing"
          confirmVariant="danger"
          isPending={rec.eraseMutation.isPending}
          error={rec.eraseMutation.error}
          onConfirm={() => {
            rec.eraseMutation.mutate();
          }}
          onClose={() => {
            if (!rec.eraseMutation.isPending) rec.setEraseOpen(false);
          }}
        >
          Erase record &lsquo;{subject.kind} {subject.key}&rsquo;? The document and its audit trail
          stay in the ledger; a new document starts empty.
        </ConfirmDialog>
      ) : null}
    </>
  );
}
