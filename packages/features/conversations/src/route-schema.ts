/**
 * The CLIENT-AUTHORED JSON Schema that drives the conversation-route form through
 * the SDK's `SchemaForm`, plus the two mappers between the form's (nested) value
 * and the flat `ConversationRouteCreate` wire body.
 *
 * There is no server schema for this body: the create door takes flat parameters,
 * so the form authors its own schema here. It MIRRORS the contract's cross-field
 * validators (`tai42_contract.conversations.ConversationRouteCreate`) as a pair of
 * discriminated unions, so an invalid target-kind/door combination cannot be
 * authored: the platform's STRUCTURAL 400s (the target-kind and door exclusivity
 * rules) are unreachable by construction. Value-content 400s (a malformed callback
 * URL, a colon in a channel name) stay server-enforced and surface through
 * `ErrorState`; the value checks in `requiredFieldErrors` catch the common ones
 * in-form first.
 *   - `target` is discriminated on `target_kind`: an `agent` target carries no
 *     `payload_expr`/`reply_expr`; only a `tool` target shows those two jq fields.
 *   - `delivery` is discriminated on `door`: an `api` door carries a `callback_url`
 *     (and no channel identity); a `channel` door carries `channel` + `our_identity`
 *     (and no callback).
 *
 * The two jq fields carry `x-tai42-expression`, the SDK's opt-in expression seam:
 * with the host's ambient `ExpressionFieldContext` wired (it is, app-wide), the
 * field renders the visual jq editor; with none it degrades to a plain text box.
 * The feature builds NO seam of its own.
 */
import type { JsonSchema, SchemaFormErrors } from '@tai42/studio-sdk';
import type {
  ConversationMode,
  ConversationRoute,
  ConversationRouteCreate,
} from '@tai42/api-client';

/** The route-name slug the server enforces (`:`-free, so thread namespaces cannot collide). */
const ROUTE_NAME_RE = /^[a-z0-9-]+$/;

/** Whether a string parses as an absolute `https:` URL — the callback door the server accepts. */
function isAbsoluteHttpsUrl(candidate: string): boolean {
  try {
    return new URL(candidate).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * What `.` is for `payload_expr`: the inbound conversation turn. The program maps
 * it to the JSON object of keyword arguments the tool is dispatched with.
 */
const PAYLOAD_EXPR_ANNOTATION = {
  language: 'jq',
  label: 'inbound turn',
  blurb:
    'The inbound conversation turn. Map it to the JSON object of keyword arguments the tool is dispatched with.',
  keys: [
    { name: 'message', gloss: 'the inbound message text' },
    { name: 'sender', gloss: 'the caller / end-user address the turn came from' },
    { name: 'our_identity', gloss: 'the identity the medium reached us at (null on the api door)' },
    { name: 'channel', gloss: 'the channel name (null on the api door)' },
    { name: 'person_id', gloss: 'the linked person id, when the sender is a paired person' },
    { name: 'person_addresses', gloss: "the linked person's known addresses, when paired" },
    { name: 'params', gloss: 'opaque caller-supplied entry params, when present' },
  ],
  returns: 'a JSON object of the tool-call keyword arguments',
} as const;

/**
 * What `.` is for `reply_expr`: the tool's raw result. The program maps it to the
 * guest-facing reply.
 */
const REPLY_EXPR_ANNOTATION = {
  language: 'jq',
  label: 'tool result',
  blurb: "The tool's raw result. Map it to the guest-facing reply.",
  keys: [],
  returns: 'null (no reply), a string, or an array of reply parts',
} as const;

/** The `route_name` property — a free slug on create, fixed (read-only) on edit. */
function routeNameProperty(fixed: string | undefined): JsonSchema {
  if (fixed !== undefined) {
    return { const: fixed, title: 'Route name' };
  }
  return {
    type: 'string',
    title: 'Route name',
    description:
      'A ":"-free slug (lowercase letters, digits, hyphens) — the route\'s stable identity. It cannot be changed later.',
  };
}

/**
 * The route form's schema. `fixedRouteName` pins `route_name` to a read-only value
 * for the edit path (the name IS the route's identity and its URL key, so a rename
 * would target a different route); leaving it undefined renders the editable slug
 * input for the create path.
 */
export function routeFormSchema(fixedRouteName?: string): JsonSchema {
  return {
    type: 'object',
    required: ['route_name', 'target', 'delivery', 'execution_key'],
    properties: {
      route_name: routeNameProperty(fixedRouteName),
      target: {
        title: 'Target',
        description: 'What an inbound turn on this route runs.',
        discriminator: { propertyName: 'target_kind' },
        oneOf: [
          {
            title: 'Agent',
            type: 'object',
            required: ['target_kind', 'target_name'],
            properties: {
              target_kind: { const: 'agent', title: 'Target kind' },
              target_name: {
                type: 'string',
                title: 'Agent name',
                description: 'A registered agent the turn runs as a threaded conversation.',
              },
            },
          },
          {
            title: 'Tool',
            type: 'object',
            required: ['target_kind', 'target_name'],
            properties: {
              target_kind: { const: 'tool', title: 'Target kind' },
              target_name: {
                type: 'string',
                title: 'Tool name',
                description: 'A registered tool dispatched statelessly per message.',
              },
              payload_expr: {
                type: 'string',
                title: 'Payload expression',
                description:
                  "Optional jq mapping the inbound turn to the tool's keyword arguments; blank uses { message, sender }.",
                'x-tai42-expression': PAYLOAD_EXPR_ANNOTATION,
              },
              reply_expr: {
                type: 'string',
                title: 'Reply expression',
                description:
                  'Optional jq mapping the tool result to the reply; blank passes a null / string / parts result straight through.',
                'x-tai42-expression': REPLY_EXPR_ANNOTATION,
              },
            },
          },
        ],
      },
      delivery: {
        title: 'Door',
        description: "How a turn's answer is delivered back.",
        discriminator: { propertyName: 'door' },
        oneOf: [
          {
            title: 'API',
            type: 'object',
            required: ['door', 'callback_url'],
            properties: {
              door: { const: 'api', title: 'Door' },
              callback_url: {
                type: 'string',
                format: 'uri',
                title: 'Callback URL',
                description: 'The absolute https URL the signed answer callback is delivered to.',
              },
            },
          },
          {
            title: 'Channel',
            type: 'object',
            required: ['door', 'channel', 'our_identity'],
            properties: {
              door: { const: 'channel', title: 'Door' },
              channel: {
                type: 'string',
                title: 'Channel',
                description:
                  'The registry channel name (":"-free) the medium adapter delivers through.',
              },
              our_identity: {
                type: 'string',
                title: 'Our identity',
                description: 'The medium address this route is texted at.',
              },
            },
          },
        ],
      },
      execution_key: {
        type: 'string',
        title: 'Execution key',
        description:
          'The api-key user_id the turn runs AS; its live grants authorize the run and every tool call it makes.',
      },
      initial_mode: {
        type: 'string',
        enum: ['agent', 'manual'],
        default: 'agent',
        title: 'Initial mode',
        description:
          'The thread control mode when none is overridden: agent runs the turn, manual suppresses it for an operator to answer.',
      },
      turns_per_hour_override: {
        type: ['integer', 'null'],
        minimum: 1,
        title: 'Turns-per-hour override',
        description:
          "A positive per-hour turn rate for this route's per-address buckets, or blank for the global rate.",
      },
      error_reply_text: {
        type: ['string', 'null'],
        maxLength: 2000,
        title: 'Error reply text',
        description:
          'The guest-facing reply sent when a turn fails; blank uses the built-in default.',
      },
    },
  };
}

/** The form's (nested) value shape — the mirror image of {@link routeFormSchema}. */
export interface RouteFormValue {
  route_name?: string;
  execution_key?: string;
  initial_mode?: ConversationMode;
  turns_per_hour_override?: number;
  error_reply_text?: string;
  target?: {
    target_kind?: 'agent' | 'tool';
    target_name?: string;
    payload_expr?: string;
    reply_expr?: string;
  };
  delivery?: {
    door?: 'api' | 'channel';
    callback_url?: string;
    channel?: string;
    our_identity?: string;
  };
}

/** The blank create value: only the defaulted `initial_mode` is seeded; the target
 * and door variant pickers start unselected so the operator makes an explicit choice. */
export function blankRouteValue(): RouteFormValue {
  return { initial_mode: 'agent' };
}

/** Prefill the form from a stored route (the edit path). */
export function routeToFormValue(route: ConversationRoute): RouteFormValue {
  return {
    route_name: route.route_name,
    execution_key: route.execution_key,
    initial_mode: route.initial_mode,
    ...(route.turns_per_hour_override !== null
      ? { turns_per_hour_override: route.turns_per_hour_override }
      : {}),
    ...(route.error_reply_text !== null ? { error_reply_text: route.error_reply_text } : {}),
    target:
      route.target_kind === 'tool'
        ? {
            target_kind: 'tool',
            target_name: route.target_name,
            ...(route.payload_expr !== null ? { payload_expr: route.payload_expr } : {}),
            ...(route.reply_expr !== null ? { reply_expr: route.reply_expr } : {}),
          }
        : { target_kind: 'agent', target_name: route.target_name },
    delivery:
      route.door === 'api'
        ? { door: 'api', callback_url: route.callback_url ?? '' }
        : { door: 'channel', channel: route.channel ?? '', our_identity: route.our_identity ?? '' },
  };
}

/**
 * Non-empty and value-shape checks for the required text fields, as path-keyed
 * errors `SchemaForm` displays inline — the house style (see the hooks
 * `RegisterHookForm`). The SDK's `validateAgainstSchema` catches a MISSING required
 * field and structural drift, but a required string kept as `""` reads as "present"
 * there; these fill that gap so a blank identity is caught in-form, not only by the
 * server's 400. Beyond blankness, the common value-content rules the server also
 * enforces are mirrored here so they surface inline (route-name slug, callback URL
 * shape, colon-free channel); the rest stay the server's authority. Scoped to the
 * active variant (an unselected variant is the schema's own required-union error,
 * not a field error here).
 */
export function requiredFieldErrors(value: RouteFormValue, editing: boolean): SchemaFormErrors {
  const errors: Record<string, string> = {};
  const blank = (candidate: string | undefined): boolean => (candidate ?? '').trim() === '';

  // `route_name` is editable only on create; on edit it is a read-only const.
  if (!editing) {
    const name = (value.route_name ?? '').trim();
    if (name === '') errors.route_name = 'A route name is required.';
    else if (!ROUTE_NAME_RE.test(name))
      errors.route_name = 'Use a ":"-free slug: lowercase letters, digits, and hyphens only.';
  }

  const target = value.target ?? {};
  if (target.target_kind !== undefined && blank(target.target_name)) {
    errors['target.target_name'] =
      target.target_kind === 'tool' ? 'A tool name is required.' : 'An agent name is required.';
  }

  if (blank(value.execution_key)) errors.execution_key = 'An execution key is required.';

  const delivery = value.delivery ?? {};
  if (delivery.door === 'api') {
    const callbackUrl = (delivery.callback_url ?? '').trim();
    if (callbackUrl === '') errors['delivery.callback_url'] = 'A callback URL is required.';
    else if (!isAbsoluteHttpsUrl(callbackUrl))
      errors['delivery.callback_url'] = 'Must be an absolute https URL.';
  }
  if (delivery.door === 'channel') {
    const channel = delivery.channel ?? '';
    if (channel.trim() === '') errors['delivery.channel'] = 'A channel is required.';
    else if (channel.includes(':')) errors['delivery.channel'] = 'Use a ":"-free channel name.';
    if (blank(delivery.our_identity)) errors['delivery.our_identity'] = 'An identity is required.';
  }

  return errors;
}

/**
 * Flatten a validated form value into the flat wire body. Runs only AFTER
 * `validateAgainstSchema` has passed, so the required fields are present; the `??`
 * fallbacks satisfy the type checker for the unreachable unset case. A field that
 * belongs to the other variant is sent as `null` (never a stale value), mirroring
 * the contract's per-door / per-target-kind exclusivity.
 */
export function formValueToBody(value: RouteFormValue): ConversationRouteCreate {
  const target = value.target ?? {};
  const delivery = value.delivery ?? {};
  const isTool = target.target_kind === 'tool';
  const isApi = delivery.door === 'api';
  return {
    route_name: value.route_name ?? '',
    door: delivery.door ?? 'api',
    target_kind: target.target_kind ?? 'agent',
    target_name: target.target_name ?? '',
    payload_expr: isTool ? (target.payload_expr ?? null) : null,
    reply_expr: isTool ? (target.reply_expr ?? null) : null,
    initial_mode: value.initial_mode ?? 'agent',
    execution_key: value.execution_key ?? '',
    channel: isApi ? null : (delivery.channel ?? null),
    our_identity: isApi ? null : (delivery.our_identity ?? null),
    callback_url: isApi ? (delivery.callback_url ?? null) : null,
    turns_per_hour_override: value.turns_per_hour_override ?? null,
    error_reply_text: value.error_reply_text ?? null,
  };
}
