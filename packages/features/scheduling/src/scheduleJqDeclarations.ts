/**
 * The four door-contract jq field declarations the add-schedule form authors: a
 * schedule can drive a parkable run, so `start_expr` builds the fired tool's kwargs,
 * `cancel_expr` / `resume_expr` act on the run's parked interactions, and
 * `extras_expr` builds the started run's extras. Each evaluates over the schedule's
 * fired tool ARGUMENTS and reads the run's currently parked interactions as `$parked`
 * (a hand mirror of the contract's PARKED variable). There is no author-time
 * validate endpoint for a schedule spec, so none wires `serverValidate`.
 */
import type { JqFieldDeclaration, JqVariableDescriptor } from '@tai42/jq-studio';

const ARGUMENTS_BLURB =
  "The schedule's fired tool arguments. Map them to the value each door jq consumes.";

/** The `$parked` variable the four door jqs read beside the arguments `.`. */
const PARKED_VARIABLE: JqVariableDescriptor = {
  name: 'parked',
  blurb:
    "The run's currently parked interactions on the schedule's subject — each with its id, status, to, asked_by, question and answer-format fields.",
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

/** `start_expr`: builds the fired tool's kwargs from the stored arguments. */
export const SCHEDULE_START_EXPR_DECLARATION: JqFieldDeclaration = {
  language: 'jq',
  shape: {
    id: 'tai42.schedules.start_expr',
    label: 'arguments',
    blurb: ARGUMENTS_BLURB,
    keys: [],
    returns: "the fired tool's kwargs; blank fires the stored arguments, null starts nothing",
    variables: [PARKED_VARIABLE],
  },
};

/** `cancel_expr`: names the parked interactions to cancel. */
export const SCHEDULE_CANCEL_EXPR_DECLARATION: JqFieldDeclaration = {
  language: 'jq',
  shape: {
    id: 'tai42.schedules.cancel_expr',
    label: 'arguments',
    blurb: ARGUMENTS_BLURB,
    keys: [],
    returns: 'null (cancel nothing), a parked interaction id, or a list of ids to cancel',
    variables: [PARKED_VARIABLE],
  },
};

/** `resume_expr`: names the parked interactions to resume with an answer or take. */
export const SCHEDULE_RESUME_EXPR_DECLARATION: JqFieldDeclaration = {
  language: 'jq',
  shape: {
    id: 'tai42.schedules.resume_expr',
    label: 'arguments',
    blurb: ARGUMENTS_BLURB,
    keys: [],
    returns:
      'null (resume nothing), {id, payload} to resume an ask with an answer, a bare id to take a waiting outcome, or a list of these',
    variables: [PARKED_VARIABLE],
  },
};

/** `extras_expr`: builds the extras mapping handed to the started run. */
export const SCHEDULE_EXTRAS_EXPR_DECLARATION: JqFieldDeclaration = {
  language: 'jq',
  shape: {
    id: 'tai42.schedules.extras_expr',
    label: 'arguments',
    blurb: ARGUMENTS_BLURB,
    keys: [],
    returns: 'the extras mapping handed to the started run; null for no extras',
    variables: [PARKED_VARIABLE],
  },
};
