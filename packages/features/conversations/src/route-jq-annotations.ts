/**
 * The `x-tai42-expression` annotations the route form's door-contract jq fields carry —
 * a hand mirror of the contract's route annotations (the jq variables they declare). Each states
 * what `.` is, the named variables the field reads ($parked on the four door jqs;
 * $turn/$asks/$parked on the reply), and the accepted result shape. Kept apart from the
 * schema builder so the schema module stays focused on structure.
 */

/** The `$parked` variable every door jq reads beside its `.`, a hand mirror of the
 * contract's PARKED variable (name, blurb, sample). */
const PARKED_VARIABLE = {
  name: 'parked',
  blurb:
    "The run's currently parked interactions on this route's subject — each entry as list_parked returns it, with its id, status, to, asked_by, question and answer-format fields.",
  sample: [
    {
      id: 'i-42',
      status: 'asking',
      to: 'caller',
      asked_by: ['main'],
      question: 'proceed?',
      answer_format: 'confirm',
      group_id: 'g-1',
    },
  ],
} as const;

/** The top-level keys of `.` for the four door jqs — the inbound conversation turn. */
const INBOUND_TURN_KEYS = [
  { name: 'message', gloss: 'the inbound message text' },
  { name: 'sender', gloss: 'the caller / end-user address the turn came from' },
  { name: 'our_identity', gloss: 'the identity the medium reached us at (null on the api door)' },
  { name: 'channel', gloss: 'the channel name (null on the api door)' },
  { name: 'person_id', gloss: 'the linked person id, when the sender is a paired person' },
  { name: 'person_addresses', gloss: "the linked person's known addresses, when paired" },
  { name: 'params', gloss: 'opaque caller-supplied entry params, when present' },
  {
    name: 'messages',
    gloss:
      'under deliver: all, every message this turn carries, oldest first — each {id, text, accepted_at} plus form, attachments and location when present',
  },
  {
    name: 'superseded',
    gloss:
      "under deliver: all, the earlier messages this turn's lead superseded or carried, oldest first — each in the same shape as messages, present only when non-empty",
  },
] as const;

const INBOUND_TURN_BLURB =
  "The inbound conversation turn the four door jqs receive, with the run's parked interactions as $parked.";

/** One door jq annotation over the inbound turn: its own `blurb` and `returns`, the
 * shared inbound-turn keys, and `$parked`. */
function doorInputAnnotation(blurb: string, returns: string): Record<string, unknown> {
  return {
    language: 'jq',
    label: 'inbound turn',
    blurb,
    keys: INBOUND_TURN_KEYS,
    variables: [PARKED_VARIABLE],
    returns,
  };
}

// `start_expr` maps the turn to the started run's kwargs; cancel/resume/extras act on
// the parked interactions and the started run's extras. All four read `.` = the turn.
export const START_EXPR_ANNOTATION = doorInputAnnotation(
  'The inbound conversation turn. Map it to the JSON object of keyword arguments the started run is dispatched with.',
  "a JSON object dispatched as the started run's kwargs; null starts nothing",
);
export const CANCEL_EXPR_ANNOTATION = doorInputAnnotation(
  INBOUND_TURN_BLURB,
  'null (cancel nothing), a parked interaction id, or a list of ids to cancel',
);
export const RESUME_EXPR_ANNOTATION = doorInputAnnotation(
  INBOUND_TURN_BLURB,
  'null (resume nothing), {id, payload} to resume an ask with an answer, a bare id to take a waiting outcome, or a list of these',
);
export const EXTRAS_EXPR_ANNOTATION = doorInputAnnotation(
  INBOUND_TURN_BLURB,
  'the extras mapping handed to the started run; null for no extras',
);

/**
 * What `.` is for `reply_expr`: the started run's success result. The program maps
 * it to the participant-facing reply; it reads `$turn`, `$asks` and `$parked`.
 */
export const REPLY_EXPR_ANNOTATION = {
  language: 'jq',
  label: 'run result',
  blurb:
    "The started run's result (its success shape). Map it to the participant reply; a non-success terminal diverts to the turn's error outcome instead.",
  keys: [],
  variables: [
    {
      name: 'turn',
      blurb:
        "The turn ids and subject this reply answers ({id, inbound, subject}); null when an out-of-band delivery's originating record has aged out.",
      sample: { id: 'm-1', inbound: { id: 'i-1', kind: 'message', source: 'api' } },
    },
    {
      name: 'asks',
      blurb:
        "The run's caller-ask entries when it asked instead of finishing (each the full parked entry); an empty list on a plain result.",
      sample: [{ id: 'i-42', question: 'proceed?', answer_format: 'confirm' }],
    },
    PARKED_VARIABLE,
  ],
  returns: 'null (no reply), a string, or an array of reply parts',
} as const;
