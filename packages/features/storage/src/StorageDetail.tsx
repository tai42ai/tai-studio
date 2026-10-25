/**
 * One stored object's detail, read through the entry door: its id, content type,
 * size and kind, its content (text and documents), the render preview (text on the
 * templates doors), and the actions row (Download, Delete). The actions row needs
 * only the id, so it renders whatever the entry read answers: an object the server
 * refuses to show keeps its Download and Delete.
 */
import { ApiError, type StoredEntry, type TemplateEntry } from '@tai42/api-client';
import {
  AppLink,
  Badge,
  Button,
  Card,
  CodeBlock,
  downloadBlob,
  errorMessage,
  ErrorState,
  FeatureDisabled,
  featureDisabledMessage,
  isFeatureDisabled,
  Skeleton,
  Spinner,
  useApi,
  useAppNavigate,
} from '@tai42/studio-sdk';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type ReactNode, type Ref, useId, useState } from 'react';

import { storageEntryKey } from './keys';
import { RenderPreview } from './RenderPreview';
import { DeleteResourceDialog } from './storage-dialogs';
import { basename } from './storage-view';
import type { StorageDoors } from './use-storage-doors';

type Entry = StoredEntry | TemplateEntry;

const KIND_LABEL: Record<Entry['kind'], string> = {
  text: 'Text',
  document: 'Document',
  binary: 'Binary',
};

/** Human-readable byte size (`5 B`, `1.5 KB`, `2.0 MB`). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** A retry can succeed only after a network failure or a server fault (5xx). */
function retriable(error: unknown): boolean {
  return !(error instanceof ApiError) || error.status >= 500;
}

function EntryBody({
  entry,
  doors,
}: {
  readonly entry: Entry;
  readonly doors: StorageDoors;
}): ReactNode {
  const schemaError = 'schema_error' in entry ? entry.schema_error : null;
  return (
    <>
      <p className="tai-muted" style={{ margin: 0 }}>
        {entry.content_type ?? 'unknown type'} · {formatBytes(entry.size)}{' '}
        <Badge variant="neutral">{KIND_LABEL[entry.kind]}</Badge>
      </p>
      {entry.kind === 'binary' ? (
        <p style={{ margin: 0 }}>Binary object: no text preview.</p>
      ) : (
        <section className="tai-stack tai-stack-2">
          <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Content</h3>
          <CodeBlock code={entry.content} language="content" />
          {entry.kind === 'document' ? (
            <p className="tai-muted" style={{ margin: 0 }}>
              Extracted text; this object is not a template.
            </p>
          ) : null}
        </section>
      )}
      {entry.kind === 'text' && schemaError !== null ? <ErrorState message={schemaError} /> : null}
      {entry.kind === 'text' ? (
        doors.render ? (
          <RenderPreview templateId={entry.id} blocked={schemaError !== null} />
        ) : doors.templatesMounted ? (
          <p role="status" className="tai-muted" style={{ margin: 0 }}>
            Render preview is outside your access — it needs the templates write grant.
          </p>
        ) : null
      ) : null}
    </>
  );
}

function EntryRead({
  id,
  doors,
  filter,
}: {
  readonly id: string;
  readonly doors: StorageDoors;
  readonly filter: string | undefined;
}): ReactNode {
  const api = useApi();
  const door = doors.entry;
  const entry = useQuery({
    queryKey: storageEntryKey(id),
    queryFn: ({ signal }): Promise<Entry> =>
      door === 'storage' ? api.readStorageResource(id, signal) : api.getTemplate(id),
    enabled: door !== null,
  });
  if (door === null) {
    return (
      <p role="status" className="tai-muted" style={{ margin: 0 }}>
        Opening a stored object needs the storage read grant or the templates write grant.
      </p>
    );
  }
  if (entry.isPending) return <Skeleton height={160} />;
  if (entry.isError) {
    const error = entry.error;
    if (isFeatureDisabled(error)) {
      return <FeatureDisabled feature="File loading" message={featureDisabledMessage(error)} />;
    }
    if (error instanceof ApiError && error.status === 404) {
      return (
        <>
          <ErrorState message={`Resource ${id} not found.`} />
          <AppLink to="storage" search={{ q: filter }} className="tai-link">
            Back to all resources
          </AppLink>
        </>
      );
    }
    return (
      <ErrorState
        message={errorMessage(error)}
        onRetry={retriable(error) ? () => void entry.refetch() : undefined}
      />
    );
  }
  return <EntryBody entry={entry.data} doors={doors} />;
}

export function StorageDetail({
  id,
  doors,
  filter,
  headingRef,
}: {
  readonly id: string;
  readonly doors: StorageDoors;
  /** The active `?q=`, kept by the links that clear the selection. */
  readonly filter: string | undefined;
  readonly headingRef: Ref<HTMLHeadingElement>;
}): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();
  const headingId = useId();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const download = useMutation({
    mutationFn: async () => {
      const blob = await api.downloadStorageResource(id);
      downloadBlob(blob, basename(id));
    },
  });
  const deleteDoor = doors.deleteDoor;

  return (
    <Card>
      <section aria-labelledby={headingId} className="tai-stack">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="tai-card-title tai-mono"
          style={{ overflowWrap: 'anywhere' }}
        >
          {id}
        </h2>
        <EntryRead id={id} doors={doors} filter={filter} />
        {doors.download || deleteDoor !== null ? (
          <div style={{ display: 'flex', gap: 'var(--tai-space-2)', flexWrap: 'wrap' }}>
            {doors.download ? (
              <Button
                aria-label={`Download ${id}`}
                disabled={download.isPending}
                onClick={() => {
                  download.mutate();
                }}
              >
                {download.isPending ? <Spinner label="Downloading" /> : null}
                Download
              </Button>
            ) : null}
            {deleteDoor !== null ? (
              <Button
                variant="ghost"
                aria-label={`Delete ${id}`}
                onClick={() => {
                  setDeleteOpen(true);
                }}
              >
                Delete
              </Button>
            ) : null}
          </div>
        ) : null}
        {download.isError ? <ErrorState message={errorMessage(download.error)} /> : null}
      </section>
      {deleteOpen && deleteDoor !== null ? (
        <DeleteResourceDialog
          id={id}
          door={deleteDoor}
          onDeleted={() => {
            navigate('storage', { q: filter });
          }}
          onClose={() => {
            setDeleteOpen(false);
          }}
        />
      ) : null}
    </Card>
  );
}
