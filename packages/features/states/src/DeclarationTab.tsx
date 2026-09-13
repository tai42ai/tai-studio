/**
 * The Declaration tab and the Declare-state create dialog. Both author a state's base
 * schema (the `TemplatedText | dict` union, through `SchemaField`), the subject kinds it
 * serves (`TagsInput`) with a default kind (`Select`), and an optional retention window.
 * When the base schema is a stored template reference, the tab also shows the
 * platform-resolved effective schema read-only beneath the field. The attached subtrees a
 * template contributes are shown read-only with a `template` badge — they are edited on
 * the Templates tab, never here (an attachment composes into the effective schema, so
 * editing the base never rewrites a template's fragment).
 *
 * A save is a plain declaration PUT. With records present the server accepts only
 * additive schema changes; a change that removes or alters an existing field (or a
 * stranding subject-kind removal) is refused with a 409 whose message is shown inline.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  ErrorState,
  Field,
  FormDialog,
  JsonTree,
  NumberInput,
  Select,
  Skeleton,
  Spinner,
  TagsInput,
  TextInput,
  errorMessage,
  isFeatureDisabled,
  featureDisabledMessage,
  templatedTextCatalog,
  FeatureDisabled,
  useApi,
} from '@tai42/studio-sdk';
import { type StateDeclarationBody, type StateDetail } from '@tai42/api-client';

import {
  SchemaField,
  storedSchemaRef,
  type SchemaFieldChange,
  type SchemaUnion,
} from './SchemaField';
import { stateDetailKey, stateStatsKey, statesListKey } from './keys';

const PERSON_KIND = 'person';

/** The mutable declaration fields the editor authors, shared by create and edit. */
interface DeclarationDraft {
  /**
   * The base schema as the served `TemplatedText | dict` union: an inline schema dict, or a
   * stored template reference the platform renders to the schema; `null` when unset.
   */
  readonly schema: SchemaUnion | null;
  readonly description: string;
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

/**
 * The draft's initial base schema from a served declaration: a stored template reference as
 * is, a non-empty inline dict as is, an empty or absent schema as the unset `null`.
 */
function initialSchema(served: StateDetail['schema']): SchemaUnion | null {
  if (served === undefined) return null;
  if (storedSchemaRef(served) !== null) return served;
  return Object.keys(served).length > 0 ? served : null;
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
  attachments,
  resolvedSchema,
}: {
  readonly draft: DeclarationDraft;
  readonly onDraft: (updater: (d: DeclarationDraft) => DeclarationDraft) => void;
  readonly attachments?: readonly { template: string; path: string[] }[];
  /**
   * The platform-resolved `effective_schema` of the SAVED declaration, shown read-only when
   * its base schema is a stored template reference (an `id` alone does not reveal the shape).
   * Absent on a create, where nothing is resolved yet.
   */
  readonly resolvedSchema?: Record<string, unknown> | null;
}): ReactNode {
  const api = useApi();
  // The stored templates the schema field's picker offers, gated on a storage backend being
  // present (the list door 500s without one; a storage-free deployment is supported). Presence
  // is the shared `['storage', 'info']` query the templates/storage screens read, so React
  // Query serves it once.
  const storageQuery = useQuery({
    queryKey: ['storage', 'info'],
    queryFn: ({ signal }) => api.getStorageInfo(signal),
  });
  const templatesQuery = useQuery({
    queryKey: ['templates', 'names'],
    queryFn: ({ signal }) => api.listTemplates(signal),
    enabled: storageQuery.data?.present === true,
  });
  const catalog = templatedTextCatalog(storageQuery, templatesQuery);

  const onSchema = (change: SchemaFieldChange): void => {
    onDraft((d) => ({ ...d, schema: change.schema, schemaValid: change.valid }));
  };
  const storedBase = storedSchemaRef(draft.schema);
  return (
    <>
      <SchemaField
        label="Base schema"
        description="The document shape for a subject before any template is attached."
        value={draft.schema}
        onChange={onSchema}
        catalog={catalog}
      />
      {storedBase !== null && resolvedSchema !== undefined && resolvedSchema !== null ? (
        <Field label="Resolved schema" description="Resolved from the stored template." group>
          <JsonTree data={resolvedSchema} label="Resolved schema" />
        </Field>
      ) : null}
      {attachments !== undefined && attachments.length > 0 ? (
        <Field
          label="Attached subtrees"
          description="Edited on the Templates tab; read-only here."
          group
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-1)' }}>
            {attachments.map((attachment) => (
              <div
                key={`${attachment.template}:${attachment.path.join('/')}`}
                style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}
              >
                <Badge variant="primary">{attachment.template}</Badge>
                <span style={{ fontFamily: 'var(--tai-font-mono)' }}>
                  {attachment.path.length > 0 ? attachment.path.join(' / ') : '(root)'}
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
      schema: initialSchema(state.schema),
      schemaValid: true,
      subjectKinds: [...state.subject_kinds],
      defaultKind: state.default_subject_kind,
      retentionDays: state.retention_days === null ? '' : String(state.retention_days),
    }),
    [state],
  );
  const [draft, setDraft] = useState<DeclarationDraft>(initial);

  const schemaChanged = JSON.stringify(draft.schema ?? {}) !== JSON.stringify(state.schema ?? {});
  const subjectsChanged =
    JSON.stringify(draft.subjectKinds) !== JSON.stringify(state.subject_kinds) ||
    draft.defaultKind !== state.default_subject_kind;
  const dirty =
    schemaChanged ||
    subjectsChanged ||
    draft.description !== state.description ||
    draft.retentionDays !== initial.retentionDays;

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
      {statsQuery.isPending ? <Skeleton height={16} /> : null}
      <DeclarationEditorBody
        draft={draft}
        onDraft={setDraft}
        attachments={state.attachments.map((a) => ({ template: a.template, path: a.path }))}
        resolvedSchema={state.effective_schema}
      />
      {saveMutation.isError ? <ErrorState message={errorMessage(saveMutation.error)} /> : null}
      <div>
        <Button
          type="button"
          variant="primary"
          onClick={() => {
            saveMutation.mutate();
          }}
          disabled={!dirty || !draftReady(draft) || saveMutation.isPending}
        >
          {saveMutation.isPending ? <Spinner label="Saving" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}
