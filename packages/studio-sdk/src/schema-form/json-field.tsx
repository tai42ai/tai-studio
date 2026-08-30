/**
 * The free-form JSON field: the honest editor for a schema node the form has no
 * STRUCTURED control for — a property-less object, a bare `additionalProperties`-
 * open object, an items-less array, an empty/multi-type/`allOf` shape. Rather than
 * dead-end on an "Unsupported" badge (a value the user can see but not set), it
 * offers a mono textarea seeded with the current value pretty-printed and commits
 * the PARSED value through the same `onChange` a structured field uses.
 *
 * Validation is LOUD and local: the buffer must parse as JSON, and — when the
 * schema commits to a container (`jsonType` `'object'`/`'array'`) — the parsed
 * value must be that container. An invalid buffer shows an inline error and does
 * NOT commit, so a half-typed edit never writes a broken value through; the last
 * committed value stands until the buffer is valid again.
 *
 * The buffer is LOCAL state (an invalid buffer has no committed value to derive
 * from), resynced only when a DIFFERENT value arrives from the parent — the same
 * `lastEmitted` guard `record-field` uses, so a parent echoing our own commit back
 * does not clobber what is being typed.
 */
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { Field } from '../components/field';
import { Textarea } from '../components/inputs';
import { errorMessage } from '../errors';

/** The JSON container a `json` field commits to (see `classify`). */
type JsonType = 'object' | 'array' | 'any';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The current value as textarea text: pretty-printed JSON, or empty for absent. */
function serialize(value: unknown): string {
  return value === undefined ? '' : JSON.stringify(value, null, 2);
}

/**
 * The container constraint on a PARSED buffer, or `null` when it satisfies the
 * schema. `null` (the JSON literal) is rejected only when the schema is not
 * nullable — matching `validateAgainstSchema`, so the inline check and the
 * pre-submit check agree.
 */
function containerError(value: unknown, jsonType: JsonType, nullable: boolean): string | null {
  if (value === null) return nullable ? null : 'Must not be null.';
  if (jsonType === 'object' && !isPlainObject(value)) {
    return 'Must be a JSON object (e.g. {"key": "value"}).';
  }
  if (jsonType === 'array' && !Array.isArray(value)) {
    return 'Must be a JSON array (e.g. [1, 2, 3]).';
  }
  return null;
}

/** The muted hint's leading noun, so the user knows what a valid buffer must be. */
function hintNoun(jsonType: JsonType): string {
  if (jsonType === 'object') return 'JSON object';
  if (jsonType === 'array') return 'JSON array';
  return 'JSON';
}

export function JsonField({
  heading,
  description,
  error,
  jsonType,
  nullable,
  value,
  onChange,
}: {
  heading: string;
  description: string | undefined;
  error: string | undefined;
  jsonType: JsonType;
  nullable: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
}): ReactNode {
  // The last value THIS field emitted. A parent echoing our own commit back
  // passes it identity-equal, so the buffer (which may hold an invalid, un-
  // committed edit) survives; a parent that swaps in a different value resyncs it.
  const lastEmitted = useRef<unknown>(value);
  const [buffer, setBuffer] = useState<string>(() => serialize(value));
  const [parseError, setParseError] = useState<string | null>(null);
  if (value !== lastEmitted.current) {
    lastEmitted.current = value;
    setBuffer(serialize(value));
    setParseError(null);
  }

  const commit = (next: unknown): void => {
    lastEmitted.current = next;
    onChange(next);
  };

  const handleChange = (text: string): void => {
    setBuffer(text);
    // An empty buffer drops the value (emits `undefined`) — the same "absent
    // optional" affordance a cleared text field gives; a required field's
    // absence is then flagged by the pre-submit validator, not invented here.
    if (text.trim() === '') {
      setParseError(null);
      commit(undefined);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (thrown) {
      // Invalid JSON: surface it, and DO NOT commit — the last valid value stands.
      setParseError(`Invalid JSON: ${errorMessage(thrown)}`);
      return;
    }
    const container = containerError(parsed, jsonType, nullable);
    if (container !== null) {
      setParseError(container);
      return;
    }
    setParseError(null);
    commit(parsed);
  };

  return (
    <Field label={heading} description={description} error={parseError ?? error}>
      <Textarea
        value={buffer}
        onChange={(event) => {
          handleChange(event.target.value);
        }}
        rows={6}
        aria-label={`${heading} JSON`}
        className="tai-textarea-mono"
        spellCheck={false}
      />
      {/* A muted hint, never an error: the field is USABLE, it just has no
          structured schema to build a richer control from. */}
      <p className="tai-field-hint" style={{ margin: 0 }}>
        {`free-form ${hintNoun(jsonType)} — this field has no structured schema`}
      </p>
    </Field>
  );
}
