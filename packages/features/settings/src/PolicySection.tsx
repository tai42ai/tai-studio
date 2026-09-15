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
 *    render kwargs, exactly one source. The INLINE editor ({@link ConditionInlineEditor})
 *    carries the jq chrome the policy condition needs and reports a failed Test as a
 *    NON-BLOCKING Save warning (via `onConditionTestFailedChange`).
 *
 * Emptying an input is NEVER a delete: the edit PUT is PATCH-style, so an absent
 * field preserves its stored value. An UNTOUCHED condition is OMITTED; to actually
 * remove a saved value, the EDIT dialog surfaces two explicit affordances, each
 * behind a small inline confirm — "Remove condition" (`condition: null`) and
 * "Clear policy data" (`policy_data: null`). Both appear ONLY when the seed carries
 * a value to remove (never in CREATE mode).
 *
 * Every server-supplied string renders as ESCAPED text through the design-system
 * components — never an HTML sink.
 */
import type { TemplatedText } from '@tai42/api-client';
import { templatedTextCatalog, TemplatedTextField, useApi } from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react';

import { ConditionInlineEditor } from './ConditionInlineEditor';
import { InlineConfirm } from './InlineConfirm';
import { templateNamesKey } from './keys';
import { KeyValueEditor } from './KeyValueEditor';
import {
  computePolicyFields,
  isPlainObject,
  objectToRows,
  type PolicyFields,
  type PolicyRow,
  type PolicySeed,
} from './policy-data';

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
  paddingTop: 'var(--tai-space-3)',
  marginTop: 'var(--tai-space-2)',
  borderTop: '1px solid var(--tai-color-border)',
};

const headingStyle: CSSProperties = {
  fontSize: 'var(--tai-text-md)',
  fontWeight: 600,
  color: 'var(--tai-color-text)',
  display: 'block',
  marginBottom: 'var(--tai-space-1)',
};

/** The authored condition field: the templated-text control (inline jq or stored
 * template) plus the edit-mode "Remove condition" affordance. */
function PolicyConditionField({
  idPrefix,
  condition,
  disabled,
  resetToken,
  templates,
  showRemove,
  onChange,
  onTestFailedChange,
  onRemove,
}: {
  readonly idPrefix: string;
  readonly condition: TemplatedText | null;
  readonly disabled: boolean;
  readonly resetToken: number;
  readonly templates: ReturnType<typeof templatedTextCatalog>;
  readonly showRemove: boolean;
  readonly onChange: (next: TemplatedText | null) => void;
  readonly onTestFailedChange: (failed: boolean) => void;
  readonly onRemove: () => void;
}): ReactNode {
  return (
    <>
      <div>
        <TemplatedTextField
          key={`condition-${String(resetToken)}`}
          label="Condition"
          value={condition}
          disabled={disabled}
          templates={templates.templates}
          templatesLoading={templates.loading}
          templatesError={templates.error}
          onTemplatesRetry={templates.onRetry}
          storageAbsent={templates.storageAbsent}
          storagePresenceLoading={templates.storagePresenceLoading}
          onChange={onChange}
          renderInline={({ label, value, onChange: onInline, hideLabel }) => (
            <ConditionInlineEditor
              idPrefix={idPrefix}
              label={label}
              value={value}
              hideLabel={hideLabel}
              disabled={disabled}
              onChange={onInline}
              onTestFailedChange={onTestFailedChange}
            />
          )}
        />
      </div>

      {showRemove ? (
        <InlineConfirm
          triggerLabel="Remove condition"
          prompt="Remove the saved condition?"
          confirmLabel="Yes, remove condition"
          cancelLabel="Keep condition"
          disabled={disabled}
          onConfirm={onRemove}
        />
      ) : null}
    </>
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

  const [policyRows, setPolicyRows] = useState<PolicyRow[]>(() => objectToRows(seed?.policy_data));
  const [condition, setCondition] = useState<TemplatedText | null>(() => seed?.condition ?? null);
  // Explicit-clear latches: set by the edit-mode affordances so the section emits
  // an explicit `null` (a delete) instead of merely omitting an emptied field. Any
  // fresh authoring of that side un-latches it so the new value is emitted instead.
  const [conditionCleared, setConditionCleared] = useState(false);
  const [policyDataCleared, setPolicyDataCleared] = useState(false);
  // Bumped by "Remove condition" to remount the seeded-once control on a fresh value.
  const [conditionResetToken, setConditionResetToken] = useState(0);
  // Whether the user has actually authored these editors this session. An UNTOUCHED
  // field re-emits the stored value BYTE-FOR-BYTE, so re-serializing it is avoided.
  const [policyDataEdited, setPolicyDataEdited] = useState(false);
  const [conditionEdited, setConditionEdited] = useState(false);
  const [conditionTestFailed, setConditionTestFailed] = useState(false);
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
  const storageQuery = useQuery({
    queryKey: ['storage', 'info'],
    queryFn: ({ signal }) => api.getStorageInfo(signal),
  });
  const templatesQuery = useQuery({
    queryKey: templateNamesKey,
    queryFn: ({ signal }) => api.listTemplates(signal),
    enabled: storageQuery.data?.present === true,
  });

  const fields = useMemo<PolicyFields>(
    () =>
      computePolicyFields({
        policyDataCleared,
        policyDataEdited,
        seededPolicyDataValue,
        policyRows,
        conditionCleared,
        conditionEdited,
        condition,
      }),
    [
      policyDataCleared,
      policyDataEdited,
      seededPolicyDataValue,
      policyRows,
      conditionCleared,
      conditionEdited,
      condition,
    ],
  );

  useEffect(() => {
    onChange(fields);
  }, [fields, onChange]);

  useEffect(() => {
    onConditionTestFailedChange(conditionTestFailed);
  }, [conditionTestFailed, onConditionTestFailedChange]);

  const templatedTextTemplates = templatedTextCatalog(storageQuery, templatesQuery);

  return (
    <div style={sectionStyle}>
      <span style={headingStyle}>Policy</span>

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

      <PolicyConditionField
        idPrefix={idPrefix}
        condition={condition}
        disabled={disabled}
        resetToken={conditionResetToken}
        templates={templatedTextTemplates}
        showRemove={seededCondition && !conditionCleared}
        onChange={(next) => {
          setCondition(next);
          setConditionEdited(true);
          setConditionCleared(false);
          // Editing/switching source invalidates the last Test's Save warning.
          setConditionTestFailed(false);
        }}
        onTestFailedChange={setConditionTestFailed}
        onRemove={() => {
          setConditionCleared(true);
          setCondition(null);
          setConditionEdited(false);
          setConditionTestFailed(false);
          setConditionResetToken((token) => token + 1);
        }}
      />
    </div>
  );
}
