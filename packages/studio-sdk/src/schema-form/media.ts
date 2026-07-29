/**
 * Shared byte-cap logic for media-upload string fields, used by EVERY path that
 * can set a media field's value: the file picker, the "paste a value" fallback,
 * and the pre-submit validation pass. Centralised here so the effective cap and
 * the decoded byte size are computed IDENTICALLY on all three paths.
 *
 * `contentMaxBytes` is a NONSTANDARD JSON-Schema extension keyword — a standard
 * JSON-Schema validator ignores it. These client-side caps are UX guards that
 * fail LOUDLY and early on the obvious over-cap input; they are NOT a security
 * boundary. The SERVER MUST independently validate the decoded size of any
 * uploaded content.
 */

/**
 * Default cap for a media-upload field when neither the schema's `contentMaxBytes`
 * nor the host's `maxUploadBytes` prop pins one. 10 MiB comfortably fits a typical
 * image or PDF while still rejecting a runaway upload loudly.
 */
export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Resolve the effective byte cap for a media field. Precedence: the schema's
 * per-field `contentMaxBytes` wins (the only channel by which the schema-authoring
 * party states a per-field cap), else the host's `maxUploadBytes` default, else
 * {@link DEFAULT_MAX_UPLOAD_BYTES}.
 */
export function effectiveMaxBytes(
  fieldCap: number | undefined,
  propCap: number | undefined,
): number {
  return fieldCap ?? propCap ?? DEFAULT_MAX_UPLOAD_BYTES;
}

/**
 * The DECODED byte size of a media field's string value. The value is either a
 * raw base64 body or a full `data:<mime>;base64,<body>` URL; the cap applies to
 * the decoded bytes, never the character length. Computed arithmetically from the
 * base64 length and its `=` padding, so an over-cap value is caught without
 * allocating the decoded buffer and without throwing on a malformed input.
 */
export function decodedByteSize(value: string): number {
  // A data-url carries the base64 body after the first comma; a bare base64 value
  // is the body itself.
  const comma = value.indexOf(',');
  const body = value.startsWith('data:') && comma >= 0 ? value.slice(comma + 1) : value;
  // base64 decodes 4 chars → 3 bytes; drop whitespace and subtract the trailing
  // `=` padding the encoder added.
  const compact = body.replace(/\s/g, '');
  if (compact === '') return 0;
  const padding = compact.endsWith('==') ? 2 : compact.endsWith('=') ? 1 : 0;
  return Math.floor((compact.length * 3) / 4) - padding;
}

/** Human-readable byte size for a cap/overage message (`5 B`, `1.5 KB`, `2.0 MB`). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * The loud, user-visible over-cap message, identical across the picker, the paste
 * fallback, and validation. `subject` names the rejected input (e.g. a quoted
 * filename, or `"The pasted value"`).
 */
export function overCapMessage(subject: string, actualBytes: number, maxBytes: number): string {
  return `${subject} is ${formatBytes(actualBytes)}, over the ${formatBytes(maxBytes)} limit.`;
}
