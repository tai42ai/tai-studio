/**
 * The `/storage` feature page: the content store a storage-provider plugin
 * exposes. Two honesty layers stack:
 *
 *  - the PROVIDER card (`getStorageInfo`) — storage is dead by default (the
 *    skeleton ships no provider), so `present: false` renders a calm EmptyState and
 *    nothing else. When present it shows the provider class + module verbatim.
 *  - the RESOURCE browser (only when a provider is present) — `listStorageResources`
 *    served as a `{ resources }` id list, filtered in memory by the `?filter=`
 *    substring (case-sensitive; the door has no filter param), with per-row stat /
 *    download / delete and the delete-directory + upload dialogs.
 *
 * Every server-supplied value (provider identity, resource ids, stat fields, error
 * messages) renders as ESCAPED React text — never through an HTML sink. Failures
 * surface loudly through `ErrorState`; a server error message is shown verbatim.
 */
import { useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  ConfirmDialog,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  JsonTree,
  RadioGroup,
  Skeleton,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TextInput,
  Textarea,
  downloadBlob,
  errorMessage,
  useApi,
  useAppNavigate,
  type PageProps,
} from '@tai42/studio-sdk';

import { storageInfoKey, storageResourcesKey, storageStatKey } from './keys';

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-6)',
};

const monoStyle: CSSProperties = { fontFamily: 'var(--tai-font-mono)', wordBreak: 'break-all' };

/** The final `/`-separated segment of an id — the download filename. */
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
        <JsonTree data={stat.data} defaultExpanded />
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
 * The delete-directory dialog: a directory-path input plus a danger confirm that
 * removes the whole subtree (`deleteStorageDir`) and invalidates the id list. A
 * rejected delete (e.g. the root-path 400) renders the server message verbatim.
 */
function DeleteDirDialog({ onClose }: { onClose: () => void }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [path, setPath] = useState('');
  const remove = useMutation({
    mutationFn: (dir: string) => api.deleteStorageDir(dir),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: storageResourcesKey });
      onClose();
    },
  });

  const trimmed = path.trim();
  return (
    <ConfirmDialog
      title="Delete directory"
      confirmLabel="Delete directory"
      pendingLabel="Deleting directory"
      onConfirm={() => {
        remove.mutate(trimmed);
      }}
      onClose={onClose}
      isPending={remove.isPending}
      error={remove.error}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
        <p style={{ margin: 0 }}>
          Delete a directory and everything under it. This cannot be undone.
        </p>
        <Field label="Directory path">
          <TextInput
            value={path}
            placeholder="reports/2026"
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              setPath(event.target.value);
            }}
          />
        </Field>
      </div>
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
        <Field label="Content">
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

/** One resource row: the id plus its Stat / Download / Delete actions. */
function ResourceRow({
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
    <TR>
      <TD style={monoStyle}>{id}</TD>
      <TD>
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
      </TD>
    </TR>
  );
}

/**
 * The filter input. Seeded from the committed `?filter=` value and remounted (via a
 * `key` at the call site) whenever that value changes, so its local draft stays a
 * pure local edit until an explicit commit. Enter or blur writes the URL — the
 * shell `navigate` has no `replace`, so per-keystroke writes would spam history.
 */
function FilterInput({
  initial,
  onCommit,
}: {
  readonly initial: string;
  readonly onCommit: (value: string) => void;
}): ReactNode {
  const [draft, setDraft] = useState(initial);
  return (
    <Field label="Filter">
      <TextInput
        value={draft}
        placeholder="Substring of the resource id"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          setDraft(event.target.value);
        }}
        onBlur={() => {
          // Only write on a real edit: blurring an untouched input (e.g. tabbing
          // through) must not push a redundant history entry for the same value.
          if (draft !== initial) onCommit(draft);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onCommit(draft);
        }}
      />
    </Field>
  );
}

/** The resource browser, rendered only when a provider is present. */
function ResourceBrowser({ filter }: { filter: string }): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();
  const resources = useQuery({
    queryKey: storageResourcesKey,
    queryFn: ({ signal }) => api.listStorageResources(signal),
  });

  const [statId, setStatId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [dirOpen, setDirOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const download = useMutation({
    mutationFn: async (id: string) => {
      const blob = await api.downloadStorageResource(id);
      downloadBlob(blob, basename(id));
    },
  });

  function commitFilter(value: string): void {
    const next = value.trim();
    navigate('storage', { filter: next === '' ? undefined : next });
  }

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
  } else if (resources.data.resources.length === 0) {
    body = (
      <EmptyState
        title="No resources"
        description="The storage provider holds no objects yet. Upload one to get started."
      />
    );
  } else {
    const filtered = resources.data.resources.filter((id) => id.includes(filter));
    body =
      filtered.length === 0 ? (
        <EmptyState title="No matching resources" description="No id contains the filter text." />
      ) : (
        <Table data-testid="storage-table">
          <THead>
            <TR>
              <TH>Resource</TH>
              <TH style={{ textAlign: 'right' }}>Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((id) => (
              <ResourceRow
                key={id}
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
            ))}
          </TBody>
        </Table>
      );
  }

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 'var(--tai-space-4)',
            flexWrap: 'wrap',
          }}
        >
          <FilterInput key={filter} initial={filter} onCommit={commitFilter} />
          <div style={{ display: 'flex', gap: 'var(--tai-space-2)' }}>
            <Button
              onClick={() => {
                setDirOpen(true);
              }}
            >
              Delete directory
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setUploadOpen(true);
              }}
            >
              Upload
            </Button>
          </div>
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
      {dirOpen ? (
        <DeleteDirDialog
          onClose={() => {
            setDirOpen(false);
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
        <ResourceBrowser filter={search.filter ?? ''} />
      </>
    );
  }

  return (
    <div data-testid="storage-page" style={pageStyle}>
      <header>
        <h1 style={{ margin: 0, fontSize: 'var(--tai-text-xl)' }}>Storage</h1>
      </header>
      {body}
    </div>
  );
}
