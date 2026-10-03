/**
 * The invoke flow for one declared member action: an input form (when the action
 * declares input), an optional destructive confirm, the invoke itself, and the
 * read-only result.
 *
 * The input form is the platform's own `SchemaForm` over the action's `input_schema`,
 * validated with `validateAgainstSchema` before submit — its correct, input-only use.
 * A `destructive` action takes a confirm step before it runs. On success the result is
 * shown through {@link ActionResult} (read-only, schema-driven); because a result may
 * carry a one-time secret, the result view is undismissable — only Done closes it — so
 * an accidental dismiss cannot lose a value the server will not reproduce.
 *
 * Everything is driven by the opaque descriptor: the title is the provider's rendered
 * label, the form and result come from the declared schemas, and the invoke echoes the
 * opaque `key` and row `handle`. No provider name, route, or field appears here.
 */
import type { MemberActionDescriptor } from '@tai42/api-client';
import {
  Button,
  defaultValueForSchema,
  Dialog,
  errorMessage,
  ErrorState,
  type JsonSchema,
  SchemaForm,
  type SchemaFormErrors,
  Spinner,
  useApi,
  validateAgainstSchema,
} from '@tai42/studio-sdk';
import { useMutation } from '@tanstack/react-query';
import { type CSSProperties, type ReactNode, useState } from 'react';

import { ActionResult } from './ActionResult';
import { schemaHasFields } from './member-actions';

const promptStyle: CSSProperties = {
  margin: 0,
  color: 'var(--tai-color-text-muted)',
};

const destructiveStyle: CSSProperties = {
  margin: 0,
  color: 'var(--tai-color-err-text)',
};

/** Coerce the form value to the record the invoke body expects (a no-input action is `{}`). */
function asInput(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function ActionDialog({
  descriptor,
  targetHandle,
  onClose,
  onCompleted,
}: {
  readonly descriptor: MemberActionDescriptor;
  /** The row's opaque handle, or `null` for a page-scoped action. */
  readonly targetHandle: string | null;
  readonly onClose: () => void;
  /** Called once the invoke succeeds, for the caller to refresh the directory. */
  readonly onCompleted: () => void;
}): ReactNode {
  const api = useApi();
  const inputSchema = descriptor.input_schema as JsonSchema;
  const resultSchema = descriptor.result_schema as JsonSchema;
  const hasInput = schemaHasFields(inputSchema);

  const [value, setValue] = useState<unknown>(() => defaultValueForSchema(inputSchema));
  const [errors, setErrors] = useState<SchemaFormErrors>({});
  const [confirming, setConfirming] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      api.invokeMemberAction({
        action_key: descriptor.key,
        target_handle: targetHandle,
        input: asInput(value),
      }),
    onSuccess: onCompleted,
  });

  const result = mutation.data?.result;

  // The one-time-reveal result phase: undismissable so a stray click cannot lose a
  // minted secret, Done is the only way out.
  if (result !== undefined) {
    return (
      <Dialog
        title={descriptor.label}
        open
        dismissable={false}
        onOpenChange={(next) => {
          if (!next) onClose();
        }}
      >
        <ActionResult schema={resultSchema} value={result} />
        <div className="tai-dialog-actions">
          <Button type="button" variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </Dialog>
    );
  }

  const submit = (): void => {
    if (hasInput) {
      const found = validateAgainstSchema(inputSchema, value);
      setErrors(found);
      if (Object.keys(found).length > 0) return;
    }
    if (descriptor.destructive && !confirming) {
      setConfirming(true);
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog
      title={descriptor.label}
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {hasInput ? (
        <SchemaForm
          schema={inputSchema}
          value={value}
          onChange={setValue}
          errors={errors}
          idPrefix={`member-action-${descriptor.key}`}
        />
      ) : null}
      {confirming ? (
        <p role="alert" style={destructiveStyle} data-testid="member-action-confirm">
          This is a destructive action. Confirm to proceed.
        </p>
      ) : !hasInput ? (
        <p style={promptStyle}>Run this action now?</p>
      ) : null}
      {mutation.isError ? <ErrorState message={errorMessage(mutation.error)} /> : null}
      <div className="tai-dialog-actions">
        <Button type="button" disabled={mutation.isPending} onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          variant={descriptor.destructive ? 'danger' : 'primary'}
          disabled={mutation.isPending}
          onClick={submit}
        >
          {mutation.isPending ? <Spinner label="Working" /> : null}
          {confirming ? 'Confirm' : descriptor.label}
        </Button>
      </div>
    </Dialog>
  );
}
