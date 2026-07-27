/**
 * The "Policy" section appended to the API-keys create/edit dialog. It authors
 * the access-control policy fields that ride in the API-keys create/edit
 * request bodies — there is NO new key-CRUD route:
 *
 *  - `policy_data` — a key/value editor whose rows round-trip into a JSON object
 *    surfaced under `.policy.*` in the jq context. A value that parses as JSON
 *    (number/bool/object) is stored as that value; otherwise it is a string.
 *  - `condition` — a mode toggle between two MUTUALLY-EXCLUSIVE authoring modes:
 *      * Inline jq — a `condition` textarea with the `JqAuthContext` field hints
 *        listed, a sample-context editor, and a Test-condition button hitting the
 *        fail-closed `POST /api/auth/validate-condition` guard. The guard is
 *        ADVISORY: a failed test (400) surfaces the verbatim guard message and
 *        raises a NON-BLOCKING "condition failed its last test" warning next to
 *        Save (via `onConditionTestFailedChange(true)`), but never blocks the save
 *        — the server re-validates at enforcement.
 *      * Named template — a `condition_id` selector fed by `GET /api/templates`
 *        plus a `condition_kwargs` key/value form.
 *    The unused side is always sent as `null`, so the server never sees both
 *    `condition` and `condition_id` set (which enforcement rejects) even when an
 *    edit switches modes.
 *
 * Emptying an input is NEVER a delete: the edit PUT is PATCH-style, so an absent
 * field preserves its stored value. To actually remove a previously-saved value,
 * the EDIT dialog surfaces two explicit affordances — each behind a small inline
 * confirm (removal loosens the key, so it is guarded):
 *  - "Remove condition" emits `condition: null`, `condition_id: null` AND
 *    `condition_kwargs: null` (the whole condition is removed as a unit — no
 *    orphaned kwargs, and no mode leaves a condition set).
 *  - "Clear policy data" emits `policy_data: null`.
 * Both appear ONLY when the seed carries a value to remove (never in CREATE mode).
 *
 * Every server-supplied string (template id, error text) renders as ESCAPED text
 * through the design-system components — never an HTML sink.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  ErrorState,
  RadioGroup,
  Select,
  Spinner,
  TextInput,
  Textarea,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';

import { templateNamesKey } from './keys';

/**
 * The subset of the create/edit body this section owns. An ABSENT field is not
 * authored (the PATCH-style PUT preserves its stored value); an explicit `null`
 * is an EXPLICIT CLEAR, emitted only by the edit-mode "Remove condition" / "Clear
 * policy data" affordances — an emptied input alone never clears.
 */
export interface PolicyFields {
  policy_data?: Record<string, unknown> | null;
  condition?: string | null;
  condition_id?: string | null;
  condition_kwargs?: Record<string, unknown> | null;
}

/** Pre-fill for the edit dialog (from the key's `tokens-payload` record). */
export interface PolicySeed {
  readonly policy_data?: unknown;
  readonly condition?: string | null;
  readonly condition_id?: string | null;
  readonly condition_kwargs?: unknown;
}

type ConditionMode = 'inline' | 'template';

interface Row {
  readonly key: string;
  readonly value: string;
}

/**
 * A `JqAuthContext` skeleton pre-seeding the sample-context editor, so the author
 * sees the exact shape enforcement evaluates the condition against
 * (`tai42_contract.access_control.models.JqAuthContext`).
 */
const SAMPLE_CONTEXT_SKELETON = JSON.stringify(
  { sub: 'anon', scopes: [], identity: {}, policy: {}, context: {}, request: {}, system: {} },
  null,
  2,
);

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

/** A non-null, non-array object — the shape a stored `policy_data`/`condition_kwargs` takes. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

/** Choose the initial mode: template when the seed carries a `condition_id`. */
function initialMode(seed: PolicySeed | undefined): ConditionMode {
  return seed?.condition_id != null && seed.condition_id.length > 0 ? 'template' : 'inline';
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
  const [mode, setMode] = useState<ConditionMode>(() => initialMode(seed));
  const [condition, setCondition] = useState(() => seed?.condition ?? '');
  const [conditionId, setConditionId] = useState(() => seed?.condition_id ?? '');
  const [kwargsRows, setKwargsRows] = useState<Row[]>(() => objectToRows(seed?.condition_kwargs));
  // The known-broken condition message from the last Test (a 400 the guard threw:
  // compile/render/eval failure or the empty-render lock-out); cleared on edit. It
  // is surfaced verbatim and raises a non-blocking warning next to Save; it never
  // blocks the save (the server re-validates at enforcement).
  const [conditionError, setConditionError] = useState<string | null>(null);
  // The last SUCCESSFUL Test outcome: the guard compiled the condition, and (with a
  // sample) evaluated it — `allows`/`denies` for a boolean result, `compiles` when no
  // sample was evaluated. `null` before any successful Test. A denied sample is still
  // a valid condition; the Test is advisory and never blocks save.
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
  // Whether the user has actually authored the key/value editors this session. An
  // UNTOUCHED editor must re-emit the stored value BYTE-FOR-BYTE, not re-serialize
  // its rows: the row form cannot distinguish a stored string `"7"`/`"true"` from
  // the number `7`/boolean `true`, so re-serializing an untouched field would
  // silently coerce a stored string to a different JSON type — changing the
  // enforced `.policy.*` value and appending a phantom version. The captured seed
  // values below are the verbatim originals, re-emitted while the editor is pristine.
  const [policyDataEdited, setPolicyDataEdited] = useState(false);
  const [kwargsEdited, setKwargsEdited] = useState(false);
  const [seededPolicyDataValue] = useState<Record<string, unknown> | undefined>(() => {
    const value = seed?.policy_data;
    return isPlainObject(value) && Object.keys(value).length > 0 ? value : undefined;
  });
  const [seededKwargsValue] = useState<Record<string, unknown> | undefined>(() => {
    const value = seed?.condition_kwargs;
    return isPlainObject(value) && Object.keys(value).length > 0 ? value : undefined;
  });
  // The verbatim stored inline condition, captured once. A pristine (unedited)
  // condition re-emits this exact string rather than a trimmed copy, so a save that
  // never touched the condition cannot normalize stored whitespace into a changed
  // body and a phantom version. Only a non-blank stored condition is captured.
  const [seededConditionValue] = useState<string | undefined>(() => {
    const value = seed?.condition;
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  });

  // The affordances only make sense when the seed carries something to remove — i.e.
  // EDIT mode with a saved value. In CREATE mode (no seed) there is nothing to clear.
  const seededCondition =
    (seed?.condition != null && seed.condition.length > 0) ||
    (seed?.condition_id != null && seed.condition_id.length > 0);
  const seededPolicyData = objectToRows(seed?.policy_data).length > 0;

  const templatesQuery = useQuery({
    queryKey: templateNamesKey,
    queryFn: ({ signal }) => api.listTemplates(signal),
    enabled: mode === 'template',
  });

  const validate = useMutation({
    // The guard evaluates the CURRENT inline condition against the parsed sample
    // context (omitted when the sample editor is blank → compile-only). It never
    // rides a `condition_id`, so the either/or is honored by construction.
    mutationFn: (sample: Record<string, unknown> | undefined) =>
      api.validateCondition(
        sample === undefined ? { condition } : { condition, sample_context: sample },
      ),
    onSuccess: (result) => {
      setConditionError(null);
      setValidateOutcome(
        result.result === true ? 'allows' : result.result === false ? 'denies' : 'compiles',
      );
    },
    onError: (error) => {
      // A 400 is the guard's verbatim compile/render/eval message (including the
      // empty-render lock-out) — surfaced exactly, never rephrased. It raises a
      // non-blocking warning next to Save but never blocks the save; the server
      // re-validates at enforcement.
      setValidateOutcome(null);
      setConditionError(errorMessage(error));
    },
  });

  const runTest = (): void => {
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
    validate.mutate(sample);
  };

  const fields = useMemo<PolicyFields>(() => {
    const out: PolicyFields = {};

    if (policyDataCleared) {
      // Explicit clear (edit mode): wipe the stored policy data.
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
      // Explicit clear (edit mode): remove the condition as a UNIT — null every
      // condition field so neither an inline nor a template condition survives, and
      // no orphaned kwargs are left behind.
      out.condition = null;
      out.condition_id = null;
      out.condition_kwargs = null;
    } else if (mode === 'inline') {
      if (seededConditionValue !== undefined && condition === seededConditionValue) {
        // Pristine seeded condition (unedited): re-emit VERBATIM so a save that never
        // touched the condition can't trim stored whitespace into a changed body and
        // a phantom version. A real edit (value differs) is trimmed/normalized below.
        out.condition = seededConditionValue;
        out.condition_id = null;
        // condition_kwargs is OMITTED (never nulled): an inline condition can be
        // Jinja-templated and legitimately carry kwargs, so a pristine (e.g.
        // description-only) save must leave the stored kwargs untouched via PATCH —
        // nulling them would wipe a valid inline condition's variables, alter the
        // enforced body, and append a phantom version. Only a REAL template→inline
        // switch (the else branch) clears orphaned kwargs.
      } else {
        const text = condition.trim();
        if (text.length > 0) {
          // The unused template side is nulled so the server never sees both set.
          out.condition = text;
          out.condition_id = null;
          // Switching a SEEDED template condition to inline mode must not orphan the
          // template's kwargs (inline mode has no kwargs editor): clear them so the
          // stored/enforced body and its version can't keep a stale condition_kwargs.
          if (seededKwargsValue !== undefined) out.condition_kwargs = null;
        }
      }
    } else {
      const id = conditionId.trim();
      if (id.length > 0) {
        out.condition_id = id;
        out.condition = null;
        if (kwargsEdited) {
          out.condition_kwargs = rowsToObject(kwargsRows);
        } else if (seededKwargsValue !== undefined) {
          // Pristine kwargs editor re-emits the stored object VERBATIM (same JSON-type
          // preservation as policy data above).
          out.condition_kwargs = seededKwargsValue;
        }
        // A pristine kwargs editor with no meaningful stored kwargs omits the field
        // entirely: the PATCH-style PUT then preserves the stored value rather than
        // writing a phantom `{}` (which would coerce a stored null and pollute history).
      }
    }
    return out;
  }, [
    policyDataCleared,
    policyDataEdited,
    seededPolicyDataValue,
    policyRows,
    conditionCleared,
    mode,
    condition,
    seededConditionValue,
    conditionId,
    kwargsEdited,
    seededKwargsValue,
    kwargsRows,
  ]);

  const conditionTestFailed = mode === 'inline' && conditionError !== null;

  useEffect(() => {
    onChange(fields);
  }, [fields, onChange]);

  useEffect(() => {
    onConditionTestFailedChange(conditionTestFailed);
  }, [conditionTestFailed, onConditionTestFailedChange]);

  const templateOptions = (templatesQuery.data ?? []).map((id) => ({ value: id, label: id }));

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
            // Authoring rows again supersedes a pending explicit clear.
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
        {/* The group's name comes from `RadioGroup`'s own `label`, which renders the
            heading AND wires `aria-labelledby`. A bare `<span>` beside it left the
            `role="radiogroup"` with an empty accessible name. */}
        <RadioGroup
          label="Condition"
          value={mode}
          disabled={disabled}
          options={[
            { value: 'inline', label: 'Inline jq expression' },
            { value: 'template', label: 'Named template' },
          ]}
          onValueChange={(next) => {
            setMode(next as ConditionMode);
            // Switching modes re-engages authoring, superseding a pending clear.
            setConditionCleared(false);
          }}
        />
      </div>

      {mode === 'inline' ? (
        <div>
          <label style={fieldLabelStyle} htmlFor={`${idPrefix}-condition`}>
            jq condition
          </label>
          <Textarea
            id={`${idPrefix}-condition`}
            aria-label="jq condition"
            value={condition}
            spellCheck={false}
            disabled={disabled}
            onChange={(event) => {
              setCondition(event.target.value);
              // Editing invalidates the last Test result, clearing the non-blocking
              // Save warning until the condition is re-tested.
              setConditionError(null);
              setValidateOutcome(null);
              // Authoring a condition again supersedes a pending explicit clear.
              setConditionCleared(false);
            }}
          />
          <div style={{ marginTop: 'var(--tai-space-1)' }}>
            <span style={{ fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-text-muted)' }}>
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
          <div style={{ marginTop: 'var(--tai-space-3)' }}>
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
                  color: 'var(--tai-color-danger)',
                }}
              >
                {sampleError}
              </p>
            ) : null}
          </div>
          <div style={{ marginTop: 'var(--tai-space-2)' }}>
            <Button
              type="button"
              disabled={disabled || condition.trim().length === 0 || validate.isPending}
              onClick={runTest}
            >
              {validate.isPending ? <Spinner label="Testing" /> : null}
              Test condition
            </Button>
          </div>
          {conditionError !== null ? (
            <div style={{ marginTop: 'var(--tai-space-2)' }}>
              <ErrorState message={conditionError} />
            </div>
          ) : null}
          {validateOutcome !== null ? (
            <div role="status" style={{ marginTop: 'var(--tai-space-2)' }}>
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
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
          <div>
            <span style={fieldLabelStyle}>Template</span>
            {templatesQuery.isError ? (
              <ErrorState
                message={errorMessage(templatesQuery.error)}
                onRetry={() => void templatesQuery.refetch()}
              />
            ) : (
              <Select
                aria-label="Condition template"
                options={templateOptions}
                value={conditionId}
                placeholder={templatesQuery.isPending ? 'Loading templates…' : 'Select a template'}
                disabled={disabled || templatesQuery.isPending}
                onValueChange={(next) => {
                  setConditionId(next);
                  // Choosing a template again supersedes a pending explicit clear.
                  setConditionCleared(false);
                }}
              />
            )}
          </div>
          <KeyValueEditor
            label="Condition kwargs"
            rows={kwargsRows}
            disabled={disabled}
            onChange={(rows) => {
              setKwargsRows(rows);
              setKwargsEdited(true);
              setConditionCleared(false);
            }}
          />
        </div>
      )}

      {seededCondition && !conditionCleared ? (
        <InlineConfirm
          triggerLabel="Remove condition"
          prompt="Remove the saved condition?"
          confirmLabel="Yes, remove condition"
          cancelLabel="Keep condition"
          disabled={disabled}
          onConfirm={() => {
            // Remove the condition as a unit: latch the explicit clear and reset
            // every condition input (mode back to inline) so the UI shows nothing
            // configured and no stale Test state lingers.
            setConditionCleared(true);
            setCondition('');
            setConditionId('');
            setKwargsRows([]);
            setMode('inline');
            setConditionError(null);
            setValidateOutcome(null);
            setSampleError(null);
          }}
        />
      ) : null}
    </div>
  );
}
