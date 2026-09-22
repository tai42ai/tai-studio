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
 *   - `target` is discriminated on `target_kind`: BOTH an `agent` and a `tool`
 *     target carry the same five door-contract jq fields (`start_expr`,
 *     `cancel_expr`, `resume_expr`, `extras_expr`, `reply_expr`) — either target
 *     kind can drive a parkable run.
 *   - `delivery` is discriminated on `door`: an `api` door carries a `callback_url`
 *     (and no channel identity); a `channel` door carries `channel` + `our_identity`
 *     (and no callback).
 *
 * The jq fields carry `x-tai42-expression`, the SDK's opt-in expression seam: with
 * the host's ambient `ExpressionFieldContext` wired (it is, app-wide), the field
 * renders the visual jq editor with its input-shape descriptor and variable legend;
 * with none it degrades to a plain text box. The feature builds NO seam of its own.
 */
import type {
  ConversationMode,
  ConversationRoute,
  ConversationRouteCreate,
} from '@tai42/api-client';
import type { JsonSchema, SchemaFormErrors } from '@tai42/studio-sdk';

import {
  CANCEL_EXPR_ANNOTATION,
  EXTRAS_EXPR_ANNOTATION,
  REPLY_EXPR_ANNOTATION,
  RESUME_EXPR_ANNOTATION,
  START_EXPR_ANNOTATION,
} from './route-jq-annotations';

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

/** Whether a required string field is unset or whitespace-only. */
function blank(candidate: string | undefined): boolean {
  return (candidate ?? '').trim() === '';
}

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
 * The five door-contract jq fields BOTH target variants carry (either kind can
 * drive a parkable run). `startDescription` is the one field whose helper text
 * differs per kind — a tool dispatch's kwargs vs an agent run's kwargs. Each field
 * carries `x-tai42-expression`, so the schema-driven form renders the jq editor
 * with the `$parked` (and, for the reply, `$turn`/`$asks`) variable legend.
 */
function doorContractJqProperties(startDescription: string): Record<string, JsonSchema> {
  return {
    start_expr: {
      type: 'string',
      title: 'Start expression',
      description: startDescription,
      'x-tai42-expression': START_EXPR_ANNOTATION,
    },
    reply_expr: {
      type: 'string',
      title: 'Reply expression',
      description:
        'Optional jq mapping the run result to the reply; blank passes a null / string / parts result straight through. Reads $turn, $asks and $parked.',
      'x-tai42-expression': REPLY_EXPR_ANNOTATION,
    },
    cancel_expr: {
      type: 'string',
      title: 'Cancel expression',
      description:
        'Optional jq over the inbound turn naming the parked interactions to cancel; reads $parked.',
      'x-tai42-expression': CANCEL_EXPR_ANNOTATION,
    },
    resume_expr: {
      type: 'string',
      title: 'Resume expression',
      description:
        'Optional jq over the inbound turn naming the parked interactions to resume with an answer or to take; reads $parked.',
      'x-tai42-expression': RESUME_EXPR_ANNOTATION,
    },
    extras_expr: {
      type: 'string',
      title: 'Extras expression',
      description:
        'Optional jq over the inbound turn building the extras mapping handed to the started run; reads $parked.',
      'x-tai42-expression': EXTRAS_EXPR_ANNOTATION,
    },
  };
}

/** The `agent`-kind branch of the discriminated `target` union. */
function targetAgentVariant(): JsonSchema {
  return {
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
      ...doorContractJqProperties(
        "Optional jq mapping the inbound turn to the agent run's kwargs — the route owns the thread. Blank runs the agent on the raw turn.",
      ),
    },
  };
}

/** The `tool`-kind branch of the discriminated `target` union. */
function targetToolVariant(): JsonSchema {
  return {
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
      ...doorContractJqProperties(
        "Optional jq mapping the inbound turn to the tool's keyword arguments; blank uses { message, sender }.",
      ),
    },
  };
}

/** The `target` field: a union discriminated on `target_kind` (agent vs tool). */
function targetSchema(): JsonSchema {
  return {
    title: 'Target',
    description: 'What an inbound turn on this route runs.',
    discriminator: { propertyName: 'target_kind' },
    oneOf: [targetAgentVariant(), targetToolVariant()],
  };
}

/** The `api`-door branch of the discriminated `delivery` union. */
function deliveryApiVariant(): JsonSchema {
  return {
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
  };
}

/** The `channel`-door branch of the discriminated `delivery` union. */
function deliveryChannelVariant(): JsonSchema {
  return {
    title: 'Channel',
    type: 'object',
    required: ['door', 'channel', 'our_identity'],
    properties: {
      door: { const: 'channel', title: 'Door' },
      channel: {
        type: 'string',
        title: 'Channel',
        description: 'The registry channel name (":"-free) the medium adapter delivers through.',
      },
      our_identity: {
        type: 'string',
        title: 'Our identity',
        description: 'The medium address this route is texted at.',
      },
    },
  };
}

/** The `delivery` field: a union discriminated on `door` (api vs channel). */
function deliverySchema(): JsonSchema {
  return {
    title: 'Door',
    description: "How a turn's answer is delivered back.",
    discriminator: { propertyName: 'door' },
    oneOf: [deliveryApiVariant(), deliveryChannelVariant()],
  };
}

/**
 * The `overlap` property — the route's overlap policy: what happens to a running
 * turn and the newer participant messages that arrive while it runs. A nested plain
 * object (rendered as a labelled group, not a union), every field optional: an unset
 * field, or an unset whole object, is the server default (`continue` / `one` / `0`).
 */
function overlapProperty(): JsonSchema {
  return {
    title: 'Overlap',
    type: 'object',
    description:
      'What happens when a message arrives while an earlier one on the same thread is still being answered. Leave every field blank for the defaults: the running turn continues, each message is delivered on its own, and there is no settle window.',
    properties: {
      running: {
        type: 'string',
        enum: ['continue', 'cancel'],
        title: 'Running turn',
        description:
          'Whether a turn already in progress continues or is cancelled when a newer message arrives.',
      },
      deliver: {
        type: 'string',
        enum: ['one', 'all'],
        title: 'Deliver',
        description:
          'Whether the next turn answers one message at a time or carries every message that arrived while the previous turn ran.',
      },
      settle_seconds: {
        type: ['integer', 'null'],
        minimum: 0,
        maximum: 30,
        title: 'Settle window (seconds)',
        description:
          'How long the next turn waits for further messages before it starts, 0 to 30. Needs Deliver set to all or Running turn set to cancel.',
      },
    },
  };
}

/** The `execution_key` property — the api-key user_id a turn runs as. */
function executionKeyProperty(): JsonSchema {
  return {
    type: 'string',
    title: 'Execution key',
    description:
      'The api-key user_id the turn runs AS; its live grants authorize the run and every tool call it makes.',
  };
}

/** The `initial_mode` property — the thread control mode when none is overridden. */
function initialModeProperty(): JsonSchema {
  return {
    type: 'string',
    enum: ['agent', 'manual'],
    default: 'agent',
    title: 'Initial mode',
    description:
      'The thread control mode when none is overridden: agent runs the turn, manual suppresses it for an operator to answer.',
  };
}

/** The `turns_per_hour_override` property — an optional per-route turn rate. */
function turnsPerHourProperty(): JsonSchema {
  return {
    type: ['integer', 'null'],
    minimum: 1,
    title: 'Turns-per-hour override',
    description:
      "A positive per-hour turn rate for this route's per-address buckets, or blank for the global rate.",
  };
}

/** The `error_reply_text` property — the participant-facing reply on a failed turn. */
function errorReplyTextProperty(): JsonSchema {
  return {
    type: ['string', 'null'],
    maxLength: 2000,
    title: 'Error reply text',
    description:
      'The participant-facing reply sent when a turn fails; blank uses the built-in default.',
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
      target: targetSchema(),
      delivery: deliverySchema(),
      overlap: overlapProperty(),
      execution_key: executionKeyProperty(),
      initial_mode: initialModeProperty(),
      turns_per_hour_override: turnsPerHourProperty(),
      error_reply_text: errorReplyTextProperty(),
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
  // The route locale the platform keys, not authored by this form; carried through an
  // edit so an upsert never drops one set elsewhere.
  locale?: string | null;
  overlap?: {
    running?: 'continue' | 'cancel';
    deliver?: 'one' | 'all';
    settle_seconds?: number;
  };
  target?: {
    target_kind?: 'agent' | 'tool';
    target_name?: string;
    // The five door-contract jq fields, authored inline; both target kinds carry them.
    start_expr?: string;
    reply_expr?: string;
    cancel_expr?: string;
    resume_expr?: string;
    extras_expr?: string;
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

/** The target sub-value prefilled from a stored route: its kind/name plus each door
 * jq's inline `content` (a stored-id expr has none, so it is dropped). */
function routeTargetValue(route: ConversationRoute): NonNullable<RouteFormValue['target']> {
  type JqKey = 'start_expr' | 'reply_expr' | 'cancel_expr' | 'resume_expr' | 'extras_expr';
  const target: NonNullable<RouteFormValue['target']> = {
    target_kind: route.target_kind,
    target_name: route.target_name,
  };
  const keys: JqKey[] = ['start_expr', 'reply_expr', 'cancel_expr', 'resume_expr', 'extras_expr'];
  for (const key of keys) {
    const content = route[key]?.content;
    if (content) target[key] = content;
  }
  return target;
}

/** Prefill the form from a stored route (the edit path). */
export function routeToFormValue(route: ConversationRoute): RouteFormValue {
  return {
    route_name: route.route_name,
    execution_key: route.execution_key,
    initial_mode: route.initial_mode,
    // The platform always returns the resolved policy on a route read; copy it in so
    // the group shows the stored values and an edit round-trips them unchanged.
    overlap: {
      running: route.overlap.running,
      deliver: route.overlap.deliver,
      settle_seconds: route.overlap.settle_seconds,
    },
    ...(route.locale !== null ? { locale: route.locale } : {}),
    ...(route.turns_per_hour_override !== null
      ? { turns_per_hour_override: route.turns_per_hour_override }
      : {}),
    ...(route.error_reply_text !== null ? { error_reply_text: route.error_reply_text } : {}),
    // Both target kinds carry the five door jqs (prefilled from their inline content).
    target: routeTargetValue(route),
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
/** The create-only route-name required + slug check (edit pins it read-only). */
function routeNameError(value: RouteFormValue, editing: boolean): Record<string, string> {
  if (editing) return {};
  const name = (value.route_name ?? '').trim();
  if (name === '') return { route_name: 'A route name is required.' };
  if (!ROUTE_NAME_RE.test(name)) {
    return { route_name: 'Use a ":"-free slug: lowercase letters, digits, and hyphens only.' };
  }
  return {};
}

/** The target-name blank check, scoped to the selected target variant. */
function targetNameError(target: NonNullable<RouteFormValue['target']>): Record<string, string> {
  if (target.target_kind === undefined || !blank(target.target_name)) return {};
  return {
    'target.target_name':
      target.target_kind === 'tool' ? 'A tool name is required.' : 'An agent name is required.',
  };
}

/** The execution-key blank check. */
function executionKeyError(value: RouteFormValue): Record<string, string> {
  return blank(value.execution_key) ? { execution_key: 'An execution key is required.' } : {};
}

/** The api-door callback-URL required + absolute-https checks. */
function apiDeliveryErrors(
  delivery: NonNullable<RouteFormValue['delivery']>,
): Record<string, string> {
  const callbackUrl = (delivery.callback_url ?? '').trim();
  if (callbackUrl === '') return { 'delivery.callback_url': 'A callback URL is required.' };
  if (!isAbsoluteHttpsUrl(callbackUrl)) {
    return { 'delivery.callback_url': 'Must be an absolute https URL.' };
  }
  return {};
}

/** The channel-door required + colon-free channel and identity checks. */
function channelDeliveryErrors(
  delivery: NonNullable<RouteFormValue['delivery']>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  const channel = delivery.channel ?? '';
  if (channel.trim() === '') errors['delivery.channel'] = 'A channel is required.';
  else if (channel.includes(':')) errors['delivery.channel'] = 'Use a ":"-free channel name.';
  if (blank(delivery.our_identity)) errors['delivery.our_identity'] = 'An identity is required.';
  return errors;
}

/** The delivery-field checks, dispatched on the selected door variant. */
function deliveryErrors(delivery: NonNullable<RouteFormValue['delivery']>): Record<string, string> {
  if (delivery.door === 'api') return apiDeliveryErrors(delivery);
  if (delivery.door === 'channel') return channelDeliveryErrors(delivery);
  return {};
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

export function requiredFieldErrors(value: RouteFormValue, editing: boolean): SchemaFormErrors {
  return {
    ...routeNameError(value, editing),
    ...targetNameError(value.target ?? {}),
    ...executionKeyError(value),
    ...deliveryErrors(value.delivery ?? {}),
    ...overlapError(value.overlap ?? {}),
  };
}

/**
 * Flatten a validated form value into the flat wire body. Runs only AFTER
 * `validateAgainstSchema` has passed, so the required fields are present; the `??`
 * fallbacks satisfy the type checker for the unreachable unset case. A field that
 * belongs to the other variant is sent as `null` (never a stale value), mirroring
 * the contract's per-door / per-target-kind exclusivity.
 */
/** The target-kind/name fields plus the five door-contract inline jq expressions,
 * carried on BOTH target kinds. A blank field rides the wire as `null`. */
function targetBodyFields(
  target: NonNullable<RouteFormValue['target']>,
): Pick<
  ConversationRouteCreate,
  | 'target_kind'
  | 'target_name'
  | 'start_expr'
  | 'reply_expr'
  | 'cancel_expr'
  | 'resume_expr'
  | 'extras_expr'
> {
  // Each jq is authored as inline text and rides the wire as a templated text
  // (inline `content`); a blank field is `null`.
  return {
    target_kind: target.target_kind ?? 'agent',
    target_name: target.target_name ?? '',
    start_expr: target.start_expr ? { content: target.start_expr } : null,
    reply_expr: target.reply_expr ? { content: target.reply_expr } : null,
    cancel_expr: target.cancel_expr ? { content: target.cancel_expr } : null,
    resume_expr: target.resume_expr ? { content: target.resume_expr } : null,
    extras_expr: target.extras_expr ? { content: target.extras_expr } : null,
  };
}

/** The door field plus the per-door exclusive delivery fields (the other variant's are `null`). */
function deliveryBodyFields(
  delivery: NonNullable<RouteFormValue['delivery']>,
  isApi: boolean,
): Pick<ConversationRouteCreate, 'door' | 'channel' | 'our_identity' | 'callback_url'> {
  return {
    door: delivery.door ?? 'api',
    channel: isApi ? null : (delivery.channel ?? null),
    our_identity: isApi ? null : (delivery.our_identity ?? null),
    callback_url: isApi ? (delivery.callback_url ?? null) : null,
  };
}

/** The flat scalar tail — the route-level fields with no target/delivery variant fork. */
function scalarBodyFields(
  value: RouteFormValue,
): Pick<
  ConversationRouteCreate,
  | 'route_name'
  | 'initial_mode'
  | 'execution_key'
  | 'turns_per_hour_override'
  | 'error_reply_text'
  | 'locale'
> {
  return {
    route_name: value.route_name ?? '',
    initial_mode: value.initial_mode ?? 'agent',
    execution_key: value.execution_key ?? '',
    turns_per_hour_override: value.turns_per_hour_override ?? null,
    error_reply_text: value.error_reply_text ?? null,
    // Carried through unchanged — the form does not author the locale, and the upsert
    // replaces the whole row, so echoing it back keeps one set elsewhere.
    locale: value.locale ?? null,
  };
}

/**
 * The overlap-policy body: only the keys the operator actually set, and the whole
 * `overlap` object omitted when none is — the contract defaults each field, so an
 * absent policy IS the default policy. A policy field is never sent as `null`.
 */
function overlapBodyFields(
  value: RouteFormValue,
): Pick<ConversationRouteCreate, 'overlap'> | Record<string, never> {
  const overlap = value.overlap ?? {};
  const body: NonNullable<ConversationRouteCreate['overlap']> = {};
  if (overlap.running !== undefined) body.running = overlap.running;
  if (overlap.deliver !== undefined) body.deliver = overlap.deliver;
  if (overlap.settle_seconds !== undefined) body.settle_seconds = overlap.settle_seconds;
  return Object.keys(body).length > 0 ? { overlap: body } : {};
}

export function formValueToBody(value: RouteFormValue): ConversationRouteCreate {
  const target = value.target ?? {};
  const delivery = value.delivery ?? {};
  const isApi = delivery.door === 'api';
  return {
    ...scalarBodyFields(value),
    ...targetBodyFields(target),
    ...deliveryBodyFields(delivery, isApi),
    ...overlapBodyFields(value),
  };
}
