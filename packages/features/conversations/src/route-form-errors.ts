/**
 * The route form's in-form errors: the document's own constraints, each shown with its
 * field's display text, then the blank checks of the required text fields and the
 * overlap policy's cross-field rule. The form shows them inline and submits only when
 * none remain, so a value the server refuses is refused in-form first.
 */
import { type JsonSchema, type SchemaFormErrors, validateAgainstSchema } from '@tai42/studio-sdk';

import { REPLY_TEXT_MEMBERS, replyTextPath } from './route-reply-texts';
import { isBlank, type RouteFormValue } from './route-schema';

/**
 * The display text a field shows when its value breaks the document's constraint, in
 * place of the SDK validator's generic message ("must match the required pattern").
 */
const FIELD_TEXT: Readonly<Record<string, string>> = {
  route_name: 'Use lowercase letters, digits and hyphens.',
  'delivery.callback_url': 'Must be an absolute https URL with no user name or password.',
  'delivery.channel': 'Use a ":"-free channel name.',
  'delivery.our_identity': 'An identity is required.',
  ...Object.fromEntries(
    REPLY_TEXT_MEMBERS.map(({ name }) => [
      replyTextPath(name),
      'Enter the reply text (up to 2,000 characters).',
    ]),
  ),
};

/** The optional text fields, where a blank value is no value (a poll-only route, a built-in reply). */
const OPTIONAL_TEXT_FIELDS: readonly string[] = [
  'delivery.callback_url',
  ...REPLY_TEXT_MEMBERS.map(({ name }) => replyTextPath(name)),
];

/** The form value at a dotted field path. */
function valueAt(value: RouteFormValue, path: string): unknown {
  let node: unknown = value;
  for (const key of path.split('.')) {
    node =
      typeof node === 'object' && node !== null
        ? (node as Record<string, unknown>)[key]
        : undefined;
  }
  return node;
}

/**
 * The SDK validator's errors over the document-derived schema, each shown with its field's
 * display text; an optional text field left blank carries no error.
 */
function constraintErrors(schema: JsonSchema, value: RouteFormValue): SchemaFormErrors {
  const errors: Record<string, string> = {};
  for (const [path, message] of Object.entries(validateAgainstSchema(schema, value))) {
    const fieldValue = valueAt(value, path);
    if (
      OPTIONAL_TEXT_FIELDS.includes(path) &&
      (typeof fieldValue !== 'string' || isBlank(fieldValue))
    ) {
      continue;
    }
    errors[path] = FIELD_TEXT[path] ?? message;
  }
  return errors;
}

/**
 * Every in-form error of a route value: the document's constraints, then the blank checks
 * of the required text fields and the overlap cross-field rule.
 */
export function routeFormErrors(
  schema: JsonSchema,
  value: RouteFormValue,
  editing: boolean,
): SchemaFormErrors {
  return { ...constraintErrors(schema, value), ...requiredFieldErrors(value, editing) };
}

/** The create-only route-name blank check (edit pins it read-only). */
function routeNameError(value: RouteFormValue, editing: boolean): Record<string, string> {
  if (editing) return {};
  return isBlank(value.route_name) ? { route_name: 'A route name is required.' } : {};
}

/** The target-name blank check, scoped to the selected target variant. */
function targetNameError(target: NonNullable<RouteFormValue['target']>): Record<string, string> {
  if (target.target_kind === undefined || !isBlank(target.target_name)) return {};
  return {
    'target.target_name':
      target.target_kind === 'tool' ? 'A tool name is required.' : 'An agent name is required.',
  };
}

/** The execution-key blank check. */
function executionKeyError(value: RouteFormValue): Record<string, string> {
  return isBlank(value.execution_key) ? { execution_key: 'An execution key is required.' } : {};
}

/** The channel-door blank checks: a channel and an identity are required. */
function deliveryErrors(delivery: NonNullable<RouteFormValue['delivery']>): Record<string, string> {
  if (delivery.door !== 'channel') return {};
  const errors: Record<string, string> = {};
  if (isBlank(delivery.channel)) errors['delivery.channel'] = 'A channel is required.';
  if (isBlank(delivery.our_identity)) errors['delivery.our_identity'] = 'An identity is required.';
  return errors;
}

/**
 * The overlap cross-field rule, mirroring the contract's `OverlapPolicy` validator:
 * a positive settle window is only meaningful with `deliver: all` or `running:
 * cancel`; with `continue` + `one` it would delay every turn for nothing and the
 * server refuses it. Keyed under the settle field so the message shows inline there.
 * The 0..30 integer bounds stay the schema's (and the server's) authority.
 */
function overlapError(overlap: NonNullable<RouteFormValue['overlap']>): Record<string, string> {
  const settle = overlap.settle_seconds;
  if (settle === undefined || settle <= 0) return {};
  if (overlap.deliver === 'all' || overlap.running === 'cancel') return {};
  return {
    'overlap.settle_seconds':
      'A settle window needs Deliver set to all or Running turn set to cancel.',
  };
}

/**
 * Blank checks for the required text fields, as path-keyed errors `SchemaForm` displays
 * inline — the house style (see the hooks `RegisterHookForm`). The SDK's
 * `validateAgainstSchema` catches a MISSING required field, but a required string kept as
 * `""` reads as "present" there; these fill that gap so a blank field is caught in-form,
 * not only by the server's 400. Scoped to the active variant (an unselected variant is the
 * schema's own required-union error, not a field error here).
 */
export function requiredFieldErrors(value: RouteFormValue, editing: boolean): SchemaFormErrors {
  return {
    ...routeNameError(value, editing),
    ...targetNameError(value.target ?? {}),
    ...executionKeyError(value),
    ...deliveryErrors(value.delivery ?? {}),
    ...overlapError(value.overlap ?? {}),
  };
}
