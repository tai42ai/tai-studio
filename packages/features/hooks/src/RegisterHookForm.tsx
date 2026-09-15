/**
 * Register / edit form: builds a {@link HookParams} and posts it to
 * `api.registerHook` (the documented upsert edit path). `name`, `topic`, `tool`
 * and the execution key are required; optional `condition`/`expr`/subject default
 * to unset. The `tool_kwargs` textarea is parsed with `JSON.parse` — a parse
 * failure (or a non-object result) is a LOUD inline field error that blocks submit,
 * so no API call fires on bad input.
 *
 * Two modes on one form. With no `initial` it is the blank create form. With an
 * `initial` hook (the per-row Edit door) it starts prefilled and saves back over it;
 * in edit mode it is chrome-free (its host `Dialog` supplies the surface) and closes
 * via `onClose` on success. A register POST is an upsert: the form watches the full
 * hooks list and shows an inline replace notice the moment the typed name hits
 * another hook (never the one being edited). A failed request surfaces loudly and
 * inline in an `ErrorState`.
 */
import type { HookParams } from '@tai42/api-client';
import {
  Button,
  Card,
  errorMessage,
  ErrorState,
  Spinner,
  StateBindingSection,
} from '@tai42/studio-sdk';
import { type ReactNode, type SyntheticEvent } from 'react';

import { buildHookParams } from './buildHookParams';
import { fireGateUnsatisfiable } from './fire-path-gate';
import { HookConditionExprFields } from './HookConditionExprFields';
import { HookIdentityFields } from './HookIdentityFields';
import { HookSubjectSection } from './HookSubjectSection';
import { useHookFormData } from './useHookFormData';
import { useHookFormFields } from './useHookFormFields';
import { useRegisterHook } from './useRegisterHook';

export interface RegisterHookFormProps {
  /**
   * A hook to edit: the form starts prefilled from it and saves back over it.
   * Absent renders the blank create form.
   */
  readonly initial?: HookParams;
  /**
   * Called on a successful save AND on Cancel, so the host `Dialog` closes. Given
   * only in edit mode; a blank create form resets in place instead.
   */
  readonly onClose?: () => void;
}

export function RegisterHookForm({ initial, onClose }: RegisterHookFormProps = {}): ReactNode {
  const editing = initial !== undefined;
  const fields = useHookFormFields(initial);
  const data = useHookFormData({ tool: fields.tool, subjectOpen: fields.subjectOpen });
  const mutation = useRegisterHook({ onClose, onReset: fields.reset });

  const trimmedName = fields.name.trim();
  const missing = {
    name: trimmedName === '',
    topic: fields.topic.trim() === '',
    tool: fields.tool.trim() === '',
    executionKey: fields.executionKey === '',
  };
  const unsatisfiable = fireGateUnsatisfiable(data.keysQuery);
  // A register POST is an upsert: warn when the typed name hits ANOTHER hook — never
  // the one being edited, whose own name saving back over is the point of the edit.
  const replacesExisting =
    trimmedName !== '' && trimmedName !== initial?.name && data.existingNames.has(trimmedName);

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    fields.setSubmitted(true);
    fields.setKwargsError(null);
    fields.setSubjectError(null);
    if (missing.name || missing.topic || missing.tool || missing.executionKey || unsatisfiable) {
      return;
    }
    const result = buildHookParams({
      name: fields.name,
      topic: fields.topic,
      tool: fields.tool,
      executionKey: fields.executionKey,
      toolKwargs: fields.toolKwargs,
      subjectTarget: fields.subjectTarget,
      subjectKind: fields.subjectKind,
      subjectKeyExpr: fields.subjectKeyExpr,
      condition: fields.condition,
      expr: fields.expr,
      stateBinding: fields.stateBinding,
    });
    if (!result.ok) {
      if (result.field === 'kwargs') fields.setKwargsError(result.message);
      else fields.setSubjectError(result.message);
      return;
    }
    mutation.mutate(result.params);
  };

  const form = (
    <form
      aria-label={editing ? 'Edit hook' : 'Register hook'}
      onSubmit={onSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}
    >
      {data.hooksQuery.isError ? (
        <p role="alert" style={{ margin: 0, color: 'var(--tai-color-warning)' }}>
          Could not load existing hooks: {errorMessage(data.hooksQuery.error)}. Overwrite detection
          is unavailable; a register still replaces any existing hook with the same name.
        </p>
      ) : null}
      <HookIdentityFields
        fields={fields}
        missing={missing}
        replacesExisting={replacesExisting}
        trimmedName={trimmedName}
      />
      <HookSubjectSection fields={fields} targetOptions={data.targetOptions} />
      <HookConditionExprFields
        fields={fields}
        templatedTextTemplates={data.templatedTextTemplates}
      />
      <StateBindingSection
        value={fields.stateBinding}
        onChange={fields.setStateBinding}
        {...data.stateBinding}
      />
      {mutation.isError ? <ErrorState message={errorMessage(mutation.error)} /> : null}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-3)' }}>
        {editing ? (
          <Button type="button" onClick={() => onClose?.()} disabled={mutation.isPending}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" variant="primary" disabled={mutation.isPending || unsatisfiable}>
          {mutation.isPending ? <Spinner label={editing ? 'Saving' : 'Registering'} /> : null}
          {editing ? 'Save changes' : 'Register'}
        </Button>
      </div>
    </form>
  );

  // Edit mode renders chrome-free: the host `Dialog` supplies the panel and title.
  if (editing) return form;

  return (
    <Card>
      <h2 style={{ margin: '0 0 var(--tai-space-4)', fontSize: 'var(--tai-text-lg)' }}>
        Register hook
      </h2>
      {form}
    </Card>
  );
}
