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
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AppLink,
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
  TD,
  Textarea,
  TextInput,
  downloadBlob,
  errorMessage,
  useApi,
  useAppNavigate,
  type ExplorerColumn,
  type ExplorerEmptyStates,
  type Folder,
  type PageProps,
} from '@tai42/studio-sdk';

import { deriveFolders, parentPrefix } from './folders';
import { storageInfoKey, storageResourcesKey, storageStatKey } from './keys';

const monoStyle: CSSProperties = { fontFamily: 'var(--tai-font-mono)', wordBreak: 'break-all' };

/** The explorer's list/card view-mode persistence key. */
const STORAGE_VIEW_SURFACE = 'studio-storage';

/** The filter box's accessible name; the commit listener keys the search input on it. */
const SEARCH_LABEL = 'Filter resources';

/** True when a delegated blur/keydown originated on the explorer's filter input. */
function isSearchInput(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.getAttribute('aria-label') === SEARCH_LABEL;
}

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

type UploadMode = 'text' | 'file';

/**
 * The upload dialog: an id, a text/file mode toggle, and the content. Text mode
 * sends `content_text`; file mode reads the chosen file via
 * `FileReader.readAsDataURL`, strips the `data:*;base64,` prefix, and sends
 * `content_base64`. Submit is disabled until both id and content are present.
 * Uploading an existing id overwrites it (provider passthrough). Server errors
 * render verbatim.
 */
function UploadDialog({ onClose }: { onClose: () => void }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [id, setId] = useState('');
  const [mode, setMode] = useState<UploadMode>('text');
  const [text, setText] = useState('');
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: () =>
      api.uploadStorageResource(
        mode === 'text'
          ? { id: id.trim(), content_text: text }
          : { id: id.trim(), content_base64: fileBase64 ?? '' },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: storageResourcesKey });
      onClose();
    },
  });

  function onFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0];
    setReadError(null);
    setFileBase64(null);
    setFileName(null);
    if (file === undefined) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onerror = () => {
      // A read failure must surface loudly, never leave a stale/empty payload.
      setReadError(`Could not read ${file.name}`);
    };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        setReadError(`Could not read ${file.name}`);
        return;
      }
      // `readAsDataURL` yields `data:<mime>;base64,<payload>` — the door wants only
      // the base64 payload.
      const comma = result.indexOf(',');
      setFileBase64(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  }

  const hasContent = mode === 'text' ? text.length > 0 : fileBase64 !== null;
  const canSubmit = id.trim().length > 0 && hasContent && !upload.isPending;

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
        <Field label="Resource id">
          <TextInput
            value={id}
            placeholder="notes/todo.txt"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setId(event.target.value);
            }}
          />
        </Field>
        <Field label="Content" group>
          <RadioGroup
            name="upload-mode"
            value={mode}
            onValueChange={(next) => {
              setMode(next as UploadMode);
              // Switching modes drops the other mode's transient file state so a
              // stale read error can't linger over the text box (and vice versa).
              setReadError(null);
              setFileBase64(null);
              setFileName(null);
            }}
            options={[
              { value: 'text', label: 'Text' },
              { value: 'file', label: 'File' },
            ]}
          />
        </Field>
        {mode === 'text' ? (
          <Field label="Text content">
            <Textarea
              value={text}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                setText(event.target.value);
              }}
            />
          </Field>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
            <span style={{ fontSize: 'var(--tai-text-sm)', fontWeight: 600 }}>File</span>
            <input type="file" aria-label="Choose a file" onChange={onFileChange} />
          </div>
        )}
        {mode === 'file' && fileName !== null ? (
          <p style={{ margin: 0, fontSize: 'var(--tai-text-sm)', ...monoStyle }}>{fileName}</p>
        ) : null}
        {readError !== null ? <ErrorState message={readError} /> : null}
        {upload.isError ? <ErrorState message={errorMessage(upload.error)} /> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={!canSubmit}
            onClick={() => {
              upload.mutate();
            }}
          >
            Upload
          </Button>
        </div>
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
  const navigate = useAppNavigate();
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
  // Re-seed the live filter from the committed `?filter=` DURING RENDER (React's
  // adjust-state-on-prop-change pattern): a filter arriving from the URL
  // (deep-link, browser back/forward) overwrites the box so it never states a
  // filter the list is not showing.
  if (seed !== initialFilter) {
    setSeed(initialFilter);
    setQuery(initialFilter);
  }

  // Write the live filter to `?filter=` — never per keystroke (the shell navigate
  // has no replace; per-keystroke writes would spam history), only on an explicit
  // commit. A cleared box commits `undefined` so the URL and box cannot drift.
  const commitFilter = useCallback(
    (value: string): void => {
      const next = value.trim();
      navigate('storage', { filter: next === '' ? undefined : next });
    },
    [navigate],
  );

  // The SDK search input is controlled (value/onChange only), so the URL commit is
  // delegated on the container: Enter or an edited blur of the filter box writes the
  // URL. The ref holds the latest value so the listeners bind once, not per keystroke.
  const commitState = useRef({ query, initialFilter });
  commitState.current = { query, initialFilter };
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (el === null) throw new Error('Storage browser container ref did not attach.');
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Enter' && isSearchInput(event.target)) {
        commitFilter(commitState.current.query);
      }
    };
    const onFocusOut = (event: FocusEvent): void => {
      const { query: q, initialFilter: committed } = commitState.current;
      // An untouched blur (tabbing through) must not push a redundant history entry
      // for the value already committed to the URL.
      if (isSearchInput(event.target) && q.trim() !== committed) commitFilter(q);
    };
    el.addEventListener('keydown', onKeyDown);
    el.addEventListener('focusout', onFocusOut);
    return () => {
      el.removeEventListener('keydown', onKeyDown);
      el.removeEventListener('focusout', onFocusOut);
    };
  }, [commitFilter]);

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
        <ResourceBrowser initialFilter={search.filter ?? ''} />
      </>
    );
  }

  return (
    <div className="tai-stack tai-stack-6" data-testid="storage-page">
      <PageHeader eyebrow="Integrations" title="Storage" />
      {body}
    </div>
  );
}
