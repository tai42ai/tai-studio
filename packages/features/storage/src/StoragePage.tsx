/**
 * The `/storage` feature page: the content store a storage-provider plugin
 * exposes. Two honesty layers stack:
 *
 *  - the PROVIDER card (`getStorageInfo`) — storage is dead by default (the
 *    skeleton ships no provider), so `present: false` renders a calm EmptyState and
 *    nothing else. When present it shows the provider class + module verbatim.
 *  - the RESOURCE browser (only when a provider is present) — `listStorageResources`
 *    served as a `{ resources }` id list, explored through the shared
 *    {@link ExplorerView}: path-shaped ids fold into virtual folders (a folder
 *    exists only through its members), per-file stat / download / delete stay on the
 *    row/card, and a folder carries the delete-directory action for its own prefix.
 *
 * Every server-supplied value (provider identity, resource ids, stat fields, error
 * messages) renders as ESCAPED React text — never through an HTML sink. Failures
 * surface loudly through `ErrorState`; a server error message is shown verbatim.
 */
import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AppLink,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  ExplorerView,
  Field,
  JsonTree,
  PageHeader,
  RadioGroup,
  Skeleton,
  Spinner,
  TD,
  Textarea,
  TextInput,
  downloadBlob,
  errorMessage,
  useApi,
  useSearchCommit,
  type ExplorerColumn,
  type ExplorerEmptyStates,
  type Folder,
  type PageProps,
  type RouteSearch,
} from '@tai42/studio-sdk';

import { deriveFolders, parentPrefix } from './folders';
import { storageInfoKey, storageResourcesKey, storageStatKey } from './keys';

const monoStyle: CSSProperties = { fontFamily: 'var(--tai-font-mono)', wordBreak: 'break-all' };

/** The explorer's list/card view-mode persistence key. */
const STORAGE_VIEW_SURFACE = 'studio-storage';

/** The filter box's accessible name; the commit listener keys the search input on it. */
const SEARCH_LABEL = 'Filter resources';

/** The resource table's columns; folder rows span both. */
const COLUMNS: ExplorerColumn[] = [
  { key: 'resource', header: 'Resource' },
  { key: 'actions', header: <span style={{ display: 'block', textAlign: 'right' }}>Actions</span> },
];

const EMPTY_STATES: ExplorerEmptyStates = {
  empty: {
    title: 'No resources',
    description: 'The storage provider holds no objects yet. Upload one to get started.',
  },
  emptyFolder: {
    title: 'This directory is empty',
    description: 'No resources or subdirectories are filed here.',
  },
  noMatch: {
    title: 'No matching resources',
    description: 'No id contains the filter text.',
  },
};

/** The final `/`-separated segment of an id — the download filename and card name. */
function basename(id: string): string {
  const parts = id.split('/');
  const last = parts[parts.length - 1];
  return last === undefined || last === '' ? id : last;
}

/**
 * A dialog showing one resource's stat fields (`statStorageResource`) rendered as a
 * `JsonTree`. The stat is fetched on open; a `content_type: null` (unknown suffix)
 * renders without error.
 */
function StatDialog({ id, onClose }: { id: string; onClose: () => void }): ReactNode {
  const api = useApi();
  const stat = useQuery({
    queryKey: storageStatKey(id),
    queryFn: ({ signal }) => api.statStorageResource(id, signal),
  });

  return (
    <Dialog
      title="Resource stat"
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <p style={{ margin: '0 0 var(--tai-space-3)', ...monoStyle }}>{id}</p>
      {stat.isPending ? (
        <Skeleton height={64} />
      ) : stat.isError ? (
        <ErrorState message={errorMessage(stat.error)} onRetry={() => void stat.refetch()} />
      ) : (
        <JsonTree data={stat.data} defaultExpanded label={`Metadata for ${id}`} />
      )}
    </Dialog>
  );
}

/** The danger confirm that removes one resource and invalidates the id list. */
function DeleteResourceDialog({ id, onClose }: { id: string; onClose: () => void }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.deleteStorageResource(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: storageResourcesKey });
      onClose();
    },
  });

  return (
    <ConfirmDialog
      title="Delete resource"
      confirmLabel="Delete"
      pendingLabel="Deleting resource"
      onConfirm={() => {
        remove.mutate();
      }}
      onClose={onClose}
      isPending={remove.isPending}
      error={remove.error}
    >
      <p style={{ margin: 0 }}>
        Delete <strong style={monoStyle}>{id}</strong>? This cannot be undone.
      </p>
    </ConfirmDialog>
  );
}

/**
 * The delete-directory confirm for one folder prefix: a danger confirm that removes
 * the whole subtree (`deleteStorageDir`) and invalidates the id list. A rejected
 * delete renders the server message verbatim.
 */
function DeleteDirDialog({ dir, onClose }: { dir: string; onClose: () => void }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api.deleteStorageDir(dir),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: storageResourcesKey });
      onClose();
    },
  });

  return (
    <ConfirmDialog
      title="Delete directory"
      confirmLabel="Delete directory"
      pendingLabel="Deleting directory"
      onConfirm={() => {
        remove.mutate();
      }}
      onClose={onClose}
      isPending={remove.isPending}
      error={remove.error}
    >
      <p style={{ margin: 0 }}>
        Delete <strong style={monoStyle}>{dir}</strong> and everything under it? This cannot be
        undone.
      </p>
    </ConfirmDialog>
  );
}

type UploadMode = 'text' | 'files';

/** One picked file, its derived resource id, and its per-file upload outcome. */
interface FileEntry {
  readonly id: string;
  readonly file: File;
  readonly status: 'pending' | 'uploading' | 'done' | 'error';
  readonly error: string | null;
}

const STATUS_BADGE: Record<FileEntry['status'], { label: string; variant: string }> = {
  pending: { label: 'Ready', variant: 'neutral' },
  uploading: { label: 'Uploading…', variant: 'primary' },
  done: { label: 'Uploaded', variant: 'success' },
  error: { label: 'Failed', variant: 'danger' },
};

/**
 * Read a picked file as base64, stripping the `data:<mime>;base64,` prefix the door
 * does not want. A read failure rejects loudly — never a stale/empty payload.
 */
function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error(`Could not read ${file.name}`));
    };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error(`Could not read ${file.name}`));
        return;
      }
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * The upload dialog. TEXT mode authors one resource: an id + its text content
 * (`content_text`). FILES mode picks one or MORE files at once; the backend door
 * stays single-item, so the UI LOOPS it — one `content_base64` request per file,
 * each id derived from the file name — reporting per-file success/failure. A
 * CONFLICT CHECK runs BEFORE any request: a derived id that already exists (upload
 * overwrites), or a name picked twice, blocks the whole batch so nothing is
 * clobbered by accident. The dialog closes only when every file succeeded
 * (close-on-success-only); a partial failure keeps the failed files listed to retry.
 * Server errors render verbatim.
 */
function UploadDialog({
  existingIds,
  onClose,
}: {
  readonly existingIds: readonly string[];
  readonly onClose: () => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<UploadMode>('text');
  const [id, setId] = useState('');
  const [text, setText] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const textUpload = useMutation({
    mutationFn: () => api.uploadStorageResource({ id: id.trim(), content_text: text }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: storageResourcesKey });
      onClose();
    },
  });

  const existing = new Set(existingIds);
  const outstanding = entries.filter((entry) => entry.status !== 'done');
  // CONFLICT CHECK — BEFORE any request. An id already stored (upload overwrites) or
  // a name picked twice blocks the whole batch.
  const seen = new Map<string, number>();
  for (const entry of outstanding) seen.set(entry.id, (seen.get(entry.id) ?? 0) + 1);
  const conflicts = outstanding
    .filter((entry) => existing.has(entry.id) || (seen.get(entry.id) ?? 0) > 1)
    .map((entry) => entry.id);
  const conflictSet = new Set(conflicts);

  const onFilesChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const files = Array.from(event.target.files ?? []);
    setEntries(files.map((file) => ({ id: file.name, file, status: 'pending', error: null })));
  };

  const patch = (entryId: string, next: Partial<FileEntry>): void => {
    setEntries((prev) =>
      prev.map((entry) => (entry.id === entryId ? { ...entry, ...next } : entry)),
    );
  };

  const canSubmitFiles = outstanding.length > 0 && conflicts.length === 0 && !submitting;

  const submitFiles = async (): Promise<void> => {
    if (!canSubmitFiles) return;
    setSubmitting(true);
    let anySuccess = false;
    let anyFailure = false;
    for (const entry of outstanding) {
      patch(entry.id, { status: 'uploading', error: null });
      try {
        const content = await readFileBase64(entry.file);
        await api.uploadStorageResource({ id: entry.id, content_base64: content });
        patch(entry.id, { status: 'done', error: null });
        anySuccess = true;
      } catch (err) {
        patch(entry.id, { status: 'error', error: errorMessage(err) });
        anyFailure = true;
      }
    }
    setSubmitting(false);
    if (anySuccess) void queryClient.invalidateQueries({ queryKey: storageResourcesKey });
    // Close ONLY when the whole batch succeeded; a partial failure stays open with the
    // failed files listed so they alone can be retried.
    if (!anyFailure) onClose();
  };

  const canSubmitText = id.trim().length > 0 && text.length > 0 && !textUpload.isPending;

  return (
    <Dialog
      title="Upload resource"
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
        <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
          Uploading an existing id overwrites its content.
        </p>
        <Field label="Source" group>
          <RadioGroup
            name="upload-mode"
            value={mode}
            onValueChange={(next) => {
              setMode(next as UploadMode);
              // Switching modes drops the other mode's transient state so a stale
              // file error can't linger over the text box (and vice versa).
              setEntries([]);
              if (inputRef.current !== null) inputRef.current.value = '';
            }}
            options={[
              { value: 'text', label: 'Text' },
              { value: 'files', label: 'Files' },
            ]}
          />
        </Field>

        {mode === 'text' ? (
          <>
            <Field label="Resource id">
              <TextInput
                value={id}
                placeholder="notes/todo.txt"
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  setId(event.target.value);
                }}
              />
            </Field>
            <Field label="Text content">
              <Textarea
                value={text}
                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                  setText(event.target.value);
                }}
              />
            </Field>
            {textUpload.isError ? <ErrorState message={errorMessage(textUpload.error)} /> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
              <Button type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!canSubmitText}
                onClick={() => {
                  textUpload.mutate();
                }}
              >
                Upload
              </Button>
            </div>
          </>
        ) : (
          <>
            <Field label="Files" description="Each file becomes a resource id from its name." group>
              <input
                ref={inputRef}
                type="file"
                multiple
                aria-label="Choose files"
                onChange={onFilesChange}
              />
            </Field>

            {entries.length > 0 ? (
              <ul
                style={{ listStyle: 'none', margin: 0, padding: 0 }}
                className="tai-stack tai-stack-2"
                aria-label="Selected files"
              >
                {entries.map((entry) => {
                  const badge = STATUS_BADGE[entry.status];
                  const conflict = conflictSet.has(entry.id);
                  return (
                    <li
                      key={entry.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: 'var(--tai-space-2)',
                      }}
                    >
                      <span style={{ flex: '1 1 auto', ...monoStyle }}>{entry.id}</span>
                      <Badge variant={conflict ? 'danger' : badge.variant}>
                        {conflict ? 'Conflict' : badge.label}
                      </Badge>
                      {entry.error !== null ? (
                        <span className="tai-status tai-status-err" style={{ flexBasis: '100%' }}>
                          {entry.error}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {conflicts.length > 0 ? (
              <ErrorState
                message={`These ids already exist or repeat in this batch: ${conflicts.join(', ')}. Rename or remove them before uploading.`}
              />
            ) : null}
            {entries.some((entry) => entry.status === 'error') ? (
              <ErrorState message="Some files failed to upload. The ones still marked Failed can be retried." />
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
              <Button type="button" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!canSubmitFiles}
                onClick={() => {
                  void submitFiles();
                }}
              >
                {submitting ? <Spinner label="Uploading" /> : null}
                Upload
              </Button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

/** The Stat / Download / Delete controls shared by a resource's row and card. */
function ResourceActions({
  id,
  onStat,
  onDelete,
  onDownload,
  downloading,
}: {
  readonly id: string;
  readonly onStat: () => void;
  readonly onDelete: () => void;
  readonly onDownload: () => void;
  readonly downloading: boolean;
}): ReactNode {
  return (
    <div style={{ display: 'flex', gap: 'var(--tai-space-2)', justifyContent: 'flex-end' }}>
      <Button aria-label={`Stat ${id}`} onClick={onStat}>
        Stat
      </Button>
      <Button aria-label={`Download ${id}`} onClick={onDownload} disabled={downloading}>
        Download
      </Button>
      <Button variant="danger" aria-label={`Delete ${id}`} onClick={onDelete}>
        Delete
      </Button>
    </div>
  );
}

/** The resource browser, rendered only when a provider is present. */
function ResourceBrowser({ initialFilter }: { initialFilter: string }): ReactNode {
  const api = useApi();
  const resources = useQuery({
    queryKey: storageResourcesKey,
    queryFn: ({ signal }) => api.listStorageResources(signal),
  });

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [statId, setStatId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteDir, setDeleteDir] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const [query, setQuery] = useState(initialFilter);
  const [seed, setSeed] = useState(initialFilter);
  // Re-seed the live filter from the committed `?q=` DURING RENDER (React's
  // adjust-state-on-prop-change pattern): a filter arriving from the URL
  // (deep-link, browser back/forward) overwrites the box so it never states a
  // filter the list is not showing.
  if (seed !== initialFilter) {
    setSeed(initialFilter);
    setQuery(initialFilter);
  }

  const containerRef = useRef<HTMLDivElement>(null);
  const buildSearch = useCallback((q: string | undefined): RouteSearch<'storage'> => ({ q }), []);
  useSearchCommit({
    token: 'storage',
    containerRef,
    searchLabel: SEARCH_LABEL,
    committedValue: initialFilter,
    draft: query,
    buildSearch,
    containerMissingError: 'Storage browser container ref did not attach.',
  });

  const download = useMutation({
    mutationFn: async (id: string) => {
      const blob = await api.downloadStorageResource(id);
      downloadBlob(blob, basename(id));
    },
  });

  const renderActions = (id: string): ReactNode => (
    <ResourceActions
      id={id}
      downloading={download.isPending}
      onStat={() => {
        setStatId(id);
      }}
      onDelete={() => {
        setDeleteId(id);
      }}
      onDownload={() => {
        download.mutate(id);
      }}
    />
  );

  const renderRow = (id: string): ReactNode => (
    <>
      <TD className="tai-table-id" style={{ wordBreak: 'break-all' }}>
        {id}
      </TD>
      <TD>{renderActions(id)}</TD>
    </>
  );

  const renderCard = (id: string): ReactNode => {
    const name = basename(id);
    return (
      <Card interactive>
        <div className="tai-stack tai-stack-2">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ wordBreak: 'break-all' }}>{name}</span>
            {name !== id ? (
              <span className="tai-muted tai-mono" style={{ wordBreak: 'break-all' }}>
                {id}
              </span>
            ) : null}
          </div>
          {renderActions(id)}
        </div>
      </Card>
    );
  };

  const renderFolderActions = (folder: Folder): ReactNode => (
    <Button
      variant="danger"
      aria-label={`Delete directory ${folder.id}`}
      onClick={() => {
        setDeleteDir(folder.id);
      }}
    >
      Delete
    </Button>
  );

  let body: ReactNode;
  if (resources.isPending) {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <Skeleton height={32} />
        <Skeleton height={32} />
        <Skeleton height={32} />
      </div>
    );
  } else if (resources.isError) {
    body = (
      <ErrorState
        message={errorMessage(resources.error)}
        onRetry={() => void resources.refetch()}
      />
    );
  } else {
    const ids = resources.data.resources;
    body = (
      <ExplorerView<string>
        items={ids}
        getItemKey={(id) => id}
        getFolderId={(id) => parentPrefix(id)}
        folders={deriveFolders(ids)}
        currentFolderId={currentFolderId}
        onNavigate={setCurrentFolderId}
        rootLabel="All resources"
        viewSurface={STORAGE_VIEW_SURFACE}
        label="Resources"
        columns={COLUMNS}
        renderRow={renderRow}
        renderCard={renderCard}
        search={{
          value: query,
          onChange: setQuery,
          matches: (id, q) => id.includes(q),
          label: SEARCH_LABEL,
          placeholder: 'Substring of the resource id',
        }}
        renderFolderActions={renderFolderActions}
        emptyStates={EMPTY_STATES}
      />
    );
  }

  return (
    <Card>
      <div
        ref={containerRef}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="primary"
            onClick={() => {
              setUploadOpen(true);
            }}
          >
            Upload
          </Button>
        </div>

        {download.isError ? <ErrorState message={errorMessage(download.error)} /> : null}
        {body}
      </div>

      {statId !== null ? (
        <StatDialog
          id={statId}
          onClose={() => {
            setStatId(null);
          }}
        />
      ) : null}
      {deleteId !== null ? (
        <DeleteResourceDialog
          id={deleteId}
          onClose={() => {
            setDeleteId(null);
          }}
        />
      ) : null}
      {deleteDir !== null ? (
        <DeleteDirDialog
          dir={deleteDir}
          onClose={() => {
            setDeleteDir(null);
          }}
        />
      ) : null}
      {uploadOpen ? (
        <UploadDialog
          existingIds={resources.data?.resources ?? []}
          onClose={() => {
            setUploadOpen(false);
          }}
        />
      ) : null}
    </Card>
  );
}

export function StoragePage({ search }: PageProps<'storage'>): ReactNode {
  const api = useApi();
  const info = useQuery({
    queryKey: storageInfoKey,
    queryFn: ({ signal }) => api.getStorageInfo(signal),
  });

  let body: ReactNode;
  if (info.isPending) {
    body = <Skeleton height={96} />;
  } else if (info.isError) {
    body = <ErrorState message={errorMessage(info.error)} onRetry={() => void info.refetch()} />;
  } else if (!info.data.present) {
    body = (
      <Card>
        <EmptyState
          title="Storage needs a storage-provider plugin"
          description="No installed plugin exposes a storage provider. Install one to browse, upload, and manage stored objects."
          action={
            <AppLink
              to="marketplace"
              search={{ kind: 'storage' }}
              className="tai-btn tai-btn-secondary"
            >
              Browse marketplace
            </AppLink>
          }
        />
      </Card>
    );
  } else {
    body = (
      <>
        <Card>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: 'var(--tai-space-2) var(--tai-space-4)',
              margin: 0,
            }}
          >
            <dt style={{ color: 'var(--tai-color-text-muted)' }}>Provider</dt>
            <dd style={{ margin: 0, ...monoStyle }}>{info.data.provider}</dd>
            <dt style={{ color: 'var(--tai-color-text-muted)' }}>Module</dt>
            <dd style={{ margin: 0, ...monoStyle }}>{info.data.module}</dd>
          </dl>
        </Card>
        <ResourceBrowser initialFilter={search.q ?? ''} />
      </>
    );
  }

  return (
    <div className="tai-stack tai-stack-6" data-testid="storage-page">
      <PageHeader eyebrow="Administration" title="Storage" />
      {body}
    </div>
  );
}
