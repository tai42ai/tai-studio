/**
 * The Records tab: find a subject's record three ways. The lookup form addresses one
 * record directly (kind + key + target) and opens its record page. The subjects table
 * pages every subject of a chosen kind (keyset "Load more"). The content search runs a
 * server-side match over the records and lists the hits. Every result opens the record
 * page through the shell router (`?state=&subject=&target=`).
 */
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Select,
  Skeleton,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TextInput,
  errorMessage,
  isFeatureDisabled,
  featureDisabledMessage,
  FeatureDisabled,
  useApi,
  useAppNavigate,
} from '@tai42/studio-sdk';
import type { StateDetail, StateSubject, SubjectRow } from '@tai42/api-client';

import { conversationTargetsKey, stateSearchKey, stateSubjectsKey } from './keys';
import { formatSubjectParam, formatTargetParam } from './RecordPage';

const PERSON_KIND = 'person';

/** The Updated cell's display for a subject row's epoch-seconds `updated_at`: the locale
 * instant, or the raw value when unparseable (the full ISO rides on the cell's `title`). */
function formatWhen(epochSeconds: number): string {
  const parsed = new Date(epochSeconds * 1000);
  return Number.isNaN(parsed.getTime()) ? String(epochSeconds) : parsed.toLocaleString();
}

/** The full ISO instant for a subject row's `updated_at`, for the Updated cell's `title`
 * (undefined when the epoch is unparseable, so the cell carries no title). */
function isoWhen(epochSeconds: number): string | undefined {
  const parsed = new Date(epochSeconds * 1000);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

/** A discovered conversation target, as the target picker offers it. */
interface TargetOption {
  readonly targetKind: string;
  readonly targetName: string;
}

export function RecordsTab({ state }: { readonly state: StateDetail }): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();

  const kinds = state.subject_kinds;
  const [kind, setKind] = useState(state.default_subject_kind);
  const [key, setKey] = useState('');
  const [targetKind, setTargetKind] = useState('agent');
  const [targetName, setTargetName] = useState('');

  const targetsQuery = useQuery({
    queryKey: conversationTargetsKey,
    queryFn: ({ signal }) => api.listConversationRoutes(signal),
  });
  const targetOptions: TargetOption[] = (targetsQuery.data?.items ?? []).map((route) => ({
    targetKind: route.target_kind,
    targetName: route.target_name,
  }));
  // A failed targets read is surfaced, never swallowed to `[]`: the picker drops out
  // with an inline note while the free-entry target field stays usable.
  const targetsError =
    targetsQuery.isError && !isFeatureDisabled(targetsQuery.error)
      ? errorMessage(targetsQuery.error)
      : null;

  if (targetsQuery.isError && isFeatureDisabled(targetsQuery.error)) {
    return (
      <FeatureDisabled feature="States" message={featureDisabledMessage(targetsQuery.error)} />
    );
  }

  const openRecord = (openKind: string, openKey: string, target: TargetOption): void => {
    navigate('states', {
      state: state.name,
      subject: formatSubjectParam(openKind, openKey),
      target: formatTargetParam(target.targetKind, target.targetName),
    });
  };

  const lookupReady = key.trim() !== '' && targetName.trim() !== '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-5)' }}>
      <Card>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Look up a record</h3>
          <div style={{ display: 'flex', gap: 'var(--tai-space-3)', flexWrap: 'wrap' }}>
            <Field label="Kind">
              <Select
                value={kind}
                onValueChange={setKind}
                aria-label="Subject kind"
                options={kinds.map((k) => ({ value: k, label: k }))}
              />
            </Field>
            <Field label="Key">
              <TextInput
                value={key}
                placeholder={kind === PERSON_KIND ? 'person id' : 'subject key'}
                onChange={(event) => {
                  setKey(event.target.value);
                }}
              />
            </Field>
            <Field label="Target kind">
              <Select
                value={targetKind}
                onValueChange={setTargetKind}
                aria-label="Target kind"
                options={[
                  { value: 'agent', label: 'agent' },
                  { value: 'tool', label: 'tool' },
                ]}
              />
            </Field>
            <Field label="Target name">
              <TextInput
                value={targetName}
                placeholder="target name"
                onChange={(event) => {
                  setTargetName(event.target.value);
                }}
              />
            </Field>
            {targetOptions.length > 0 ? (
              <Field label="Known targets">
                <Select
                  value=""
                  placeholder="Pick a target"
                  aria-label="Known targets"
                  onValueChange={(value) => {
                    const [tk, ...rest] = value.split(':');
                    setTargetKind(tk ?? 'agent');
                    setTargetName(rest.join(':'));
                  }}
                  options={targetOptions.map((t) => ({
                    value: `${t.targetKind}:${t.targetName}`,
                    label: `${t.targetKind} · ${t.targetName}`,
                  }))}
                />
              </Field>
            ) : null}
          </div>
          {targetsError !== null ? (
            <p role="alert" style={{ margin: 0, color: 'var(--tai-color-err-text)' }}>
              Could not load known targets: {targetsError}. Enter a target above.
            </p>
          ) : null}
          <div>
            <Button
              type="button"
              variant="primary"
              disabled={!lookupReady}
              onClick={() => {
                openRecord(kind, key.trim(), { targetKind, targetName: targetName.trim() });
              }}
            >
              Lookup
            </Button>
          </div>
        </div>
      </Card>

      <SubjectsBrowser
        stateName={state.name}
        kinds={kinds}
        onOpen={(subject) => {
          openRecord(subject.kind, subject.key, {
            targetKind: subject.target_kind,
            targetName: subject.target_name,
          });
        }}
      />

      <RecordSearch
        stateName={state.name}
        onOpen={(subject) => {
          openRecord(subject.kind, subject.key, {
            targetKind: subject.target_kind,
            targetName: subject.target_name,
          });
        }}
      />
    </div>
  );
}

/** The keyset-paged subjects table for a chosen kind. */
function SubjectsBrowser({
  stateName,
  kinds,
  onOpen,
}: {
  readonly stateName: string;
  readonly kinds: readonly string[];
  readonly onOpen: (subject: StateSubject) => void;
}): ReactNode {
  const api = useApi();
  const [kind, setKind] = useState(kinds[0] ?? '');
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [rows, setRows] = useState<SubjectRow[]>([]);

  const query = useQuery({
    queryKey: [...stateSubjectsKey(stateName, kind), cursor ?? 'first'],
    queryFn: ({ signal }) => api.listStateSubjects(stateName, { kind, cursor }, signal),
    enabled: kind !== '',
  });

  const page = query.data;
  const merged =
    page === undefined
      ? rows
      : [
          ...rows,
          ...page.subjects.filter(
            (item) =>
              !rows.some(
                (r) => r.subject.key === item.subject.key && r.subject.kind === item.subject.kind,
              ),
          ),
        ];

  if (query.isError && isFeatureDisabled(query.error)) {
    return <FeatureDisabled feature="States" message={featureDisabledMessage(query.error)} />;
  }

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 'var(--tai-space-2)',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Subjects</h3>
          <Field label="Kind">
            <Select
              value={kind}
              aria-label="Browse kind"
              onValueChange={(next) => {
                setKind(next);
                setCursor(undefined);
                setRows([]);
              }}
              options={kinds.map((k) => ({ value: k, label: k }))}
            />
          </Field>
        </div>
        {query.isPending && rows.length === 0 ? (
          <Skeleton height={120} />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : merged.length === 0 ? (
          <EmptyState title="No subjects" description="No record exists for this kind yet." />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Key</TH>
                  <TH>Target</TH>
                  <TH>Updated</TH>
                  <TH>Actions</TH>
                </TR>
              </THead>
              <TBody>
                {merged.map((item) => (
                  <TR
                    key={`${item.subject.target_kind}:${item.subject.target_name}:${item.subject.key}`}
                  >
                    <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>{item.subject.key}</TD>
                    <TD>
                      {item.subject.target_kind} {item.subject.target_name}
                    </TD>
                    <TD style={{ whiteSpace: 'nowrap' }} title={isoWhen(item.updated_at)}>
                      {formatWhen(item.updated_at)}
                    </TD>
                    <TD>
                      <Button
                        type="button"
                        onClick={() => {
                          onOpen(item.subject);
                        }}
                      >
                        Open
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {page?.next_cursor != null ? (
              <div>
                <Button
                  type="button"
                  disabled={query.isFetching}
                  onClick={() => {
                    setRows(merged);
                    setCursor(page.next_cursor ?? undefined);
                  }}
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

/**
 * The content search: a JSONB containment match over the state's records. The box takes
 * a JSON object (validated client-side); each hit is a subject the record page opens.
 */
function RecordSearch({
  stateName,
  onOpen,
}: {
  readonly stateName: string;
  readonly onOpen: (subject: StateSubject) => void;
}): ReactNode {
  const api = useApi();
  const [draft, setDraft] = useState('');
  const [filters, setFilters] = useState<Record<string, unknown> | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const search = useQuery({
    queryKey: stateSearchKey(stateName, filters === null ? '' : JSON.stringify(filters)),
    queryFn: ({ signal }) => api.searchStateRecords(stateName, { filters: filters ?? {} }, signal),
    enabled: filters !== null,
  });

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      setParseError('Enter a JSON object to match records by containment.');
      setFilters(null);
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      setParseError('Enter a JSON object to match records by containment.');
      setFilters(null);
      return;
    }
    setParseError(null);
    setFilters(parsed as Record<string, unknown>);
  };

  if (search.isError && isFeatureDisabled(search.error)) {
    return <FeatureDisabled feature="States" message={featureDisabledMessage(search.error)} />;
  }

  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Search records</h3>
        <form
          style={{ display: 'flex', gap: 'var(--tai-space-2)', alignItems: 'flex-end' }}
          onSubmit={onSubmit}
        >
          <Field
            label="Filters (JSON)"
            description="A JSON object matched against each record by containment."
            error={parseError ?? undefined}
            style={{ flex: 1 }}
          >
            <TextInput
              value={draft}
              placeholder='e.g. {"status": "active"}'
              onChange={(event) => {
                setDraft(event.target.value);
              }}
            />
          </Field>
          <Button type="submit" variant="primary" disabled={draft.trim() === ''}>
            Search
          </Button>
        </form>
        {filters === null ? null : search.isPending ? (
          <Skeleton height={80} />
        ) : search.isError ? (
          <ErrorState message={errorMessage(search.error)} onRetry={() => void search.refetch()} />
        ) : search.data.matches.length === 0 ? (
          <EmptyState title="No matches" description="No record contained those filters." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Kind</TH>
                <TH>Key</TH>
                <TH>Target</TH>
                <TH>Updated</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {search.data.matches.map((item) => (
                <TR
                  key={`${item.subject.target_kind}:${item.subject.target_name}:${item.subject.kind}:${item.subject.key}`}
                >
                  <TD>{item.subject.kind}</TD>
                  <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>{item.subject.key}</TD>
                  <TD>
                    {item.subject.target_kind} {item.subject.target_name}
                  </TD>
                  <TD style={{ whiteSpace: 'nowrap' }} title={isoWhen(item.updated_at)}>
                    {formatWhen(item.updated_at)}
                  </TD>
                  <TD>
                    <Button
                      type="button"
                      onClick={() => {
                        onOpen(item.subject);
                      }}
                    >
                      Open
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </Card>
  );
}
