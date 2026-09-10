/**
 * The per-subject record page (`?state=&subject=<kind>:<key>&target=<tk>:<tn>`). The
 * `subject` and `target` params both split on their FIRST `:` only (a key or a name may
 * itself contain colons), and the tail is URL-decoded — so a record's four-part identity
 * survives a deep link and a reload.
 *
 * The document card edits through the effective schema's `SchemaForm` when the schema is
 * representable, else a client-validated JSON `Textarea`; `Save` is a `PUT`. A NEW
 * document is created only through that same form (seeded from the schema, so it
 * validates) — never a blind `PUT {}`. `Erase` is the delete door behind a danger
 * confirm; the document and its audit trail stay in the ledger and a new document starts
 * empty. `Fold into` merges this subject into another; a refusal renders inline. `Writes`
 * is the paged audit trail.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AppLink,
  ArrowLeftIcon,
  Badge,
  Button,
  Card,
  ConfirmDialog,
  CopyField,
  EmptyState,
  ErrorState,
  Field,
  JsonTree,
  Select,
  Skeleton,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  Textarea,
  TextInput,
  SchemaForm,
  defaultValueForSchema,
  validateAgainstSchema,
  errorMessage,
  isFeatureDisabled,
  featureDisabledMessage,
  FeatureDisabled,
  useApi,
  type JsonSchema,
} from '@tai42/studio-sdk';
import { type StateRecord, type StateSubjectRef, type WriteEntry } from '@tai42/api-client';

import { stateDetailKey, stateRecordKey, stateWritesKey } from './keys';

/** Split a `<head>:<tail>` param on the FIRST colon; the tail is URL-decoded. */
export function parseColonPair(raw: string): { head: string; tail: string } | null {
  const idx = raw.indexOf(':');
  if (idx < 0) return null;
  const head = raw.slice(0, idx);
  if (head === '') return null;
  return { head, tail: decodeURIComponent(raw.slice(idx + 1)) };
}

/** Format one subject param `<kind>:<key>` (key URL-encoded). */
export function formatSubjectParam(kind: string, key: string): string {
  return `${kind}:${encodeURIComponent(key)}`;
}

/** Format one target param `<target_kind>:<target_name>` (name URL-encoded). */
export function formatTargetParam(targetKind: string, targetName: string): string {
  return `${targetKind}:${encodeURIComponent(targetName)}`;
}

/**
 * Resolve the four-part subject from its two URL params, or `null` when either is
 * missing/malformed — the page then shows a repair prompt rather than a doomed read.
 */
export function parseSubjectRef(
  subjectParam: string | undefined,
  targetParam: string | undefined,
): StateSubjectRef | null {
  if (subjectParam === undefined || targetParam === undefined) return null;
  const subject = parseColonPair(subjectParam);
  const target = parseColonPair(targetParam);
  if (subject === null || target === null || subject.tail === '' || target.tail === '') return null;
  return {
    target_kind: target.head,
    target_name: target.tail,
    kind: subject.head,
    key: subject.tail,
  };
}

/** Whether a schema can drive the visual `SchemaForm` (an object shape), else JSON. */
function isRepresentable(schema: JsonSchema | null): schema is JsonSchema {
  if (schema === null) return false;
  if (schema.type === 'object') return true;
  return schema.properties !== undefined;
}

interface EditorState {
  readonly mode: 'closed' | 'edit' | 'create';
}

export function RecordPage({
  stateName,
  subjectParam,
  targetParam,
}: {
  readonly stateName: string;
  readonly subjectParam: string | undefined;
  readonly targetParam: string | undefined;
}): ReactNode {
  const subject = useMemo(
    () => parseSubjectRef(subjectParam, targetParam),
    [subjectParam, targetParam],
  );

  if (subject === null) {
    return (
      <Card>
        <EmptyState
          title="This record link is incomplete"
          description="Open a record from the state's Records tab so its subject and target are set."
        />
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <AppLink
            to="states"
            search={{ state: stateName, tab: 'records' }}
            className="tai-btn tai-btn-ghost"
          >
            <ArrowLeftIcon />
            Back to {stateName}
          </AppLink>
        </div>
      </Card>
    );
  }

  return <RecordPageBody stateName={stateName} subject={subject} />;
}

function RecordPageBody({
  stateName,
  subject,
}: {
  readonly stateName: string;
  readonly subject: StateSubjectRef;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: stateDetailKey(stateName),
    queryFn: ({ signal }) => api.getState(stateName, signal),
  });
  const recordQuery = useQuery({
    queryKey: stateRecordKey(stateName, subject),
    // No document yet reads as `null` (a first-class state the empty-document affordance
    // shows), never an error — the read door returns it directly.
    queryFn: ({ signal }): Promise<StateRecord | null> =>
      api.getStateRecord(stateName, subject, signal),
  });

  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' });
  const [eraseOpen, setEraseOpen] = useState(false);

  const effectiveSchema = detailQuery.data?.effective_schema ?? detailQuery.data?.schema ?? null;

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.putStateRecord(stateName, subject, data),
    onSuccess: () => {
      setEditor({ mode: 'closed' });
      void queryClient.invalidateQueries({
        queryKey: stateRecordKey(stateName, subject),
      });
      void queryClient.invalidateQueries({
        queryKey: stateWritesKey(stateName, subject),
      });
    },
  });

  const eraseMutation = useMutation({
    mutationFn: () => api.deleteStateRecord(stateName, subject),
    onSuccess: () => {
      setEraseOpen(false);
      void queryClient.invalidateQueries({
        queryKey: stateRecordKey(stateName, subject),
      });
    },
  });

  if (recordQuery.isError && isFeatureDisabled(recordQuery.error)) {
    return <FeatureDisabled feature="States" message={featureDisabledMessage(recordQuery.error)} />;
  }
  if (detailQuery.isError && isFeatureDisabled(detailQuery.error)) {
    return <FeatureDisabled feature="States" message={featureDisabledMessage(detailQuery.error)} />;
  }
  // The declaration read drives the editor's schema AND the fold's kinds. A failure that
  // is not the OFF state must surface loudly — never a silent fall to the raw JSON editor
  // or an empty fold-kind list.
  if (detailQuery.isError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
        <div>
          <AppLink
            to="states"
            search={{ state: stateName, tab: 'records' }}
            className="tai-btn tai-btn-ghost"
            aria-label={`Back to ${stateName}`}
          >
            <ArrowLeftIcon />
            Back to {stateName}
          </AppLink>
        </div>
        <ErrorState
          message={errorMessage(detailQuery.error)}
          onRetry={() => void detailQuery.refetch()}
        />
      </div>
    );
  }

  const record = recordQuery.data ?? null;

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-5)' }}
      data-testid="record-page"
    >
      <div>
        <AppLink
          to="states"
          search={{ state: stateName, tab: 'records' }}
          className="tai-btn tai-btn-ghost"
          aria-label={`Back to ${stateName}`}
        >
          <ArrowLeftIcon />
          Back to {stateName}
        </AppLink>
      </div>

      <header style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <h2 style={{ margin: 0, fontSize: 'var(--tai-text-lg)' }} tabIndex={-1}>
          <span style={{ fontFamily: 'var(--tai-font-mono)' }}>{subject.kind}</span>{' '}
          <span style={{ fontFamily: 'var(--tai-font-mono)' }}>{subject.key}</span>
          <span style={{ color: 'var(--tai-color-text-muted)' }}>
            {' '}
            · {subject.target_kind} {subject.target_name}
          </span>
        </h2>
        <CopyField value={subject.key} label="Subject key" />
      </header>

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
                    setEditor({ mode: 'edit' });
                  }}
                >
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => {
                    setEraseOpen(true);
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
              schema={effectiveSchema}
              initial={editor.mode === 'edit' ? (record?.data ?? {}) : undefined}
              pending={saveMutation.isPending}
              error={saveMutation.error}
              onCancel={() => {
                setEditor({ mode: 'closed' });
              }}
              onSave={(data) => {
                saveMutation.mutate(data);
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
                    setEditor({ mode: 'create' });
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

      <FoldCard
        stateName={stateName}
        subject={subject}
        kinds={detailQuery.data?.subject_kinds ?? []}
        disabled={record === null}
      />

      <WritesCard stateName={stateName} subject={subject} />

      {eraseOpen ? (
        <ConfirmDialog
          title="Erase record"
          confirmLabel="Erase"
          pendingLabel="Erasing"
          confirmVariant="danger"
          isPending={eraseMutation.isPending}
          error={eraseMutation.error}
          onConfirm={() => {
            eraseMutation.mutate();
          }}
          onClose={() => {
            if (!eraseMutation.isPending) setEraseOpen(false);
          }}
        >
          Erase record &lsquo;{subject.kind} {subject.key}&rsquo;? The document and its audit trail
          stay in the ledger; a new document starts empty.
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

/**
 * The document editor: the effective schema's `SchemaForm` when representable, else a
 * client-validated JSON `Textarea`. Save is blocked while the value is invalid, so no
 * `PUT` fires on a malformed document. A `create` seeds the value from the schema.
 */
function DocumentEditor({
  schema,
  initial,
  pending,
  error,
  onCancel,
  onSave,
}: {
  readonly schema: JsonSchema | null;
  readonly initial: Record<string, unknown> | undefined;
  readonly pending: boolean;
  readonly error: unknown;
  readonly onCancel: () => void;
  readonly onSave: (data: Record<string, unknown>) => void;
}): ReactNode {
  const representable = isRepresentable(schema);
  const seed = useMemo<unknown>(() => {
    if (initial !== undefined) return initial;
    return representable ? defaultValueForSchema(schema) : {};
  }, [initial, representable, schema]);

  const [formValue, setFormValue] = useState<unknown>(seed);
  const [text, setText] = useState<string>(() => JSON.stringify(seed ?? {}, null, 2));
  const [textError, setTextError] = useState<string | null>(null);

  const formErrors = useMemo(
    () => (representable ? validateAgainstSchema(schema, formValue) : {}),
    [representable, schema, formValue],
  );
  const formInvalid = representable && Object.keys(formErrors).length > 0;

  const onSubmit = (): void => {
    if (representable) {
      if (formInvalid) return;
      onSave((formValue ?? {}) as Record<string, unknown>);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      setTextError(`Invalid JSON: ${errorMessage(parseError)}`);
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      setTextError('The document must be a JSON object.');
      return;
    }
    setTextError(null);
    onSave(parsed as Record<string, unknown>);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
      {representable ? (
        <SchemaForm schema={schema} value={formValue} onChange={setFormValue} errors={formErrors} />
      ) : (
        <Field
          label="Document (JSON)"
          description="This state's schema is not a plain object shape; edit the document as JSON."
          error={textError ?? undefined}
        >
          <Textarea
            value={text}
            rows={12}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
        </Field>
      )}
      {error !== null && error !== undefined ? <ErrorState message={errorMessage(error)} /> : null}
      <div style={{ display: 'flex', gap: 'var(--tai-space-3)' }}>
        <Button type="button" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={onSubmit}
          disabled={pending || formInvalid}
        >
          {pending ? <Spinner label="Saving" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}

/** The fold card: merge this subject's document into another subject of a chosen kind. */
function FoldCard({
  stateName,
  subject,
  kinds,
  disabled,
}: {
  readonly stateName: string;
  readonly subject: StateSubjectRef;
  readonly kinds: readonly string[];
  readonly disabled: boolean;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState(subject.kind);
  const [key, setKey] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.foldStateRecord(
        stateName,
        subject,
        {
          target_kind: subject.target_kind,
          target_name: subject.target_name,
          kind,
          key: key.trim(),
        },
        'merge',
      ),
    onSuccess: () => {
      setKey('');
      void queryClient.invalidateQueries({
        queryKey: stateRecordKey(stateName, subject),
      });
    },
  });

  const kindOptions = (kinds.length > 0 ? kinds : [subject.kind]).map((k) => ({
    value: k,
    label: k,
  }));

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Fold into</h3>
        <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
          Merge this subject&rsquo;s document into another subject; this subject then resolves to
          that one.
        </p>
        <div style={{ display: 'flex', gap: 'var(--tai-space-3)', flexWrap: 'wrap' }}>
          <Field label="Kind">
            {/* Ignore a transient empty value (Radix clears a controlled value the same
                render its options change, when the async kind list arrives). */}
            <Select
              value={kind}
              onValueChange={(next) => {
                if (next !== '') setKind(next);
              }}
              options={kindOptions}
            />
          </Field>
          <Field label="Key">
            <TextInput
              value={key}
              placeholder="target subject key"
              onChange={(event) => {
                setKey(event.target.value);
              }}
            />
          </Field>
        </div>
        {mutation.isError ? (
          <p role="alert" style={{ margin: 0, color: 'var(--tai-color-err-text)' }}>
            {errorMessage(mutation.error)}
          </p>
        ) : null}
        <div>
          <Button
            type="button"
            onClick={() => {
              mutation.mutate();
            }}
            disabled={disabled || key.trim() === '' || mutation.isPending}
          >
            {mutation.isPending ? <Spinner label="Folding" /> : null}
            Fold
          </Button>
        </div>
      </div>
    </Card>
  );
}

/** The write audit trail: a paged table of every write to this subject's document. */
function WritesCard({
  stateName,
  subject,
}: {
  readonly stateName: string;
  readonly subject: StateSubjectRef;
}): ReactNode {
  const api = useApi();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [rows, setRows] = useState<WriteEntry[]>([]);

  const query = useQuery({
    queryKey: [...stateWritesKey(stateName, subject), cursor ?? 'first'],
    queryFn: ({ signal }) =>
      api.listStateWrites(
        stateName,
        subject,
        cursor === undefined ? undefined : { cursor },
        signal,
      ),
  });

  const page = query.data;
  const merged = useMemo(() => {
    if (page === undefined) return rows;
    const seen = new Set(rows.map((r) => r.seq));
    return [...rows, ...page.items.filter((item) => !seen.has(item.seq))];
  }, [page, rows]);

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Writes</h3>
        {query.isPending && rows.length === 0 ? (
          <Skeleton height={120} />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : merged.length === 0 ? (
          <EmptyState title="No writes yet" description="No door has written this document." />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>At</TH>
                  <TH>Door</TH>
                  <TH>Actor</TH>
                  <TH>Consumer</TH>
                  <TH>Run</TH>
                  <TH>Paths</TH>
                </TR>
              </THead>
              <TBody>
                {merged.map((entry) => (
                  <TR key={entry.seq}>
                    <TD>{entry.at}</TD>
                    <TD>
                      <Badge variant="neutral">{entry.origin.door}</Badge>
                    </TD>
                    <TD>{entry.origin.actor ?? '—'}</TD>
                    <TD>
                      <div>{entry.origin.consumer ?? '—'}</div>
                      {entry.origin.meta !== null ? (
                        <div
                          title={JSON.stringify(entry.origin.meta)}
                          style={{
                            fontFamily: 'var(--tai-font-mono)',
                            fontSize: 'var(--tai-text-xs)',
                            color: 'var(--tai-color-text-muted)',
                            display: 'block',
                            maxWidth: '24ch',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {JSON.stringify(entry.origin.meta)}
                        </div>
                      ) : null}
                    </TD>
                    <TD>
                      {entry.origin.run_id !== null ? (
                        <span
                          title={entry.origin.run_id}
                          style={{
                            fontFamily: 'var(--tai-font-mono)',
                            display: 'inline-block',
                            maxWidth: '10ch',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            verticalAlign: 'bottom',
                          }}
                        >
                          {entry.origin.run_id}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TD>
                    <TD>{entry.paths.map((path) => path.join(' / ')).join(', ') || '—'}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {page?.next_cursor != null ? (
              <div>
                <Button
                  type="button"
                  onClick={() => {
                    setRows(merged);
                    setCursor(page.next_cursor ?? undefined);
                  }}
                  disabled={query.isFetching}
                >
                  {query.isFetching ? <Spinner label="Loading" /> : null}
                  Load more
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
