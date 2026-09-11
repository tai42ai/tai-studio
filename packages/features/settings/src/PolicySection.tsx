/**
 * The "Policy" section appended to the API-keys create/edit dialog. It authors the
 * access-control policy fields that ride in the API-keys create/edit request bodies
 * — there is NO new key-CRUD route:
 *
 *  - `policy_data` — a key/value editor whose rows round-trip into a JSON object
 *    surfaced under `.policy.*` in the jq context. A value that parses as JSON
 *    (number/bool/object) is stored as that value; otherwise it is a string.
 *  - `condition` — an authored templated-text value edited through the shared
 *    {@link TemplatedTextField}: inline jq content OR a stored template id, with
 *    render kwargs, exactly one source. The INLINE editor carries the extra jq
 *    chrome the policy condition needs: the `JqAuthContext` field hints, a
 *    sample-context editor, and a Test-condition button hitting the fail-closed
 *    `POST /api/auth/validate-condition` guard. The guard is ADVISORY: a failed
 *    test (400) surfaces the verbatim guard message and raises a NON-BLOCKING
 *    "condition failed its last test" warning next to Save (via
 *    `onConditionTestFailedChange(true)`), but never blocks the save — the server
 *    re-validates at enforcement.
 *
 * Emptying an input is NEVER a delete: the edit PUT is PATCH-style, so an absent
 * field preserves its stored value. An UNTOUCHED condition is OMITTED (so a save
 * that never touched it cannot re-serialize a stored value into a phantom version);
 * to actually remove a saved value, the EDIT dialog surfaces two explicit
 * affordances — each behind a small inline confirm (removal loosens the key):
 *  - "Remove condition" emits `condition: null` (the whole condition is removed).
 *  - "Clear policy data" emits `policy_data: null`.
 * Both appear ONLY when the seed carries a value to remove (never in CREATE mode).
 *
 * Every server-supplied string (template id, error text) renders as ESCAPED text
 * through the design-system components — never an HTML sink.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  ErrorState,
  Spinner,
  TemplatedTextField,
  TextInput,
  Textarea,
  errorMessage,
  templatedTextCatalog,
  useApi,
} from '@tai42/studio-sdk';
import type { TemplatedText } from '@tai42/api-client';
import { JqField, type JqInputShapeDescriptor, type ServerValidateHook } from '@tai42/jq-studio';

import { templateNamesKey } from './keys';

/**
 * The subset of the create/edit body this section owns. An ABSENT field is not
 * authored (the PATCH-style PUT preserves its stored value); an explicit `null`
 * is an EXPLICIT CLEAR, emitted only by the edit-mode "Remove condition" / "Clear
 * policy data" affordances — an emptied input alone never clears.
 */
export interface PolicyFields {
  policy_data?: Record<string, unknown> | null;
  condition?: TemplatedText | null;
}

/** Pre-fill for the edit dialog (from the key's `tokens-payload` record). */
export interface PolicySeed {
  readonly policy_data?: unknown;
  readonly condition?: TemplatedText | null;
}

interface Row {
  readonly key: string;
  readonly value: string;
}

/**
 * A `JqAuthContext` skeleton pre-seeding the sample-context editor, so the author
 * sees the exact shape enforcement evaluates the condition against
 * (`tai42_contract.access_control.models.JqAuthContext`).
 */
const SAMPLE_CONTEXT_OBJECT: Record<string, unknown> = {
  sub: 'anon',
  scopes: [],
  identity: {},
  policy: {},
  context: {},
  request: {},
  system: {},
};
const SAMPLE_CONTEXT_SKELETON = JSON.stringify(SAMPLE_CONTEXT_OBJECT, null, 2);

/**
 * Parse the sample-context editor. Blank means NO sample — the guard then only
 * compiles (its `result` is `null`). A non-blank value must be a JSON object;
 * bad JSON or a non-object throws a loud message that blocks the request (nothing
 * is sent to the guard).
 */
function parseSampleContext(raw: string): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Invalid JSON: ${errorMessage(error)}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid JSON: sample context must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

/**
 * The LIVE sample the visual editor's Test panel seeds from: the sample-context
 * editor's current content parsed as an object, or `undefined` when it is blank or
 * malformed. Returning `undefined` is deliberate — JqField's `sampleInput`
 * precedence is live → `shape.sample` → blank, so a blank/bad editor falls back to
 * the static `CONDITION_SHAPE.sample` skeleton upstream rather than seeding Test
 * with junk. Exported so the seeding is unit-tested directly. See
 * {@link parseSampleContext} for the parse rules (this one swallows its throw).
 */
export function liveSampleInput(raw: string): unknown {
  try {
    return parseSampleContext(raw);
  } catch {
    return undefined;
  }
}

/** The `JqAuthContext` field paths the jq condition can read, shown as hints. */
const JQ_CONTEXT_HINTS: readonly string[] = [
  '.sub',
  '.scopes',
  '.identity.*',
  '.policy.*',
  '.context.*',
  '.request.path',
  '.request.method',
  '.system.time',
];

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
  paddingTop: 'var(--tai-space-3)',
  marginTop: 'var(--tai-space-2)',
  borderTop: '1px solid var(--tai-color-border)',
};

const fieldLabelStyle: CSSProperties = {
  fontSize: 'var(--tai-text-sm)',
  fontWeight: 600,
  color: 'var(--tai-color-text)',
  display: 'block',
  marginBottom: 'var(--tai-space-1)',
};

const rowStyle: CSSProperties = {
  display: 'flex',
  gap: 'var(--tai-space-2)',
  alignItems: 'center',
  marginBottom: 'var(--tai-space-2)',
};

const hintsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-1)',
  fontFamily: 'var(--tai-font-mono)',
};

const inlineConfirmStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-2)',
  alignItems: 'center',
  marginTop: 'var(--tai-space-2)',
};

/** A non-null, non-array object — the shape a stored `policy_data` takes. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * What `.` IS for the inline jq condition: the `JqAuthContext` enforcement evaluates
 * it against. Handed to the `JqField` `shape` prop so the visual editor offers path
 * suggestions/context chips and seeds its Test panel from the static skeleton
 * (`tai42_contract.access_control.models.JqAuthContext`). Exported so the field's
 * wiring is unit-tested directly rather than through the editor UI.
 */
export const CONDITION_SHAPE: JqInputShapeDescriptor = {
  id: 'tai42.access-control.jq-auth-context',
  label: 'auth context',
  blurb: 'The JqAuthContext the access-control condition is evaluated against at enforcement.',
  keys: [
    { name: 'sub', gloss: 'the caller subject id' },
    { name: 'scopes', gloss: 'the granted scopes (array of strings)' },
    { name: 'identity', gloss: 'identity claims, read as .identity.*' },
    { name: 'policy', gloss: 'the key policy_data, read as .policy.*' },
    { name: 'context', gloss: 'request-time context, read as .context.*' },
    { name: 'request', gloss: 'the request — .request.path, .request.method' },
    { name: 'system', gloss: 'system values — .system.time' },
  ],
  returns: 'true or false — the request is allowed when the condition returns true',
  sample: SAMPLE_CONTEXT_OBJECT,
};

/**
 * The `JqField` `serverValidate` hook for the inline jq condition, bound to the
 * client: the SAME fail-closed `validate-condition` guard the inline Test button
 * hits, so the visual editor validates against exactly what enforcement evaluates.
 * A non-object sample compiles-only (no `sample_context`); a 400 maps to the guard's
 * verbatim message. Exported so the guard mapping is unit-tested directly.
 */
export function makeConditionServerValidate(api: ReturnType<typeof useApi>): ServerValidateHook {
  return async ({ expression, sampleInput }) => {
    try {
      const sample = isPlainObject(sampleInput) ? sampleInput : undefined;
      const result = await api.validateCondition(
        sample === undefined
          ? { condition: expression }
          : { condition: expression, sample_context: sample },
      );
      return {
        ok: result.ok,
        compiles: result.ok,
        message:
          result.result === null
            ? undefined
            : result.result
              ? 'allows the sample'
              : 'denies the sample',
      };
    } catch (error) {
      return { ok: false, compiles: false, message: errorMessage(error) };
    }
  };
}

/** Parse a cell value as JSON when it can be (numbers/bools/objects), else keep the string. */
function parseCellValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

/** Collapse the editor rows into a JSON object, dropping rows with a blank key. */
function rowsToObject(rows: readonly Row[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key.length === 0) continue;
    out[key] = parseCellValue(row.value);
  }
  return out;
}

/** Seed editor rows from a stored JSON object (stringifying non-string values). */
function objectToRows(value: unknown): Row[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).map(([key, raw]) => ({
    key,
    value: typeof raw === 'string' ? raw : JSON.stringify(raw),
  }));
}

/** A add/remove key/value editor whose rows round-trip through `rowsToObject`. */
function KeyValueEditor({
  label,
  rows,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly rows: readonly Row[];
  readonly disabled: boolean;
  readonly onChange: (rows: Row[]) => void;
}): ReactNode {
  return (
    <div>
      <span style={fieldLabelStyle}>{label}</span>
      {rows.map((row, index) => (
        <div key={index} style={rowStyle}>
          <TextInput
            aria-label={`${label} key ${String(index + 1)}`}
            placeholder="key"
            value={row.key}
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => {
              const next = [...rows];
              next[index] = { ...row, key: event.target.value };
              onChange(next);
            }}
          />
          <TextInput
            aria-label={`${label} value ${String(index + 1)}`}
            placeholder="value"
            value={row.value}
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => {
              const next = [...rows];
              next[index] = { ...row, value: event.target.value };
              onChange(next);
            }}
          />
          <Button
            type="button"
            aria-label={`Remove ${label} row ${String(index + 1)}`}
            disabled={disabled}
            onClick={() => {
              onChange(rows.filter((_, i) => i !== index));
            }}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        type="button"
        disabled={disabled}
        onClick={() => {
          onChange([...rows, { key: '', value: '' }]);
        }}
      >
        {`Add ${label} row`}
      </Button>
    </div>
  );
}

/**
 * A two-click inline confirm for a destructive clear. First click reveals a
 * Cancel/Confirm prompt in place (no heavy modal — this section already lives
 * inside the key dialog); confirming fires `onConfirm` and collapses back.
 */
function InlineConfirm({
  triggerLabel,
  prompt,
  confirmLabel,
  cancelLabel,
  disabled,
  onConfirm,
}: {
  readonly triggerLabel: string;
  readonly prompt: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly disabled: boolean;
  readonly onConfirm: () => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button
        type="button"
        variant="danger"
        disabled={disabled}
        onClick={() => {
          setOpen(true);
        }}
      >
        {triggerLabel}
      </Button>
    );
  }
  return (
    <div style={inlineConfirmStyle} role="group" aria-label={triggerLabel}>
      <span style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}>
        {prompt}
      </span>
      <Button
        type="button"
        aria-label={cancelLabel}
        disabled={disabled}
        onClick={() => {
          setOpen(false);
        }}
      >
        {cancelLabel}
      </Button>
      <Button
        type="button"
        variant="danger"
        aria-label={confirmLabel}
        disabled={disabled}
        onClick={() => {
          onConfirm();
          setOpen(false);
        }}
      >
        {confirmLabel}
      </Button>
    </div>
  );
}

export function PolicySection({
  idPrefix,
  seed,
  disabled = false,
  onChange,
  onConditionTestFailedChange,
}: {
  readonly idPrefix: string;
  readonly seed?: PolicySeed;
  readonly disabled?: boolean;
  /** Fires with the authored policy fields whenever the section changes. */
  readonly onChange: (fields: PolicyFields) => void;
  /**
   * Fires `true` when the inline condition's last Test failed (a 400) and it has
   * not been edited or re-tested since — the parent shows a non-blocking warning
   * next to Save. Never blocks the save.
   */
  readonly onConditionTestFailedChange: (failed: boolean) => void;
}): ReactNode {
  const api = useApi();

  const [policyRows, setPolicyRows] = useState<Row[]>(() => objectToRows(seed?.policy_data));
  const [condition, setCondition] = useState<TemplatedText | null>(() => seed?.condition ?? null);
  // The known-broken condition message from the last Test (a 400 the guard threw:
  // compile/render/eval failure or the empty-render lock-out); cleared on edit. It
  // is surfaced verbatim and raises a non-blocking warning next to Save; it never
  // blocks the save (the server re-validates at enforcement).
  const [conditionError, setConditionError] = useState<string | null>(null);
  // The last SUCCESSFUL Test outcome: the guard compiled the condition, and (with a
  // sample) evaluated it — `allows`/`denies` for a boolean result, `compiles` when no
  // sample was evaluated. `null` before any successful Test.
  const [validateOutcome, setValidateOutcome] = useState<'allows' | 'denies' | 'compiles' | null>(
    null,
  );
  // The sample-context editor value (pre-seeded with the JqAuthContext skeleton) and
  // its loud parse error (bad JSON blocks the Test request, never blocks save).
  const [sampleContext, setSampleContext] = useState(SAMPLE_CONTEXT_SKELETON);
  const [sampleError, setSampleError] = useState<string | null>(null);
  // Explicit-clear latches: set by the edit-mode affordances so the section emits
  // an explicit `null` (a delete) instead of merely omitting an emptied field. Any
  // fresh authoring of that side un-latches it so the new value is emitted instead.
  const [conditionCleared, setConditionCleared] = useState(false);
  const [policyDataCleared, setPolicyDataCleared] = useState(false);
  // Bumped by "Remove condition" to remount the seeded-once control on a fresh value.
  const [conditionResetToken, setConditionResetToken] = useState(0);
  // Whether the user has actually authored these editors this session. An UNTOUCHED
  // field re-emits the stored value BYTE-FOR-BYTE (via OMIT for the condition, and via
  // the verbatim-seed branch for policy data): the row form cannot distinguish a
  // stored string `"7"`/`"true"` from the number `7`/boolean `true`, so re-serializing
  // an untouched field would silently coerce a stored value's JSON type — changing the
  // enforced value and appending a phantom version.
  const [policyDataEdited, setPolicyDataEdited] = useState(false);
  const [conditionEdited, setConditionEdited] = useState(false);
  const [seededPolicyDataValue] = useState<Record<string, unknown> | undefined>(() => {
    const value = seed?.policy_data;
    return isPlainObject(value) && Object.keys(value).length > 0 ? value : undefined;
  });

  // The affordances only make sense when the seed carries something to remove — i.e.
  // EDIT mode with a saved value. In CREATE mode (no seed) there is nothing to clear.
  const seededCondition = seed?.condition != null;
  const seededPolicyData = objectToRows(seed?.policy_data).length > 0;

  // The stored templates the id picker offers — gated on a storage backend being
  // present (the list door 500s without one; a storage-free deployment is supported).
  // Presence is the shared `['storage', 'info']` query the templates/storage screens
  // read, so React Query serves it once.
  const storageQuery = useQuery({
    queryKey: ['storage', 'info'],
    queryFn: ({ signal }) => api.getStorageInfo(signal),
  });
  const templatesQuery = useQuery({
    queryKey: templateNamesKey,
    queryFn: ({ signal }) => api.listTemplates(signal),
    enabled: storageQuery.data?.present === true,
  });

  const validate = useMutation({
    // The guard evaluates a given inline condition against the parsed sample context
    // (omitted when the sample editor is blank → compile-only).
    mutationFn: ({
      content,
      sample,
    }: {
      content: string;
      sample: Record<string, unknown> | undefined;
    }) =>
      api.validateCondition(
        sample === undefined
          ? { condition: content }
          : { condition: content, sample_context: sample },
      ),
    onSuccess: (result) => {
      setConditionError(null);
      setValidateOutcome(
        result.result === true ? 'allows' : result.result === false ? 'denies' : 'compiles',
      );
    },
    onError: (error) => {
      // A 400 is the guard's verbatim compile/render/eval message (including the
      // empty-render lock-out) — surfaced exactly, never rephrased.
      setValidateOutcome(null);
      setConditionError(errorMessage(error));
    },
  });

  const runTest = (content: string): void => {
    setSampleError(null);
    let sample: Record<string, unknown> | undefined;
    try {
      sample = parseSampleContext(sampleContext);
    } catch (error) {
      // A malformed sample is a loud FIELD error that never fires the request and
      // never blocks save (the sample is a test input, not part of the condition).
      setSampleError(errorMessage(error));
      return;
    }
    validate.mutate({ content, sample });
  };

  // The inline jq condition's server-validate hook, bound to the client (the shape
  // is the static {@link CONDITION_SHAPE}); the visual editor's Test panel seeds
  // from the LIVE sample-context editor via {@link provideSampleInput}.
  const conditionServerValidate = useMemo(() => makeConditionServerValidate(api), [api]);
  const provideSampleInput = useCallback(() => liveSampleInput(sampleContext), [sampleContext]);

  const fields = useMemo<PolicyFields>(() => {
    const out: PolicyFields = {};

    if (policyDataCleared) {
      out.policy_data = null;
    } else if (policyDataEdited) {
      const policyData = rowsToObject(policyRows);
      if (Object.keys(policyData).length > 0) out.policy_data = policyData;
    } else if (seededPolicyDataValue !== undefined) {
      // Pristine editor in edit mode: re-emit the stored object VERBATIM so a save
      // that never touched policy data cannot coerce a stored value's JSON type.
      out.policy_data = seededPolicyDataValue;
    }

    if (conditionCleared) {
      // Explicit clear (edit mode): remove the condition.
      out.condition = null;
    } else if (conditionEdited) {
      // The control keeps content XOR id and preserves untouched kwargs verbatim, so
      // the emitted value is exactly what the author sees.
      if (condition !== null) out.condition = condition;
    }
    // Untouched: OMIT (the PATCH-style PUT preserves the stored condition byte-for-byte).
    return out;
  }, [
    policyDataCleared,
    policyDataEdited,
    seededPolicyDataValue,
    policyRows,
    conditionCleared,
    conditionEdited,
    condition,
  ]);

  const conditionTestFailed = conditionError !== null;

  useEffect(() => {
    onChange(fields);
  }, [fields, onChange]);

  useEffect(() => {
    onConditionTestFailedChange(conditionTestFailed);
  }, [conditionTestFailed, onConditionTestFailedChange]);

  const templatedTextTemplates = templatedTextCatalog(storageQuery, templatesQuery);

  return (
    <div style={sectionStyle}>
      <span style={{ ...fieldLabelStyle, fontSize: 'var(--tai-text-md)' }}>Policy</span>

      <div>
        <KeyValueEditor
          label="Policy data"
          rows={policyRows}
          disabled={disabled}
          onChange={(rows) => {
            setPolicyRows(rows);
            setPolicyDataEdited(true);
            setPolicyDataCleared(false);
          }}
        />
        {seededPolicyData && !policyDataCleared ? (
          <InlineConfirm
            triggerLabel="Clear policy data"
            prompt="Clear the saved policy data?"
            confirmLabel="Yes, clear policy data"
            cancelLabel="Keep policy data"
            disabled={disabled}
            onConfirm={() => {
              setPolicyDataCleared(true);
              setPolicyRows([]);
            }}
          />
        ) : null}
      </div>

      <div>
        <TemplatedTextField
          key={`condition-${String(conditionResetToken)}`}
          label="Condition"
          value={condition}
          disabled={disabled}
          templates={templatedTextTemplates.templates}
          templatesLoading={templatedTextTemplates.loading}
          templatesError={templatedTextTemplates.error}
          onTemplatesRetry={templatedTextTemplates.onRetry}
          storageAbsent={templatedTextTemplates.storageAbsent}
          storagePresenceLoading={templatedTextTemplates.storagePresenceLoading}
          onChange={(next) => {
            setCondition(next);
            setConditionEdited(true);
            setConditionCleared(false);
            // Editing invalidates the last Test result, clearing the Save warning.
            setConditionError(null);
            setValidateOutcome(null);
          }}
          renderInline={({ label, value, onChange: onInline, hideLabel }) => (
            <div
              className={hideLabel ? 'tai-templated-inline--grouped' : undefined}
              style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}
            >
              <JqField
                label={label}
                shape={CONDITION_SHAPE}
                sampleInput={provideSampleInput}
                serverValidate={conditionServerValidate}
                multiline
                value={value}
                readOnly={disabled}
                onChange={onInline}
              />
              <div>
                <span
                  style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}
                >
                  Available context fields:
                </span>
                <div style={hintsStyle}>
                  {JQ_CONTEXT_HINTS.map((hint) => (
                    <Badge key={hint} variant="neutral">
                      {hint}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <label style={fieldLabelStyle} htmlFor={`${idPrefix}-sample-context`}>
                  Sample context (JSON)
                </label>
                <Textarea
                  id={`${idPrefix}-sample-context`}
                  aria-label="Sample context (JSON)"
                  value={sampleContext}
                  rows={7}
                  spellCheck={false}
                  disabled={disabled}
                  onChange={(event) => {
                    setSampleContext(event.target.value);
                    setSampleError(null);
                  }}
                />
                <p
                  style={{
                    margin: 'var(--tai-space-1) 0 0',
                    fontSize: 'var(--tai-text-sm)',
                    color: 'var(--tai-color-text-muted)',
                  }}
                >
                  The JqAuthContext the condition is evaluated against. Blank tests compile-only (no
                  allow/deny).
                </p>
                {sampleError !== null ? (
                  <p
                    role="alert"
                    style={{
                      margin: 'var(--tai-space-1) 0 0',
                      fontSize: 'var(--tai-text-sm)',
                      color: 'var(--tai-color-err-text)',
                    }}
                  >
                    {sampleError}
                  </p>
                ) : null}
              </div>
              <div>
                <Button
                  type="button"
                  disabled={disabled || value.trim().length === 0 || validate.isPending}
                  onClick={() => {
                    runTest(value);
                  }}
                >
                  {validate.isPending ? <Spinner label="Testing" /> : null}
                  Test condition
                </Button>
              </div>
              {conditionError !== null ? <ErrorState message={conditionError} /> : null}
              {validateOutcome !== null ? (
                <div role="status">
                  {validateOutcome === 'allows' ? (
                    <Badge variant="success">allows sample</Badge>
                  ) : validateOutcome === 'denies' ? (
                    <Badge variant="warning">denies sample</Badge>
                  ) : (
                    <Badge variant="neutral">compiles (no sample evaluated)</Badge>
                  )}
                </div>
              ) : null}
            </div>
          )}
        />
      </div>

      {seededCondition && !conditionCleared ? (
        <InlineConfirm
          triggerLabel="Remove condition"
          prompt="Remove the saved condition?"
          confirmLabel="Yes, remove condition"
          cancelLabel="Keep condition"
          disabled={disabled}
          onConfirm={() => {
            setConditionCleared(true);
            setCondition(null);
            setConditionEdited(false);
            setConditionError(null);
            setValidateOutcome(null);
            setSampleError(null);
            setConditionResetToken((token) => token + 1);
          }}
        />
      ) : null}
    </div>
  );
}
