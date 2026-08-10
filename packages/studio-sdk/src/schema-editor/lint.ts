/**
 * The pure parse + structural lint behind the `SchemaEditor` module. It never throws:
 * a malformed value IS the result it reports. Full meta-schema validation stays
 * server-side (the backend 400s carry the detail); this is the fast, loud client
 * guard that keeps an obviously-broken schema from ever leaving the dialog.
 */

/** The parse/lint outcome for one editor text buffer. */
export interface SchemaLintResult {
  /**
   * The parsed schema dict when the text is a syntactically valid JSON object, or
   * `null` when the text is empty or does not parse. Carries the parsed object even
   * when a lint (e.g. a missing `title`) fails, so the preview can still show the
   * authored shape — the consumer gates on {@link valid}, never on this alone.
   */
  readonly schema: Record<string, unknown> | null;
  /**
   * True when the text is empty or a valid schema. False when the text is non-empty
   * but fails to parse or fails a structural lint — the consumer blocks submit.
   */
  readonly valid: boolean;
  /** A loud, human-readable message when {@link valid} is false; else `undefined`. */
  readonly error: string | undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse and structurally lint a JSON-Schema editor buffer.
 *
 *  - Empty text is VALID (an unset, optional schema) with a `null` schema.
 *  - Malformed JSON is INVALID; the parser message is surfaced verbatim.
 *  - A top-level value that is not a JSON object (an array or a scalar) is INVALID.
 *  - When `requireTitle`, a top-level string `"title"` is REQUIRED (the
 *    `response_format` contract the backend enforces); its absence is INVALID.
 *
 * The parsed object is returned untouched — no key is normalized, reordered, or
 * dropped — so a schema carrying `$defs`/`anyOf` round-trips exactly.
 */
export function lintSchemaText(text: string, requireTitle: boolean): SchemaLintResult {
  const trimmed = text.trim();
  if (trimmed === '') return { schema: null, valid: true, error: undefined };

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return {
      schema: null,
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid JSON.',
    };
  }

  if (!isPlainObject(parsed)) {
    return { schema: null, valid: false, error: 'The schema must be a JSON object.' };
  }

  if (requireTitle && typeof parsed.title !== 'string') {
    return {
      schema: parsed,
      valid: false,
      error: 'A top-level "title" string is required for this schema.',
    };
  }

  return { schema: parsed, valid: true, error: undefined };
}
