/**
 * Create / edit a conversation route. `POST /api/conversations/{route_name}` is an
 * UPSERT, so this one dialog is both paths: with no `initial` it is the blank
 * create form; with an `initial` route it starts prefilled and saves back over it
 * (its `route_name` shown read-only, because the name IS the route's identity and
 * URL key).
 *
 * The body is authored through the SDK's `SchemaForm` over a client-authored schema
 * (see `route-schema`): two discriminated unions mirror the contract's cross-field
 * rules, so an `agent` target never shows the tool-only jq fields and each door only
 * shows its own delivery fields — the platform's structural 400s are unreachable by
 * construction. Value-content 400s stay server-enforced and surface via `ErrorState`.
 * The `payload_expr`/`reply_expr` fields carry `x-tai42-expression`; the host's
 * ambient `ExpressionFieldContext` renders the visual jq editor in their place.
 *
 * SHOWN ONCE: an `api`-door write mints a fresh `callback_secret` (every save
 * rotates it — the door is an upsert), returned in the reply exactly once and never
 * re-readable from any door. On such a success the dialog becomes a one-time reveal
 * of that secret in a `CopyField` under a loud caption, rather than closing; a
 * `channel` write carries no secret and closes straight away. Submit/error house
 * style follows the hooks `RegisterHookForm`.
 */
import { useMemo, useState, type ReactNode, type SyntheticEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  CopyField,
  Dialog,
  ErrorState,
  SchemaForm,
  Spinner,
  errorMessage,
  useApi,
  validateAgainstSchema,
  type SchemaFormErrors,
} from '@tai42/studio-sdk';
import type { ConversationRoute } from '@tai42/api-client';

import { conversationRoutesKey } from './keys';
import {
  blankRouteValue,
  formValueToBody,
  requiredFieldErrors,
  routeFormSchema,
  routeToFormValue,
  type RouteFormValue,
} from './route-schema';

export interface RouteFormDialogProps {
  /** A route to edit; absent renders the blank create form. */
  readonly initial?: ConversationRoute;
  /** Called on Cancel, any close gesture, and after a successful save is acknowledged. */
  readonly onClose: () => void;
}

export function RouteFormDialog({ initial, onClose }: RouteFormDialogProps): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const editing = initial !== undefined;

  const schema = useMemo(() => routeFormSchema(initial?.route_name), [initial?.route_name]);
  const [value, setValue] = useState<RouteFormValue>(() =>
    initial === undefined ? blankRouteValue() : routeToFormValue(initial),
  );
  const [errors, setErrors] = useState<SchemaFormErrors | undefined>(undefined);
  // The api-door secret, held only here after a successful write (shown once).
  const [secret, setSecret] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.createOrReplaceConversationRoute(formValueToBody(value)),
    onSuccess: (written) => {
      void queryClient.invalidateQueries({ queryKey: conversationRoutesKey });
      if (written.callback_secret !== null) {
        // An api-door route: reveal the freshly-minted secret once, then close on Done.
        setSecret(written.callback_secret);
        return;
      }
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

  const title =
    secret !== null ? 'Route saved' : editing ? `Edit route ${initial.route_name}` : 'Create route';

  return (
    <Dialog
      title={title}
      open
      // During the shown-once callback-secret reveal the secret cannot be
      // re-read, so light dismissal is disabled there — only the explicit Done
      // button closes it. The form phase stays an ordinary dismissable modal.
      dismissable={secret === null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {secret !== null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
          <CopyField
            value={secret}
            label="Callback secret"
            caption="Shown once — store it now. The API door signs its delivery callbacks with this secret; saving the route again mints a new one."
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="button" variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form
          aria-label={editing ? 'Edit route' : 'Create route'}
          onSubmit={onSubmit}
          className="tai-stack"
        >
          <SchemaForm
            schema={schema}
            value={value}
            onChange={(next) => {
              setValue(next as RouteFormValue);
            }}
            errors={errors}
            idPrefix="route-form"
          />
          {mutation.isError ? <ErrorState message={errorMessage(mutation.error)} /> : null}
          <div className="tai-dialog-actions">
            <Button type="button" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={mutation.isPending}>
              {mutation.isPending ? <Spinner label={editing ? 'Saving' : 'Creating'} /> : null}
              {editing ? 'Save changes' : 'Create route'}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
