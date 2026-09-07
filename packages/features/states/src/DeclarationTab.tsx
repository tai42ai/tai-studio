/**
 * The Declaration tab and the Declare-state create dialog. Both author a state's base
 * JSON schema (through `SchemaEditor`), the subject kinds it serves (`TagsInput`) with a
 * default kind (`Select`), and an optional retention window. The mounted subtrees a
 * module contributes are shown read-only with a `module` badge — they are edited on the
 * Modules tab, never here (a mount composes into the effective schema, so editing the
 * base never rewrites a module's fragment).
 *
 * Saving a change to a state that already holds records goes through the migration
 * dialog: a preview reports how many records the change rewrites and whether it NARROWS
 * (drops data). A narrowing migration is refused (412) until the operator confirms the
 * drop; a non-narrowing one applies straight through.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  ErrorState,
  Field,
  FormDialog,
  NumberInput,
  Select,
  SchemaEditor,
  Skeleton,
  Spinner,
  TagsInput,
  TextInput,
  errorMessage,
  isFeatureDisabled,
  featureDisabledMessage,
  FeatureDisabled,
  useApi,
  type SchemaEditorChange,
} from '@tai42/studio-sdk';
import {
  ApiError,
  type StateDeclarationBody,
  type StateDetail,
  type StateMigrateBody,
} from '@tai42/api-client';

import { stateDetailKey, stateStatsKey, statesListKey } from './keys';

const PERSON_KIND = 'person';

/** The mutable declaration fields the editor authors, shared by create and edit. */
interface DeclarationDraft {
  readonly description: string;
  readonly schema: Record<string, unknown> | null;
  readonly schemaValid: boolean;
  readonly subjectKinds: string[];
  readonly defaultKind: string;
  readonly retentionDays: string;
}

/** Build the wire declaration body from a draft; the caller has already validated it. */
function toBody(name: string, draft: DeclarationDraft): StateDeclarationBody {
  const retention = draft.retentionDays.trim();
  return {
    name,
    description: draft.description,
    schema: draft.schema ?? {},
    subject_kinds: draft.subjectKinds,
    default_subject_kind: draft.defaultKind,
    retention_days: retention === '' ? null : Number(retention),
  };
}

/** Whether a draft is complete enough to submit (schema valid, ≥1 kind, default in kinds). */
function draftReady(draft: DeclarationDraft): boolean {
  return (
    draft.schemaValid &&
    draft.subjectKinds.length > 0 &&
    draft.defaultKind !== '' &&
    draft.subjectKinds.includes(draft.defaultKind)
  );
}

/** The subject section: the kinds a state serves + the ambient default among them. */
function SubjectSection({
  subjectKinds,
  defaultKind,
  onKinds,
  onDefault,
}: {
  readonly subjectKinds: string[];
  readonly defaultKind: string;
  readonly onKinds: (next: string[]) => void;
  readonly onDefault: (next: string) => void;
}): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
      <Field
        label="Subject kinds"
        description={
          subjectKinds.includes(PERSON_KIND)
            ? 'Keys are person ids from the conversations identity store.'
            : 'The subject families this state serves.'
        }
      >
        <TagsInput value={subjectKinds} onChange={onKinds} aria-label="Subject kinds" />
      </Field>
      <Field label="Default subject kind">
        <Select
          value={defaultKind}
          onValueChange={onDefault}
          aria-label="Default subject kind"
          placeholder="Choose a kind"
          options={subjectKinds.map((kind) => ({ value: kind, label: kind }))}
        />
      </Field>
    </div>
  );
}

/** The retention field: an optional positive day count; blank keeps records forever. */
function RetentionField({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (next: string) => void;
}): ReactNode {
  return (
    <Field
      label="Retention (days)"
      description="Records older than this are pruned. Blank keeps them forever."
    >
      <NumberInput
        value={value}
        min={1}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </Field>
  );
}

export function DeclareStateDialog({
  onClose,
  onCreated,
}: {
  readonly onClose: () => void;
  readonly onCreated: (name: string) => void;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [draft, setDraft] = useState<DeclarationDraft>({
    description: '',
    schema: null,
    schemaValid: true,
    subjectKinds: [],
    defaultKind: '',
    retentionDays: '',
  });

  const nameValid = /^[a-z0-9][a-z0-9_-]*$/.test(name);
  const ready = nameValid && draftReady(draft);

  const submit = async (): Promise<void> => {
    await api.putState(name, toBody(name, draft));
    await queryClient.invalidateQueries({ queryKey: statesListKey });
    onCreated(name);
  };

  return (
    <FormDialog
      title="Declare a state"
      submitLabel="Declare"
      pendingLabel="Declaring"
      submitDisabled={!ready}
      onSubmit={submit}
      onClose={onClose}
    >
      <Field
        label="Name"
        error={
          name !== '' && !nameValid ? 'Lowercase letters, digits, `_` and `-` only.' : undefined
        }
      >
        <TextInput
          value={name}
          placeholder="e.g. profile"
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </Field>
      <Field label="Description">
        <TextInput
          value={draft.description}
          onChange={(event) => {
            setDraft((d) => ({ ...d, description: event.target.value }));
          }}
        />
      </Field>
      <DeclarationEditorBody draft={draft} onDraft={setDraft} />
    </FormDialog>
  );
}

/** The schema + subject + retention editor body, shared by the dialog and the tab. */
function DeclarationEditorBody({
  draft,
  onDraft,
  mounts,
}: {
  readonly draft: DeclarationDraft;
  readonly onDraft: (updater: (d: DeclarationDraft) => DeclarationDraft) => void;
  readonly mounts?: readonly { module: string; path: string[] }[];
}): ReactNode {
  const onSchema = (change: SchemaEditorChange): void => {
    onDraft((d) => ({ ...d, schema: change.schema, schemaValid: change.valid }));
  };
  return (
    <>
      <SchemaEditor
        value={draft.schema}
        onChange={onSchema}
        requireTitle={false}
        label="Base schema"
        description="The document shape for a subject before any module is mounted."
      />
      {mounts !== undefined && mounts.length > 0 ? (
        <Field
          label="Mounted subtrees"
          description="Edited on the Modules tab; read-only here."
          group
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-1)' }}>
            {mounts.map((mount) => (
              <div
                key={`${mount.module}:${mount.path.join('/')}`}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}
              >
                <Badge variant="primary">{mount.module}</Badge>
                <span style={{ fontFamily: 'var(--tai-font-mono)' }}>
                  {mount.path.length > 0 ? mount.path.join(' / ') : '(root)'}
                </span>
              </div>
            ))}
          </div>
        </Field>
      ) : null}
      <SubjectSection
        subjectKinds={draft.subjectKinds}
        defaultKind={draft.defaultKind}
        onKinds={(next) => {
          onDraft((d) => ({
            ...d,
            subjectKinds: next,
            // Keep the default valid: clear it when it leaves the kind set.
            defaultKind: next.includes(d.defaultKind) ? d.defaultKind : (next[0] ?? ''),
          }));
        }}
        onDefault={(next) => {
          // `defaultKind ∈ subjectKinds` is an invariant and the Select offers no empty
          // option, so a transient empty value (Radix clears a controlled value the same
          // render its item mounts) is spurious and ignored.
          if (next !== '') onDraft((d) => ({ ...d, defaultKind: next }));
        }}
      />
      <RetentionField
        value={draft.retentionDays}
        onChange={(next) => {
          onDraft((d) => ({ ...d, retentionDays: next }));
        }}
      />
    </>
  );
}

export function DeclarationTab({ state }: { readonly state: StateDetail }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const statsQuery = useQuery({
    queryKey: stateStatsKey(state.name),
    queryFn: ({ signal }) => api.getStateStats(state.name, signal),
  });

  const initial = useMemo<DeclarationDraft>(
    () => ({
      description: state.description,
      schema: Object.keys(state.schema).length > 0 ? state.schema : null,
      schemaValid: true,
      subjectKinds: [...state.subject_kinds],
      defaultKind: state.default_subject_kind,
      retentionDays: state.retention_days === null ? '' : String(state.retention_days),
    }),
    [state],
  );
  const [draft, setDraft] = useState<DeclarationDraft>(initial);
  const [migrateOpen, setMigrateOpen] = useState(false);

  const recordCount = statsQuery.data?.records ?? 0;
  const schemaChanged = JSON.stringify(draft.schema ?? {}) !== JSON.stringify(state.schema);
  const subjectsChanged =
    JSON.stringify(draft.subjectKinds) !== JSON.stringify(state.subject_kinds) ||
    draft.defaultKind !== state.default_subject_kind;
  // Everything the plain declaration upsert owns (the migrate door touches only the schema).
  const metadataChanged =
    subjectsChanged ||
    draft.description !== state.description ||
    draft.retentionDays !== initial.retentionDays;
  const dirty = schemaChanged || metadataChanged;

  const saveMutation = useMutation({
    mutationFn: () => api.putState(state.name, toBody(state.name, draft)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: stateDetailKey(state.name) });
      void queryClient.invalidateQueries({ queryKey: statesListKey });
    },
  });

  if (statsQuery.isError && isFeatureDisabled(statsQuery.error)) {
    return <FeatureDisabled feature="States" message={featureDisabledMessage(statsQuery.error)} />;
  }

  const onSave = (): void => {
    // A SCHEMA change over existing records goes through the guarded migrate door (the
    // preview surfaces a narrowing, behind the drop confirm). Subject/metadata changes —
    // and an empty state — are a plain declaration PUT, which the server validates
    // (additive kinds pass; a stranding kind removal is refused).
    if (recordCount > 0 && schemaChanged) {
      setMigrateOpen(true);
      return;
    }
    saveMutation.mutate();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
      {statsQuery.isPending ? <Skeleton height={16} /> : null}
      <DeclarationEditorBody
        draft={draft}
        onDraft={setDraft}
        mounts={state.mounts.map((m) => ({ module: m.module, path: m.path }))}
      />
      {saveMutation.isError ? <ErrorState message={errorMessage(saveMutation.error)} /> : null}
      <div>
        <Button
          type="button"
          variant="primary"
          onClick={onSave}
          disabled={!dirty || !draftReady(draft) || saveMutation.isPending}
        >
          {saveMutation.isPending ? <Spinner label="Saving" /> : null}
          Save
        </Button>
      </div>

      {migrateOpen ? (
        <MigrationDialog
          stateName={state.name}
          newSchema={draft.schema ?? {}}
          onClose={() => {
            setMigrateOpen(false);
          }}
          onDone={() => {
            setMigrateOpen(false);
            void queryClient.invalidateQueries({ queryKey: stateDetailKey(state.name) });
            void queryClient.invalidateQueries({ queryKey: stateStatsKey(state.name) });
            // The migrate moved only the schema; persist any subject/metadata change too
            // (the schema now matches, so this upsert is additive).
            if (metadataChanged) saveMutation.mutate();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The migration dialog: preview the declaration change over existing records, then
 * apply it. A NARROWING change (one that drops data) is refused with 412 until the
 * operator ticks Confirm drop; the server's narrowing message is shown verbatim.
 */
function MigrationDialog({
  stateName,
  newSchema,
  onClose,
  onDone,
}: {
  readonly stateName: string;
  readonly newSchema: Record<string, unknown>;
  readonly onClose: () => void;
  readonly onDone: () => void;
}): ReactNode {
  const api = useApi();
  const [confirmDrop, setConfirmDrop] = useState(false);
  const [narrowing, setNarrowing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const previewQuery = useQuery({
    queryKey: [...stateStatsKey(stateName), 'migrate-preview'],
    queryFn: () => api.previewStateMigration(stateName, { new_schema: newSchema }),
  });

  const preview = previewQuery.data;
  // A change narrows when any current record would not fit the new schema. The 412
  // backstop keeps the confirm even if the preview under-reported.
  const previewNarrowing = (preview !== undefined && preview.misfits > 0) || narrowing;
  const previewMessage = message;

  const migrateMutation = useMutation({
    mutationFn: (migrate: StateMigrateBody) => api.migrateState(stateName, migrate),
    onSuccess: () => {
      onDone();
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError && error.status === 412) {
        setNarrowing(true);
        setMessage(error.message);
      }
    },
  });

  // A 412 is the narrowing-needs-confirmation signal, shown inline as the narrowing
  // message + Confirm-drop tick — never the dialog's loud error slot; any other failure
  // is a real error.
  const migrateError: Error | null =
    migrateMutation.error instanceof Error &&
    !(migrateMutation.error instanceof ApiError && migrateMutation.error.status === 412)
      ? migrateMutation.error
      : null;

  return (
    <ConfirmDialog
      title="Migrate records"
      confirmLabel="Migrate"
      pendingLabel="Migrating"
      confirmVariant={previewNarrowing ? 'danger' : 'primary'}
      isPending={migrateMutation.isPending}
      error={migrateError}
      onConfirm={() => {
        migrateMutation.mutate({ new_schema: newSchema, confirm_drop: confirmDrop });
      }}
      onClose={() => {
        if (!migrateMutation.isPending) onClose();
      }}
    >
      {previewQuery.isPending ? (
        <Skeleton height={48} />
      ) : previewQuery.isError ? (
        <ErrorState message={errorMessage(previewQuery.error)} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
          <p style={{ margin: 0 }}>
            Previewing against {preview?.records ?? 0}{' '}
            {(preview?.records ?? 0) === 1 ? 'record' : 'records'}: {preview?.fits ?? 0} fit,{' '}
            {preview?.misfits ?? 0} need attention.
          </p>
          {previewNarrowing ? (
            <>
              <p role="alert" style={{ margin: 0, color: 'var(--tai-color-err-text)' }}>
                {previewMessage ??
                  'This change narrows the schema and drops data from existing records.'}
              </p>
              <Checkbox
                checked={confirmDrop}
                onCheckedChange={(next) => {
                  setConfirmDrop(next);
                }}
                label="Confirm drop — apply the change and lose the narrowed data"
              />
            </>
          ) : null}
        </div>
      )}
    </ConfirmDialog>
  );
}
