/**
 * Register form: builds a {@link HookParams} and posts it to `api.registerHook`.
 * `name`, `topic`, `tool` and the execution key are required. The fire door is
 * topic-level (server-derived, shown in the list), not a register input. Optional
 * `condition`/`expr` text fields default to `null` when left blank. The
 * `tool_kwargs` textarea is parsed with `JSON.parse` — a parse failure (or a
 * non-object result) is a LOUD inline field error that blocks submit, so no API
 * call fires on bad input.
 *
 * On success the whole hooks list is invalidated so the new hook appears, and the
 * form resets. A failed request surfaces loudly in an inline `ErrorState`.
 */
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  ErrorState,
  Field,
  Spinner,
  Textarea,
  TextInput,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import type { HookParams } from '@tai42/api-client';

import { HOOKS_KEY_ROOT } from './keys';
import { ExecutionKeyPicker, useExecutionKeys } from './ExecutionKeyPicker';
import { fireGateUnsatisfiable } from './fire-path-gate';

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

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function RegisterHookForm(): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [tool, setTool] = useState('');
  const [toolKwargs, setToolKwargs] = useState('');
  const [condition, setCondition] = useState('');
  const [expr, setExpr] = useState('');
  const [executionKey, setExecutionKey] = useState('');

  const [submitted, setSubmitted] = useState(false);
  const [kwargsError, setKwargsError] = useState<string | null>(null);

  const keysQuery = useExecutionKeys();

  const mutation = useMutation({
    mutationFn: (params: HookParams) => api.registerHook(params),
    onSuccess: () => {
      setName('');
      setTopic('');
      setTool('');
      setToolKwargs('');
      setCondition('');
      setExpr('');
      setExecutionKey('');
      setSubmitted(false);
      setKwargsError(null);
      void queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === HOOKS_KEY_ROOT });
    },
  });

  const nameMissing = name.trim() === '';
  const topicMissing = topic.trim() === '';
  const toolMissing = tool.trim() === '';
  const executionKeyMissing = executionKey === '';
  const unsatisfiable = fireGateUnsatisfiable(keysQuery);

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

    const params: HookParams = {
      name: name.trim(),
      topic: topic.trim(),
      tool: tool.trim(),
      execution_key: executionKey,
      tool_kwargs: toolKwargsValue,
      condition: orNull(condition),
      condition_id: null,
      condition_kwargs: {},
      expr: orNull(expr),
      expr_id: null,
      expr_kwargs: {},
    };
    mutation.mutate(params);
  };

  return (
    <Card>
      <h2 style={{ margin: '0 0 var(--tai-space-4)', fontSize: 'var(--tai-text-lg)' }}>
        Register hook
      </h2>
      <form
        aria-label="Register hook"
        onSubmit={onSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}
      >
        <Field label="Name" error={submitted && nameMissing ? 'A name is required.' : undefined}>
          <TextInput
            value={name}
            placeholder="e.g. notify-on-order"
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </Field>
        <Field label="Topic" error={submitted && topicMissing ? 'A topic is required.' : undefined}>
          <TextInput
            value={topic}
            placeholder="e.g. orders.created"
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
        <Field
          label="Condition"
          description="Optional inline condition spec; blank leaves it unset."
        >
          <TextInput
            value={condition}
            onChange={(event) => {
              setCondition(event.target.value);
            }}
          />
        </Field>
        <Field label="Expr" description="Optional inline expression spec; blank leaves it unset.">
          <TextInput
            value={expr}
            onChange={(event) => {
              setExpr(event.target.value);
            }}
          />
        </Field>
        {mutation.isError ? <ErrorState message={errorMessage(mutation.error)} /> : null}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-3)' }}>
          <Button type="submit" variant="primary" disabled={mutation.isPending || unsatisfiable}>
            {mutation.isPending ? <Spinner label="Registering" /> : null}
            Register
          </Button>
        </div>
      </form>
    </Card>
  );
}
