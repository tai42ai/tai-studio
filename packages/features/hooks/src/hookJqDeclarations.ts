/**
 * The jq field declarations the register form authors against. `condition` gates
 * whether the hook fires; the four door-contract jqs drive the fired run —
 * `start_expr` builds the tool's kwargs, `cancel_expr` / `resume_expr` act on the
 * run's parked interactions, `extras_expr` builds the started run's extras — and the
 * subject `key_expr` derives the state subject key. Each evaluates against the event
 * that fired the hook, whose shape the topic defines — so every declaration carries
 * an OPEN document descriptor (no fixed keys) rather than inventing an envelope the
 * server does not promise. The four door jqs read the run's currently parked
 * interactions as `$parked` (a hand mirror of the contract's PARKED variable). There
 * is no author-time validate endpoint for a hook spec, so none wires `serverValidate`.
 */
import type { JqFieldDeclaration, JqVariableDescriptor } from '@tai42/jq-studio';

const OPEN_EVENT_BLURB =
  'The event that fired the hook. Its shape is defined by the topic, so treat it as an open document.';

/** The `$parked` variable the four door jqs read beside the event `.`. */
const PARKED_VARIABLE: JqVariableDescriptor = {
  name: 'parked',
  blurb:
    "The run's currently parked interactions on the hook's subject — each with its id, status, to, asked_by, question and answer-format fields.",
  keys: [],
  sample: [
    {
      id: 'i-42',
      status: 'asking',
      to: 'caller',
      asked_by: ['main'],
      question: 'proceed?',
      answer_format: 'confirm',
    },
  ],
};

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

/** `start_expr`: a jq that builds the fired tool's kwargs from the event. */
export const HOOK_START_EXPR_DECLARATION: JqFieldDeclaration = {
  language: 'jq',
  shape: {
    id: 'tai42.hooks.start_expr',
    label: 'event',
    blurb: OPEN_EVENT_BLURB,
    keys: [],
    returns: "the fired tool's kwargs; null starts nothing",
    variables: [PARKED_VARIABLE],
  },
};

/** `cancel_expr`: a jq naming the parked interactions to cancel. */
export const HOOK_CANCEL_EXPR_DECLARATION: JqFieldDeclaration = {
  language: 'jq',
  shape: {
    id: 'tai42.hooks.cancel_expr',
    label: 'event',
    blurb: OPEN_EVENT_BLURB,
    keys: [],
    returns: 'null (cancel nothing), a parked interaction id, or a list of ids to cancel',
    variables: [PARKED_VARIABLE],
  },
};

/** `resume_expr`: a jq naming the parked interactions to resume with an answer or take. */
export const HOOK_RESUME_EXPR_DECLARATION: JqFieldDeclaration = {
  language: 'jq',
  shape: {
    id: 'tai42.hooks.resume_expr',
    label: 'event',
    blurb: OPEN_EVENT_BLURB,
    keys: [],
    returns:
      'null (resume nothing), {id, payload} to resume an ask with an answer, a bare id to take a waiting outcome, or a list of these',
    variables: [PARKED_VARIABLE],
  },
};

/** `extras_expr`: a jq building the extras mapping handed to the started run. */
export const HOOK_EXTRAS_EXPR_DECLARATION: JqFieldDeclaration = {
  language: 'jq',
  shape: {
    id: 'tai42.hooks.extras_expr',
    label: 'event',
    blurb: OPEN_EVENT_BLURB,
    keys: [],
    returns: 'the extras mapping handed to the started run; null for no extras',
    variables: [PARKED_VARIABLE],
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
