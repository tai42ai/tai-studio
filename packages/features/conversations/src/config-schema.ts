/**
 * The CLIENT-AUTHORED JSON Schema that drives the per-target conversation-config
 * form through the SDK's `SchemaForm`, plus the mappers between the form value and
 * the `TargetConversationConfig` wire body.
 *
 * There is no server schema for this body: the upsert door takes flat parameters,
 * so the form authors its own schema here, mirroring
 * `tai42_contract.conversations.TargetConversationConfig`. The config is a FLAT row
 * (no discriminated unions — unlike the route form), keyed by
 * `(target_kind, target_name)`. On the EDIT path both key fields are pinned
 * read-only (`const`): the key IS the config's identity, so a re-key would target a
 * different config.
 *
 * `greeting_template` is a `str.format` template, NOT a jq expression, so it carries
 * NO `x-tai42-expression` — it renders as a plain text field. It may reference at
 * most the `{pairing_code}` placeholder (minted at greeting time); a blank template
 * means "no greeting" and is mapped to `null` on the wire (the server refuses a
 * blank string, `null` being the explicit spelling). The common placeholder mistake
 * is caught in-form by {@link requiredFieldErrors}; the full template grammar
 * (unbalanced braces, format specs) stays server-enforced and surfaces via
 * `ErrorState`.
 */
import type { JsonSchema, SchemaFormErrors } from '@tai42/studio-sdk';
import type { ConversationTargetKind, TargetConversationConfig } from '@tai42/api-client';

/** The one placeholder a greeting template may reference (minted at greeting time). */
const GREETING_PLACEHOLDER = 'pairing_code';

/**
 * The first `{...}` placeholder in a template that is NOT exactly `{pairing_code}`,
 * or `null` when every placeholder is supported. Escaped braces (`{{` / `}}`) are
 * stripped first so they never read as a placeholder edge. This mirrors the server's
 * most common refusal inline; residual grammar faults stay the server's authority.
 */
export function unsupportedGreetingPlaceholder(template: string): string | null {
  const stripped = template.replace(/\{\{|\}\}/g, '');
  const matches = stripped.match(/\{([^{}]*)\}/g) ?? [];
  for (const raw of matches) {
    const name = raw.slice(1, -1);
    if (name !== GREETING_PLACEHOLDER) return name;
  }
  return null;
}

/** The `target_kind` property — a fixed choice on create, pinned read-only on edit. */
function targetKindProperty(fixed: ConversationTargetKind | undefined): JsonSchema {
  if (fixed !== undefined) {
    return { const: fixed, title: 'Target kind' };
  }
  return {
    type: 'string',
    enum: ['agent', 'tool'],
    title: 'Target kind',
    description: 'Whether this config keys an agent or a tool target.',
  };
}

/** The `target_name` property — a free string on create, pinned read-only on edit. */
function targetNameProperty(fixed: string | undefined): JsonSchema {
  if (fixed !== undefined) {
    return { const: fixed, title: 'Target name' };
  }
  return {
    type: 'string',
    title: 'Target name',
    description:
      'The registered agent or tool this config presents — its stable identity. It cannot be changed later.',
  };
}

/** The identity of a config to edit: its `(target_kind, target_name)` key. */
export interface ConfigKey {
  readonly target_kind: ConversationTargetKind;
  readonly target_name: string;
}

/**
 * The config form's schema. `fixedKey` pins the `(target_kind, target_name)` pair to
 * read-only const values for the edit path (the key IS the config's identity);
 * leaving it undefined renders the editable pickers for the create path.
 */
export function configFormSchema(fixedKey?: ConfigKey): JsonSchema {
  return {
    type: 'object',
    required: ['target_kind', 'target_name'],
    properties: {
      target_kind: targetKindProperty(fixedKey?.target_kind),
      target_name: targetNameProperty(fixedKey?.target_name),
      multichannel: {
        type: 'boolean',
        default: false,
        title: 'Multichannel',
        description:
          'Opt this target into person linking, so one guest reached across several channels is one conversation.',
      },
      greeting_template: {
        type: ['string', 'null'],
        title: 'Greeting template',
        description:
          'The first-contact greeting. It may reference the {pairing_code} placeholder and nothing else; leave it blank for no greeting.',
      },
    },
  };
}

/** The form's value shape — the mirror image of {@link configFormSchema}. */
export interface ConfigFormValue {
  target_kind?: ConversationTargetKind;
  target_name?: string;
  multichannel?: boolean;
  greeting_template?: string;
}

/**
 * The blank create value. `target_kind` is seeded to the common `agent` case so its
 * radio starts with a selection (the operator flips it for a tool); `multichannel`
 * carries its schema default off.
 */
export function blankConfigValue(): ConfigFormValue {
  return { target_kind: 'agent', multichannel: false };
}

/** Prefill the form from a stored config (the edit path). */
export function configToFormValue(config: TargetConversationConfig): ConfigFormValue {
  return {
    target_kind: config.target_kind,
    target_name: config.target_name,
    multichannel: config.multichannel,
    ...(config.greeting_template !== null ? { greeting_template: config.greeting_template } : {}),
  };
}

/**
 * Non-empty and value-shape checks for the required fields, as path-keyed errors
 * `SchemaForm` displays inline — the house style (see the route form's
 * `requiredFieldErrors`). `validateAgainstSchema` catches a MISSING required field,
 * but a required string kept as `""` reads as "present" there; these fill that gap.
 * The greeting's unsupported-placeholder check mirrors the server's common refusal
 * inline. Scoped to the create path for the key fields (an edit pins them read-only).
 */
export function requiredFieldErrors(value: ConfigFormValue, editing: boolean): SchemaFormErrors {
  const errors: Record<string, string> = {};

  // The `(target_kind, target_name)` key is editable only on create; on edit both
  // are read-only consts.
  if (!editing && (value.target_name ?? '').trim() === '') {
    errors.target_name = 'A target name is required.';
  }

  // A blank greeting is "no greeting" (mapped to null), never an error; but a
  // non-blank one may reference only {pairing_code}.
  const greeting = value.greeting_template ?? '';
  if (greeting.trim() !== '') {
    const bad = unsupportedGreetingPlaceholder(greeting);
    if (bad !== null) {
      errors.greeting_template = `The greeting may reference only {${GREETING_PLACEHOLDER}}, not {${bad}}.`;
    }
  }

  return errors;
}

/**
 * Flatten a validated form value into the wire body. Runs only AFTER
 * `validateAgainstSchema` has passed, so the required fields are present; the `??`
 * fallbacks satisfy the type checker for the unreachable unset case. A blank greeting
 * is sent as `null` — the explicit "no greeting" the server accepts (it refuses a
 * blank string).
 */
export function formValueToBody(value: ConfigFormValue): TargetConversationConfig {
  const greeting = (value.greeting_template ?? '').trim();
  return {
    target_kind: value.target_kind ?? 'agent',
    target_name: value.target_name ?? '',
    multichannel: value.multichannel ?? false,
    greeting_template: greeting === '' ? null : greeting,
  };
}
