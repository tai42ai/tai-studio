/**
 * The route form is built from the contract's published `ConversationRouteCreate`
 * document; the grouping into target/delivery is UI-only. The form's JSON Schema drives
 * the SDK's `SchemaForm`, and two mappers convert between the form's (nested) value and the
 * flat `ConversationRouteCreate` wire body.
 *
 * The document's own constraints — the route-name slug, each door's delivery fields (an
 * `api` door's optional absolute-https `callback_url`; a `channel` door's `:`-free
 * `channel` and its non-blank `our_identity`), the reply-text bounds, the positive
 * turn rate and the overlap policy's bounds — are read from it, so the SDK validator
 * refuses what the server refuses, in-form (`route-form-errors` shows those errors). The two discriminated unions keep an invalid
 * target-kind/door combination unauthorable:
 *   - `target` is discriminated on `target_kind`: BOTH an `agent` and a `tool`
 *     target carry the same five door-contract jq fields (`start_expr`,
 *     `cancel_expr`, `resume_expr`, `extras_expr`, `reply_expr`) — either target
 *     kind can drive a parkable run.
 *   - `delivery` is discriminated on `door`: an `api` door carries an optional
 *     `callback_url` (blank is a poll-only route); a `channel` door carries `channel` +
 *     `our_identity`.
 *
 * Each jq field is the document's own property: a templated text (inline jq, or the id
 * of a stored template, plus its render kwargs) carrying the document's
 * `x-tai42-expression` annotation. The SDK's `SchemaForm` draws a templated-text field
 * for it, whose inline editor is the visual jq editor when the host's ambient
 * `ExpressionFieldContext` is wired (it is, app-wide) and whose stored source lists the
 * templates of the ambient `TemplatedTextCatalogContext`. The value is the templated
 * text itself, carried from a stored route to the wire body unchanged. The feature
 * builds NO seam of its own.
 */
import type {
  ApiConversationRouteCreate,
  ChannelConversationRouteCreate,
  ConversationMode,
  ConversationRouteCreate,
  ConversationRouteView,
  TemplatedText,
} from '@tai42/api-client';
import type { JsonSchema } from '@tai42/studio-sdk';

import {
  API_VARIANT,
  CHANNEL_VARIANT,
  documentConstraints,
  OVERLAP_POLICY,
  TEMPLATED_TEXT,
} from './route-document';
import {
  replyTextsBody,
  replyTextsProperty,
  type ReplyTextsValue,
  replyTextsValue,
} from './route-reply-texts';

/** Whether a text field is unset or whitespace-only. */
export function isBlank(candidate: string | undefined): boolean {
  return (candidate ?? '').trim() === '';
}

/** The route-name field's create-path description. */
export const ROUTE_NAME_DESCRIPTION =
  'A ":"-free slug (lowercase letters, digits, hyphens) — the route\'s stable identity. It cannot be changed later.';

/** The callback-URL field's description. */
export const CALLBACK_URL_DESCRIPTION =
  'Optional. The absolute https URL the signed answer callback is delivered to. Leave blank for a poll-only route.';

/** The `route_name` property — a free slug on create, fixed (read-only) on edit. */
function routeNameProperty(fixed: string | undefined): JsonSchema {
  if (fixed !== undefined) {
    return { const: fixed, title: 'Route name' };
  }
  return {
    ...documentConstraints(API_VARIANT.properties.route_name),
    title: 'Route name',
    description: ROUTE_NAME_DESCRIPTION,
  };
}

/** The five door-contract jq fields, in the order the form draws them. */
const DOOR_EXPR_KEYS = [
  'start_expr',
  'reply_expr',
  'cancel_expr',
  'resume_expr',
  'extras_expr',
] as const;

type DoorExprKey = (typeof DOOR_EXPR_KEYS)[number];

/** Each jq field's heading and helper text; the start text differs per target kind. */
const DOOR_EXPR_TEXT: Readonly<
  Record<Exclude<DoorExprKey, 'start_expr'>, readonly [string, string]>
> = {
  reply_expr: [
    'Reply expression',
    'Optional jq mapping the run result to the reply; blank passes a null / string / parts result straight through. Reads $turn, $asks and $parked.',
  ],
  cancel_expr: [
    'Cancel expression',
    'Optional jq over the inbound turn naming the parked interactions to cancel; reads $parked.',
  ],
  resume_expr: [
    'Resume expression',
    'Optional jq over the inbound turn naming the parked interactions to resume with an answer or to take; reads $parked.',
  ],
  extras_expr: [
    'Extras expression',
    'Optional jq over the inbound turn building the extras mapping handed to the started run; reads $parked.',
  ],
};

/** The `$defs` a schema holding the jq fields carries, so their `$ref` resolves. */
const DOOR_EXPR_DEFS = { TemplatedText: TEMPLATED_TEXT } as const;

/**
 * One jq field: the document's property (an optional templated text, with the document's
 * `x-tai42-expression` annotation naming what `.` is and the variables it reads) under
 * the form's heading and helper text. Both door variants carry the same property.
 */
function doorExprProperty(key: DoorExprKey, title: string, description: string): JsonSchema {
  const property = API_VARIANT.properties[key];
  return {
    anyOf: property.anyOf,
    title,
    description,
    'x-tai42-expression': property['x-tai42-expression'],
  };
}

/**
 * The five door-contract jq fields BOTH target variants carry (either kind can
 * drive a parkable run). `startDescription` is the one field whose helper text
 * differs per kind — a tool dispatch's kwargs vs an agent run's kwargs.
 */
function doorContractJqProperties(startDescription: string): Record<DoorExprKey, JsonSchema> {
  return {
    start_expr: doorExprProperty('start_expr', 'Start expression', startDescription),
    reply_expr: doorExprProperty('reply_expr', ...DOOR_EXPR_TEXT.reply_expr),
    cancel_expr: doorExprProperty('cancel_expr', ...DOOR_EXPR_TEXT.cancel_expr),
    resume_expr: doorExprProperty('resume_expr', ...DOOR_EXPR_TEXT.resume_expr),
    extras_expr: doorExprProperty('extras_expr', ...DOOR_EXPR_TEXT.extras_expr),
  };
}

/** The start-expression helper text per target kind: an agent run's kwargs vs a tool dispatch's. */
const START_DESCRIPTION: Readonly<Record<'agent' | 'tool', string>> = {
  agent:
    "Optional jq mapping the inbound turn to the agent run's kwargs — the route owns the thread. Blank runs the agent on the raw turn.",
  tool: "Optional jq mapping the inbound turn to the tool's keyword arguments; blank uses { message, sender }.",
};

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
      ...doorContractJqProperties(START_DESCRIPTION.agent),
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
      ...doorContractJqProperties(START_DESCRIPTION.tool),
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
    required: deliveryRequired(API_VARIANT.required),
    properties: {
      door: { ...documentConstraints(API_VARIANT.properties.door), title: 'Door' },
      callback_url: {
        ...documentConstraints(API_VARIANT.properties.callback_url),
        title: 'Callback URL',
        description: CALLBACK_URL_DESCRIPTION,
      },
    },
  };
}

/** The delivery fields among a door variant's required fields. */
function deliveryRequired(required: readonly string[]): string[] {
  return required.filter((field) => DELIVERY_FIELDS.has(field));
}

/** The fields the `delivery` group holds; the rest of a variant is the route's own. */
const DELIVERY_FIELDS = new Set(['door', 'callback_url', 'channel', 'our_identity']);

/** The `channel`-door branch of the discriminated `delivery` union. */
function deliveryChannelVariant(): JsonSchema {
  return {
    title: 'Channel',
    type: 'object',
    required: deliveryRequired(CHANNEL_VARIANT.required),
    properties: {
      door: { ...documentConstraints(CHANNEL_VARIANT.properties.door), title: 'Door' },
      channel: {
        ...documentConstraints(CHANNEL_VARIANT.properties.channel),
        title: 'Channel',
        description: 'The registry channel name (":"-free) the medium adapter delivers through.',
      },
      our_identity: {
        ...documentConstraints(CHANNEL_VARIANT.properties.our_identity),
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
        ...documentConstraints(OVERLAP_POLICY.properties.running),
        title: 'Running turn',
        description:
          'Whether a turn already in progress continues or is cancelled when a newer message arrives.',
      },
      deliver: {
        ...documentConstraints(OVERLAP_POLICY.properties.deliver),
        title: 'Deliver',
        description:
          'Whether the next turn answers one message at a time or carries every message that arrived while the previous turn ran.',
      },
      settle_seconds: {
        ...documentConstraints(OVERLAP_POLICY.properties.settle_seconds),
        type: ['integer', 'null'],
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
    ...documentConstraints(API_VARIANT.properties.turns_per_hour_override),
    title: 'Turns-per-hour override',
    description:
      "A positive per-hour turn rate for this route's per-address buckets, or blank for the global rate.",
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
    $defs: DOOR_EXPR_DEFS,
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
      reply_texts: replyTextsProperty(),
    },
  };
}

/**
 * The part of the route form a `SchemaForm` renders: the five door-contract jq fields of
 * the picked target kind (grouped under `target` as "Expressions"; absent until a kind is
 * picked), the overlap policy, the initial mode, the turn-rate override and the reply
 * texts. The route name, the target kind and name, the door and its delivery fields, and
 * the execution key are authored by the dialog's own fields; `routeFormSchema` stays the
 * whole value's validation schema.
 */
export function routeSettingsSchema(targetKind: 'agent' | 'tool' | undefined): JsonSchema {
  return {
    $defs: DOOR_EXPR_DEFS,
    type: 'object',
    properties: {
      ...(targetKind === undefined
        ? {}
        : {
            target: {
              type: 'object',
              title: 'Expressions',
              properties: doorContractJqProperties(START_DESCRIPTION[targetKind]),
            },
          }),
      overlap: overlapProperty(),
      initial_mode: initialModeProperty(),
      turns_per_hour_override: turnsPerHourProperty(),
      reply_texts: replyTextsProperty(),
    },
  };
}

/** The form's (nested) value shape — the mirror image of {@link routeFormSchema}. */
export interface RouteFormValue {
  route_name?: string;
  execution_key?: string;
  initial_mode?: ConversationMode;
  turns_per_hour_override?: number;
  reply_texts?: ReplyTextsValue;
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
    // The five door-contract jq fields, each inline jq or a stored template; both target
    // kinds carry them. An unset field is absent.
    start_expr?: TemplatedText;
    reply_expr?: TemplatedText;
    cancel_expr?: TemplatedText;
    resume_expr?: TemplatedText;
    extras_expr?: TemplatedText;
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

/** The target sub-value prefilled from a stored route: its kind/name plus each set door
 * jq as the route stores it (inline or a stored template, with its kwargs). */
function routeTargetValue(route: ConversationRouteView): NonNullable<RouteFormValue['target']> {
  const target: NonNullable<RouteFormValue['target']> = {
    target_kind: route.target_kind,
    target_name: route.target_name,
  };
  for (const key of DOOR_EXPR_KEYS) {
    const expr = route[key];
    if (expr !== null) target[key] = expr;
  }
  return target;
}

/** Prefill the form from a stored route (the edit path). */
export function routeToFormValue(route: ConversationRouteView): RouteFormValue {
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
    ...(route.reply_texts !== null ? { reply_texts: replyTextsValue(route.reply_texts) } : {}),
    // Both target kinds carry the five door jqs, prefilled as stored.
    target: routeTargetValue(route),
    delivery:
      route.door === 'api'
        ? { door: 'api', callback_url: route.callback_url ?? '' }
        : { door: 'channel', channel: route.channel, our_identity: route.our_identity },
  };
}

/**
 * Flatten a validated form value into the flat wire body. Runs only AFTER the form's
 * errors are clear, so the required fields are present; the `??` fallbacks satisfy the
 * type checker for the unreachable unset case. The body is the door's variant of the
 * route-create union: an `api` route carries its callback URL (blank is a poll-only
 * route, sent as `null`) and a `channel` route its channel and identity.
 */
/** The target-kind/name fields plus the five door-contract jq expressions, carried on
 * BOTH target kinds. An unset field rides the wire as `null`. */
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
  return {
    target_kind: target.target_kind ?? 'agent',
    target_name: target.target_name ?? '',
    start_expr: target.start_expr ?? null,
    reply_expr: target.reply_expr ?? null,
    cancel_expr: target.cancel_expr ?? null,
    resume_expr: target.resume_expr ?? null,
    extras_expr: target.extras_expr ?? null,
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
  | 'reply_texts'
  | 'locale'
> {
  return {
    route_name: value.route_name ?? '',
    initial_mode: value.initial_mode ?? 'agent',
    execution_key: value.execution_key ?? '',
    turns_per_hour_override: value.turns_per_hour_override ?? null,
    reply_texts: replyTextsBody(value.reply_texts ?? {}),
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
  const delivery = value.delivery ?? {};
  const shared = {
    ...scalarBodyFields(value),
    ...targetBodyFields(value.target ?? {}),
    ...overlapBodyFields(value),
  };
  if (delivery.door === 'channel') {
    const channelRoute: ChannelConversationRouteCreate = {
      ...shared,
      door: 'channel',
      channel: delivery.channel ?? '',
      our_identity: delivery.our_identity ?? '',
      callback_url: null,
    };
    return channelRoute;
  }
  const apiRoute: ApiConversationRouteCreate = {
    ...shared,
    door: 'api',
    callback_url: isBlank(delivery.callback_url) ? null : (delivery.callback_url ?? null),
    channel: null,
    our_identity: null,
  };
  return apiRoute;
}
