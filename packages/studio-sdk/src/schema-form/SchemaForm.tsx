/**
 * `SchemaForm` — the controlled, JSON-Schema-driven auto-form. Given a schema
 * (as Pydantic v2 emits) plus a value and `onChange`, it renders the form and
 * emits a plain JS value; the CALLER owns the submit button. It is the
 * load-bearing renderer reused by the tools run panel and the interactions form
 * answer format, which is why it lives in the SDK (features cannot import each
 * other).
 *
 * SAFETY: every schema-derived string (title, description, enum label, notice)
 * is rendered as TEXT through the DS components — React escapes it. No markdown,
 * no HTML, no `dangerouslySetInnerHTML` sink ever touches a schema-supplied
 * string. Pinned by a test.
 *
 * MEDIA UPLOADS: a string field renders as a file-upload / drag-drop control
 * (instead of a text box) when its schema carries media annotations, so an
 * image/file input stays a JSON-serializable string that round-trips through the
 * normal submit path. The annotation contract:
 *   - `contentEncoding: "base64"` + `contentMediaType` (e.g. `"image/*"`,
 *     `"application/pdf"`) → the emitted value is the raw base64 body (no
 *     `data:` prefix); `contentMediaType` also constrains the accepted MIME.
 *   - `format: "data-url"` (optionally with `contentMediaType`) → the emitted
 *     value is a full `data:<mime>;base64,<body>` URL.
 *   - `contentMaxBytes` pins a per-field size cap (bytes); otherwise the
 *     {@link SchemaFormProps.maxUploadBytes} prop, else {@link DEFAULT_MAX_UPLOAD_BYTES}.
 * An over-cap value or a MIME that does not match `contentMediaType` is REJECTED
 * with a visible error — never silently truncated or accepted. The cap holds on
 * EVERY input path (file picker, the paste fallback, and `validateAgainstSchema`),
 * measured against the value's DECODED byte size. A text fallback (paste a
 * URL/base64) stays available. The uploaded filename renders ESCAPED.
 *
 * `contentMaxBytes` is a NONSTANDARD JSON-Schema extension keyword (a standard
 * validator ignores it); these client-side caps are UX guards, and the SERVER
 * MUST independently validate the decoded size. The base64 decoding and cap
 * checks live in the sibling `media` module.
 */
import type { ReactNode } from 'react';

import { CompletionProviderContext, MaxUploadBytesContext } from './context';
import { FieldNode } from './field-node';
import { DEFAULT_MAX_UPLOAD_BYTES } from './media';
import { stackStyle } from './styles';
import type { JsonSchema, SchemaFormErrors } from './types';

// -- Public API --------------------------------------------------------------

/**
 * Fetch argument-value suggestions for a string field. `argName` is the field's
 * path within the form (a property key at the root, a dotted path when nested);
 * `partial` is the value typed so far. The caller owns the source (e.g. an MCP
 * `completion/complete` call) — SchemaForm only routes string fields through the
 * completion-backed input when a provider is supplied.
 */
export type CompletionProvider = (argName: string, partial: string) => Promise<string[]>;

export interface SchemaFormProps {
  readonly schema: JsonSchema;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly errors?: SchemaFormErrors;
  readonly idPrefix?: string;
  /**
   * Optional. When supplied, every string field renders through the
   * completion-backed input (argument autocomplete); when omitted, string fields
   * render as a plain text input — the default, unchanged behaviour.
   */
  readonly completionProvider?: CompletionProvider;
  /**
   * Optional. Default byte cap for media-upload fields (see the module
   * doc-comment). A field's own `contentMaxBytes` annotation overrides it;
   * absent both, {@link DEFAULT_MAX_UPLOAD_BYTES} applies.
   */
  readonly maxUploadBytes?: number;
}

/**
 * Render a controlled form for `schema`. The root is usually an object (a tool's
 * input schema); a scalar/array/union root renders as a single field group.
 */
export function SchemaForm({
  schema,
  value,
  onChange,
  errors,
  idPrefix = 'schema-form',
  completionProvider,
  maxUploadBytes = DEFAULT_MAX_UPLOAD_BYTES,
}: SchemaFormProps): ReactNode {
  return (
    <CompletionProviderContext.Provider value={completionProvider}>
      <MaxUploadBytesContext.Provider value={maxUploadBytes}>
        <div style={stackStyle} data-testid={idPrefix}>
          <FieldNode
            schema={schema}
            root={schema}
            value={value}
            onChange={onChange}
            path=""
            label={undefined}
            required
            errors={errors}
            idPrefix={idPrefix}
          />
        </div>
      </MaxUploadBytesContext.Provider>
    </CompletionProviderContext.Provider>
  );
}
