/**
 * The states master table (left pane). One row per declared state, opening `?state=`
 * to drive the detail pane. The Consumers column loads LAZILY per visible row — one
 * `GET /api/states/{name}/consumers` per row, a `Skeleton` inline until it lands, an
 * error rendered as `—` with the failure on `title` — so a slow or failing consumers
 * read never walls the list.
 *
 * `Declare state` opens the create form (the declaration editor in create mode).
 * `Upload` reads a `.json` state or state-module document and PUTs it by its `kind`; a
 * name clash (409) prompts a danger Replace confirm. A feature that is OFF (no store)
 * shows the muted `FeatureDisabled` note in place of the list.
 */
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AppLink,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  ScrollRegion,
  Skeleton,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  errorMessage,
  openTargetProps,
  useApi,
  useAppNavigate,
} from '@tai42/studio-sdk';
import { ApiError, type StateListItem, type StateModuleBody } from '@tai42/api-client';

import { DeclareStateDialog } from './DeclarationTab';
import { stateConsumersKey, stateStatsKey, statesListKey } from './keys';

/** The one platform-validated subject kind; rendered as a primary badge. */
const PERSON_KIND = 'person';

/** Format a row timestamp for the Updated cell: the locale instant, or `—` when unset;
 * an unparseable value shows verbatim (the full ISO rides on the cell's `title`). */
function formatWhen(value: string | null): string {
  if (value === null) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

/** A parsed upload awaiting a name-clash decision (a 409 the operator must confirm). */
interface PendingReplace {
  readonly name: string;
  readonly document: 'state' | 'state-module';
  readonly body: Record<string, unknown>;
}

/**
 * The lazy Consumers cell: one consumers read per visible row. A `Skeleton` shows while
 * it loads; the settled count excludes `unavailable` families (they cannot be listed on
 * this deployment); a failure renders `—` with the error on `title` rather than walling
 * the list.
 */
function ConsumersCell({ name }: { readonly name: string }): ReactNode {
  const api = useApi();
  const query = useQuery({
    queryKey: stateConsumersKey(name),
    queryFn: ({ signal }) => api.stateConsumers(name, signal),
  });
  if (query.isPending) return <Skeleton height={16} />;
  if (query.isError) {
    return <span title={errorMessage(query.error)}>—</span>;
  }
  const count = query.data.filter((row) => row.unavailable === null).length;
  return <>{count}</>;
}

/**
 * The lazy Records cell: one stats read per visible row (`GET …/stats`) — the list row
 * carries no count. A `Skeleton` shows while it loads; a failure renders `—` with the
 * error on `title` rather than walling the list.
 */
function RecordsCell({ name }: { readonly name: string }): ReactNode {
  const api = useApi();
  const query = useQuery({
    queryKey: stateStatsKey(name),
    queryFn: ({ signal }) => api.getStateStats(name, signal),
  });
  if (query.isPending) return <Skeleton height={16} />;
  if (query.isError) {
    return <span title={errorMessage(query.error)}>—</span>;
  }
  return <>{query.data.records}</>;
}

function StateRow({
  state,
  selected,
  compact,
}: {
  readonly state: StateListItem;
  readonly selected: boolean;
  // In split mode (a state open) the master pane is narrow: keep Name + Subject kinds,
  // drop the numeric/time columns (they live on the detail header).
  readonly compact: boolean;
}): ReactNode {
  const navigate = useAppNavigate();
  const openProps = openTargetProps({
    onOpen: () => {
      navigate('states', { state: state.name });
    },
  });
  return (
    <TR
      data-testid={`state-row-${state.name}`}
      {...openProps}
      style={{
        ...(selected ? { background: 'var(--tai-color-surface)' } : {}),
        ...openProps.style,
      }}
    >
      <TD>
        <AppLink
          to="states"
          search={{ state: state.name }}
          aria-label={`Open state ${state.name}`}
          aria-current={selected ? 'page' : undefined}
        >
          <span
            style={{
              fontFamily: 'var(--tai-font-mono)',
              display: 'inline-block',
              maxWidth: '24ch',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              verticalAlign: 'bottom',
            }}
            title={state.name}
          >
            {state.name}
          </span>
        </AppLink>
      </TD>
      <TD>
        <span style={{ display: 'inline-flex', gap: 'var(--tai-space-1)', flexWrap: 'wrap' }}>
          {state.subject_kinds.map((kind) => (
            <Badge key={kind} variant={kind === PERSON_KIND ? 'primary' : 'neutral'}>
              {kind}
            </Badge>
          ))}
        </span>
      </TD>
      {compact ? null : (
        <>
          <TD>
            <RecordsCell name={state.name} />
          </TD>
          <TD>
            <ConsumersCell name={state.name} />
          </TD>
          <TD style={{ whiteSpace: 'nowrap' }} title={state.updated_at ?? undefined}>
            {formatWhen(state.updated_at)}
          </TD>
        </>
      )}
    </TR>
  );
}

/** Read a `.json` document off a file input, or throw a loud, human message. */
async function readJsonFile(file: File): Promise<Record<string, unknown>> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`This file is not valid JSON: ${errorMessage(error)}`);
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('This file must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingReplace, setPendingReplace] = useState<PendingReplace | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const putDocument = async (
    document: 'state' | 'state-module',
    name: string,
    body: Record<string, unknown>,
    replace: boolean,
  ): Promise<void> => {
    if (document === 'state-module') {
      await api.putStateModule(name, body as unknown as StateModuleBody, replace);
    } else {
      // The declaration PUT is a plain upsert (no replace flag); it overwrites an
      // additive change and refuses a narrowing over records with a 409.
      await api.putState(name, {
        name,
        description: typeof body.description === 'string' ? body.description : '',
        schema: (body.schema as Record<string, unknown> | undefined) ?? {},
        subject_kinds: Array.isArray(body.subject_kinds) ? (body.subject_kinds as string[]) : [],
        default_subject_kind:
          typeof body.default_subject_kind === 'string' ? body.default_subject_kind : '',
        retention_days: typeof body.retention_days === 'number' ? body.retention_days : null,
      });
    }
    await query.refetch();
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    setUploadError(null);
    const file = event.target.files?.[0];
    // Reset the input so re-selecting the same file re-fires change.
    event.target.value = '';
    if (file === undefined) return;
    setUploading(true);
    try {
      const body = await readJsonFile(file);
      const kind = body.kind;
      const name = typeof body.name === 'string' ? body.name : '';
      if (name === '') {
        throw new Error('This file has no `name`.');
      }
      let document: 'state' | 'state-module';
      if (kind === 'state-module') {
        document = 'state-module';
      } else if (kind === 'state') {
        document = 'state';
      } else {
        throw new Error('This file has no `kind` — expected state or state-module.');
      }
      try {
        await putDocument(document, name, body, false);
      } catch (error) {
        // Only a module document has a force-replace door (a 409 `module_exists` the
        // operator confirms). A state's 409 is a genuine conflict (a narrowing over
        // records, or a stranding kind removal) with no replace flag — surface it.
        if (error instanceof ApiError && error.status === 409 && document === 'state-module') {
          setPendingReplace({ name, document, body });
          return;
        }
        throw error;
      }
    } catch (error) {
      setUploadError(errorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--tai-space-2)',
        }}
      >
        <h2 className="tai-card-title">All states</h2>
        <div style={{ display: 'flex', gap: 'var(--tai-space-2)' }}>
          <Button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? <Spinner label="Refreshing" /> : null}
            Refresh
          </Button>
          <Button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Spinner label="Uploading" /> : null}
            Upload
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            aria-hidden="true"
            tabIndex={-1}
            onChange={(event) => void onFile(event)}
          />
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            Declare state
          </Button>
        </div>
      </header>

      {uploadError !== null ? (
        <p role="alert" style={{ margin: 0, color: 'var(--tai-color-err-text)' }}>
          {uploadError}
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
          <ScrollRegion label="States">
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Subject kinds</TH>
                  {compact ? null : (
                    <>
                      <TH>Records</TH>
                      <TH>Consumers</TH>
                      <TH>Updated</TH>
                    </>
                  )}
                </TR>
              </THead>
              <TBody>
                {query.data.map((state) => (
                  <StateRow
                    key={state.name}
                    state={state}
                    selected={state.name === selected}
                    compact={compact}
                  />
                ))}
              </TBody>
            </Table>
          </ScrollRegion>
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
        <ReplaceConfirm
          pending={pendingReplace}
          onClose={() => {
            setPendingReplace(null);
          }}
          onReplace={async () => {
            await putDocument(
              pendingReplace.document,
              pendingReplace.name,
              pendingReplace.body,
              true,
            );
            setPendingReplace(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** The name-clash Replace confirm for an upload; a failed replace renders in-dialog. */
function ReplaceConfirm({
  pending,
  onClose,
  onReplace,
}: {
  readonly pending: PendingReplace;
  readonly onClose: () => void;
  readonly onReplace: () => Promise<void>;
}): ReactNode {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <ConfirmDialog
      title={`Replace '${pending.name}'?`}
      confirmLabel="Replace"
      pendingLabel="Replacing"
      cancelLabel="Keep existing"
      confirmVariant="danger"
      isPending={busy}
      error={error as Error | string | null}
      onConfirm={() => {
        setBusy(true);
        setError(null);
        onReplace().catch((err: unknown) => {
          setError(err);
          setBusy(false);
        });
      }}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      A {pending.document === 'state-module' ? 'state-module' : 'state'} named{' '}
      <strong>{pending.name}</strong> already exists. Replace it with the uploaded document?
    </ConfirmDialog>
  );
}
