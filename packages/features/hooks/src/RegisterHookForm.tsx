/**
 * Register / edit form: builds a {@link HookParams} and posts it to
 * `api.registerHook` (the documented upsert edit path). `name`, `topic`, `tool`
 * and the execution key are required. The fire door is topic-level (server-derived,
 * shown in the list), not a register input. Optional `condition`/`expr` text fields
 * default to `null` when left blank. The `tool_kwargs` textarea is parsed with
 * `JSON.parse` — a parse failure (or a non-object result) is a LOUD inline field
 * error that blocks submit, so no API call fires on bad input.
 *
 * Two modes on one form. With no `initial` it is the blank create form. With an
 * `initial` hook (the per-row Edit door) it starts prefilled from that hook and
 * saves back over it — its id-based gate fields (`condition_id` / `expr_id` and
 * their `*_kwargs`) are carried through untouched, so editing the inline fields
 * never silently wipes an id gate. In edit mode the form is chrome-free (its host
 * `Dialog` supplies the surface and title) and closes via `onClose` on success.
 *
 * A register POST is an upsert: an existing name silently replaces that hook. The
 * form watches the full hooks list and shows an inline replace notice the moment
 * the typed name hits another hook (never the one being edited). A failed request —
 * including the backend's name/topic charset 400, whose message names the offending
 * field — surfaces loudly and inline in an `ErrorState`.
 */
import { useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  ErrorState,
  Field,
  JqField,
  Spinner,
  Textarea,
  TextInput,
  errorMessage,
  useApi,
  type JqFieldDeclaration,
} from '@tai42/studio-sdk';
import type { HookParams } from '@tai42/api-client';

import { HOOKS_KEY_ROOT, hooksListKey } from './keys';
import { ExecutionKeyPicker, useExecutionKeys } from './ExecutionKeyPicker';
import { fireGateUnsatisfiable } from './fire-path-gate';

/**
 * The `condition` and `expr` inline specs are jq (the same jq gate/shape family the
 * access-control policy authors): `condition` gates whether the hook fires, `expr`
 * shapes the event before the tool runs. Both evaluate against the event that fired
 * the hook, whose shape is defined by the topic — so the declaration carries an
 * OPEN document descriptor (no fixed keys) rather than inventing an envelope the
 * server does not promise. There is no author-time validate endpoint for a hook
 * spec (unlike the policy condition's `validate-condition` guard), so neither
 * declaration wires `serverValidate`. Each field is a `JqField`: a resting input
 * with an always-present visual-editor door, both painted in the SDK design system
 * the host injects into jq-studio once at the root.
 */
const HOOK_CONDITION_DECLARATION: JqFieldDeclaration = {
  language: 'jq',
  shape: {
    id: 'tai42.hooks.condition',
    label: 'event',
    blurb:
      'The event that fired the hook. Its shape is defined by the topic, so treat it as an open document.',
    keys: [],
    returns: 'true or false — the hook fires only when the condition returns true',
  },
};

const HOOK_EXPR_DECLARATION: JqFieldDeclaration = {
  language: 'jq',
  shape: {
    id: 'tai42.hooks.expr',
    label: 'event',
    blurb:
      'The event that fired the hook. Its shape is defined by the topic, so treat it as an open document.',
    keys: [],
    returns: 'the value the hook shapes from the event before the tool runs',
  },
};

/** Parse the `tool_kwargs` textarea; blank means `{}`. Throws a loud message on bad input. */
function parseToolKwargs(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (trimmed === '') return {};
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Invalid JSON: ${errorMessage(error)}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid JSON: tool_kwargs must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

/** Serialize a hook's `tool_kwargs` back into the textarea; an empty map prefills blank. */
function serializeToolKwargs(kwargs: Record<string, unknown>): string {
  return Object.keys(kwargs).length === 0 ? '' : JSON.stringify(kwargs, null, 2);
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

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
  const api = useApi();
  const queryClient = useQueryClient();

  const editing = initial !== undefined;

  const [name, setName] = useState(initial?.name ?? '');
  const [topic, setTopic] = useState(initial?.topic ?? '');
  const [tool, setTool] = useState(initial?.tool ?? '');
  const [toolKwargs, setToolKwargs] = useState(() =>
    initial === undefined ? '' : serializeToolKwargs(initial.tool_kwargs),
  );
  const [condition, setCondition] = useState(initial?.condition ?? '');
  const [expr, setExpr] = useState(initial?.expr ?? '');
  const [executionKey, setExecutionKey] = useState(initial?.execution_key ?? '');

  const [submitted, setSubmitted] = useState(false);
  const [kwargsError, setKwargsError] = useState<string | null>(null);

  const keysQuery = useExecutionKeys();

  // The full (unfiltered) hooks list, feeding overwrite detection. Shares the list
  // root so a register's invalidation refetches it; a filtered list elsewhere on
  // the page keeps its own key, so the notice sees EVERY existing name.
  const hooksQuery = useQuery({
    queryKey: hooksListKey(''),
    queryFn: ({ signal }) => api.listHooks(undefined, signal),
  });

  const mutation = useMutation({
    mutationFn: (params: HookParams) => api.registerHook(params),
    onSuccess: () => {
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === HOOKS_KEY_ROOT });
      if (onClose !== undefined) {
        onClose();
        return;
      }
      setName('');
      setTopic('');
      setTool('');
      setToolKwargs('');
      setCondition('');
      setExpr('');
      setExecutionKey('');
      setSubmitted(false);
      setKwargsError(null);
    },
  });

  const trimmedName = name.trim();
  const nameMissing = trimmedName === '';
  const topicMissing = topic.trim() === '';
  const toolMissing = tool.trim() === '';
  const executionKeyMissing = executionKey === '';
  const unsatisfiable = fireGateUnsatisfiable(keysQuery);

  const existingNames = useMemo(
    () => new Set((hooksQuery.data?.items ?? []).map((h) => h.name)),
    [hooksQuery.data],
  );
  // A register POST is an upsert: an existing name silently replaces that hook.
  // Warn when the typed name hits another hook — never the one being edited, whose
  // own name saving back over is the whole point of the edit.
  const replacesExisting =
    trimmedName !== '' && trimmedName !== initial?.name && existingNames.has(trimmedName);

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    setSubmitted(true);
    setKwargsError(null);
    if (nameMissing || topicMissing || toolMissing || executionKeyMissing || unsatisfiable) {
      return;
    }

    let toolKwargsValue: Record<string, unknown>;
    try {
      toolKwargsValue = parseToolKwargs(toolKwargs);
    } catch (error) {
      setKwargsError(errorMessage(error));
      return;
    }

    // The inline condition/expr text fields are the only gates this form edits; an
    // id-based gate (`condition_id` / `expr_id`) and its kwargs ride through from
    // the edited hook untouched, so a save never wipes a gate the form never showed.
    const params: HookParams = {
      name: trimmedName,
      topic: topic.trim(),
      tool: tool.trim(),
      execution_key: executionKey,
      tool_kwargs: toolKwargsValue,
      condition: orNull(condition),
      condition_id: initial?.condition_id ?? null,
      condition_kwargs: initial?.condition_kwargs ?? {},
      expr: orNull(expr),
      expr_id: initial?.expr_id ?? null,
      expr_kwargs: initial?.expr_kwargs ?? {},
    };
    mutation.mutate(params);
  };

  const form = (
    <form
      aria-label={editing ? 'Edit hook' : 'Register hook'}
      onSubmit={onSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}
    >
      {hooksQuery.isError ? (
        <p role="alert" style={{ margin: 0, color: 'var(--tai-color-warning)' }}>
          Could not load existing hooks: {errorMessage(hooksQuery.error)}. Overwrite detection is
          unavailable; a register still replaces any existing hook with the same name.
        </p>
      ) : null}
      <Field label="Name" error={submitted && nameMissing ? 'A name is required.' : undefined}>
        <TextInput
          value={name}
          placeholder="e.g. notify-on-event"
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
      </Field>
      {replacesExisting ? (
        <p role="status" style={{ margin: 0, color: 'var(--tai-color-warning)' }}>
          Replaces the existing hook <strong>{trimmedName}</strong> — its current registration is
          overwritten.
        </p>
      ) : null}
      <Field label="Topic" error={submitted && topicMissing ? 'A topic is required.' : undefined}>
        <TextInput
          value={topic}
          placeholder="e.g. events.created"
          onChange={(event) => {
            setTopic(event.target.value);
          }}
        />
      </Field>
      <Field label="Tool" error={submitted && toolMissing ? 'A tool is required.' : undefined}>
        <TextInput
          value={tool}
          placeholder="e.g. slack.post_message"
          onChange={(event) => {
            setTool(event.target.value);
          }}
        />
      </Field>
      <ExecutionKeyPicker
        value={executionKey}
        onValueChange={setExecutionKey}
        error={submitted && executionKeyMissing ? 'An execution key is required.' : undefined}
      />
      <Field
        label="Tool kwargs (JSON)"
        description="A JSON object of keyword arguments passed to the tool. Blank means none."
        error={kwargsError ?? undefined}
      >
        <Textarea
          value={toolKwargs}
          rows={4}
          placeholder='{ "channel": "ops" }'
          onChange={(event) => {
            setToolKwargs(event.target.value);
          }}
        />
      </Field>
      <JqField
        label="Condition"
        description="Optional inline condition spec; blank leaves it unset."
        shape={HOOK_CONDITION_DECLARATION.shape}
        multiline={false}
        value={condition}
        onChange={setCondition}
      />
      <JqField
        label="Expr"
        description="Optional inline expression spec; blank leaves it unset."
        shape={HOOK_EXPR_DECLARATION.shape}
        multiline={false}
        value={expr}
        onChange={setExpr}
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
