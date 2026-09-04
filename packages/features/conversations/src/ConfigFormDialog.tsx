/**
 * Create / edit a per-target conversation config. `PUT
 * /api/conversation-configs/{target_kind}/{target_name}` is an UPSERT, so this one
 * dialog is both paths: with no `initial` it is the blank create form; with an
 * `initial` config it starts prefilled and saves back over it (its
 * `(target_kind, target_name)` key shown read-only, because the key IS the config's
 * identity).
 *
 * The body is authored through the SDK's `SchemaForm` over a client-authored schema
 * (see `config-schema`). Submit/error house style follows the route form.
 */
import { useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  ErrorState,
  SchemaForm,
  Spinner,
  errorMessage,
  useApi,
  validateAgainstSchema,
  type SchemaFormErrors,
} from '@tai42/studio-sdk';
import type { TargetConversationConfig } from '@tai42/api-client';

import {
  blankConfigValue,
  configFormSchema,
  configToFormValue,
  formValueToBody,
  requiredFieldErrors,
  type ConfigFormValue,
} from './config-schema';
import { conversationConfigsKey } from './keys';

export interface ConfigFormDialogProps {
  /** A config to edit; absent renders the blank create form. */
  readonly initial?: TargetConversationConfig;
  /** Called on Cancel, any close gesture, and after a successful save. */
  readonly onClose: () => void;
}

export function ConfigFormDialog({ initial, onClose }: ConfigFormDialogProps): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const editing = initial !== undefined;

  // Depend on the key primitives, not the `initial` object identity: the schema
  // pins those two fields read-only on the edit path and is otherwise constant.
  const initialKind = initial?.target_kind;
  const initialName = initial?.target_name;
  const schema = useMemo(
    () =>
      configFormSchema(
        initialKind !== undefined && initialName !== undefined
          ? { target_kind: initialKind, target_name: initialName }
          : undefined,
      ),
    [initialKind, initialName],
  );
  const [value, setValue] = useState<ConfigFormValue>(() =>
    initial === undefined ? blankConfigValue() : configToFormValue(initial),
  );
  const [errors, setErrors] = useState<SchemaFormErrors | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: () => api.setConversationConfig(formValueToBody(value)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conversationConfigsKey });
      onClose();
    },
  });

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    const found: SchemaFormErrors = {
      ...validateAgainstSchema(schema, value),
      ...requiredFieldErrors(value, editing),
    };
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    mutation.mutate();
  };

  const title = editing
    ? `Edit config ${initial.target_kind}: ${initial.target_name}`
    : 'Create config';

  return (
    <Dialog
      title={title}
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <form
        aria-label={editing ? 'Edit config' : 'Create config'}
        onSubmit={onSubmit}
        className="tai-stack"
      >
        <SchemaForm
          schema={schema}
          value={value}
          onChange={(next) => {
            setValue(next as ConfigFormValue);
          }}
          errors={errors}
          idPrefix="config-form"
        />
        {mutation.isError ? <ErrorState message={errorMessage(mutation.error)} /> : null}
        <div className="tai-dialog-actions">
          <Button type="button" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={mutation.isPending}>
            {mutation.isPending ? <Spinner label={editing ? 'Saving' : 'Creating'} /> : null}
            {editing ? 'Save changes' : 'Create config'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
