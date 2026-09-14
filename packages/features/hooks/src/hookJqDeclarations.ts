/**
 * The jq field declarations the register form authors against. `condition` gates
 * whether the hook fires, `expr` shapes the event before the tool runs, and the
 * subject `key_expr` derives the state subject key. Each evaluates against the
 * event that fired the hook, whose shape the topic defines — so every declaration
 * carries an OPEN document descriptor (no fixed keys) rather than inventing an
 * envelope the server does not promise. There is no author-time validate endpoint
 * for a hook spec, so none wires `serverValidate`.
 */
import type { JqFieldDeclaration } from '@tai42/jq-studio';

const OPEN_EVENT_BLURB =
  'The event that fired the hook. Its shape is defined by the topic, so treat it as an open document.';

/** `condition`: a jq that must return a boolean gating whether the hook fires. */
export const HOOK_CONDITION_DECLARATION: JqFieldDeclaration = {
  language: 'jq',
  shape: {
    id: 'tai42.hooks.condition',
    label: 'event',
    blurb: OPEN_EVENT_BLURB,
    keys: [],
    returns: 'true or false — the hook fires only when the condition returns true',
  },
};

/** `expr`: a jq that shapes the value passed to the tool before it runs. */
export const HOOK_EXPR_DECLARATION: JqFieldDeclaration = {
  language: 'jq',
  shape: {
    id: 'tai42.hooks.expr',
    label: 'event',
    blurb: OPEN_EVENT_BLURB,
    keys: [],
    returns: 'the value the hook shapes from the event before the tool runs',
  },
};

/** `key_expr`: a jq evaluated over the fire payload to the subject's string key. */
export const HOOK_SUBJECT_KEY_DECLARATION: JqFieldDeclaration = {
  language: 'jq',
  shape: {
    id: 'tai42.hooks.subject_key',
    label: 'event',
    blurb: OPEN_EVENT_BLURB,
    keys: [],
    returns: 'a non-empty string — the subject key the fire keys its state writes to',
  },
};
