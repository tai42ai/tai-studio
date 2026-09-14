/**
 * The jq-condition side of the policy section: the JqAuthContext shape the inline
 * editor authors against, the sample-context parse rules, and the fail-closed
 * server-validate hook bound to the `validate-condition` guard.
 */
import { errorMessage, type useApi } from '@tai42/studio-sdk';
import { type JqInputShapeDescriptor, type ServerValidateHook } from '@tai42/jq-studio';

import { isPlainObject } from './policy-data';

/**
 * A `JqAuthContext` skeleton pre-seeding the sample-context editor, so the author
 * sees the exact shape enforcement evaluates the condition against
 * (`tai42_contract.access_control.models.JqAuthContext`).
 */
export const SAMPLE_CONTEXT_OBJECT: Record<string, unknown> = {
  sub: 'anon',
  scopes: [],
  identity: {},
  policy: {},
  context: {},
  request: {},
  system: {},
};
export const SAMPLE_CONTEXT_SKELETON = JSON.stringify(SAMPLE_CONTEXT_OBJECT, null, 2);

/**
 * Parse the sample-context editor. Blank means NO sample — the guard then only
 * compiles (its `result` is `null`). A non-blank value must be a JSON object;
 * bad JSON or a non-object throws a loud message that blocks the request (nothing
 * is sent to the guard).
 */
export function parseSampleContext(raw: string): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Invalid JSON: ${errorMessage(error)}`);
  }
  if (!isPlainObject(value)) {
    throw new Error('Invalid JSON: sample context must be a JSON object.');
  }
  return value;
}

/**
 * The LIVE sample the visual editor's Test panel seeds from: the sample-context
 * editor's current content parsed as an object, or `undefined` when it is blank or
 * malformed. Returning `undefined` is deliberate — JqField's `sampleInput`
 * precedence is live → `shape.sample` → blank, so a blank/bad editor falls back to
 * the static `CONDITION_SHAPE.sample` skeleton upstream rather than seeding Test
 * with junk. Exported so the seeding is unit-tested directly. See
 * {@link parseSampleContext} for the parse rules (this one swallows its throw).
 */
export function liveSampleInput(raw: string): unknown {
  try {
    return parseSampleContext(raw);
  } catch {
    return undefined;
  }
}

/** The `JqAuthContext` field paths the jq condition can read, shown as hints. */
export const JQ_CONTEXT_HINTS: readonly string[] = [
  '.sub',
  '.scopes',
  '.identity.*',
  '.policy.*',
  '.context.*',
  '.request.path',
  '.request.method',
  '.system.time',
];

/**
 * What `.` IS for the inline jq condition: the `JqAuthContext` enforcement evaluates
 * it against. Handed to the `JqField` `shape` prop so the visual editor offers path
 * suggestions/context chips and seeds its Test panel from the static skeleton
 * (`tai42_contract.access_control.models.JqAuthContext`). Exported so the field's
 * wiring is unit-tested directly rather than through the editor UI.
 */
export const CONDITION_SHAPE: JqInputShapeDescriptor = {
  id: 'tai42.access-control.jq-auth-context',
  label: 'auth context',
  blurb: 'The JqAuthContext the access-control condition is evaluated against at enforcement.',
  keys: [
    { name: 'sub', gloss: 'the caller subject id' },
    { name: 'scopes', gloss: 'the granted scopes (array of strings)' },
    { name: 'identity', gloss: 'identity claims, read as .identity.*' },
    { name: 'policy', gloss: 'the key policy_data, read as .policy.*' },
    { name: 'context', gloss: 'request-time context, read as .context.*' },
    { name: 'request', gloss: 'the request — .request.path, .request.method' },
    { name: 'system', gloss: 'system values — .system.time' },
  ],
  returns: 'true or false — the request is allowed when the condition returns true',
  sample: SAMPLE_CONTEXT_OBJECT,
};

/**
 * The `JqField` `serverValidate` hook for the inline jq condition, bound to the
 * client: the SAME fail-closed `validate-condition` guard the inline Test button
 * hits, so the visual editor validates against exactly what enforcement evaluates.
 * A non-object sample compiles-only (no `sample_context`); a 400 maps to the guard's
 * verbatim message. Exported so the guard mapping is unit-tested directly.
 */
export function makeConditionServerValidate(api: ReturnType<typeof useApi>): ServerValidateHook {
  return async ({ expression, sampleInput }) => {
    try {
      const sample = isPlainObject(sampleInput) ? sampleInput : undefined;
      const result = await api.validateCondition(
        sample === undefined
          ? { condition: expression }
          : { condition: expression, sample_context: sample },
      );
      return {
        ok: result.ok,
        compiles: result.ok,
        message:
          result.result === null
            ? undefined
            : result.result
              ? 'allows the sample'
              : 'denies the sample',
      };
    } catch (error) {
      return { ok: false, compiles: false, message: errorMessage(error) };
    }
  };
}
