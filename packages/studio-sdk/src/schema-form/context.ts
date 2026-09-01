/**
 * Ambient React contexts for the schema-form tree: the optional argument
 * completion provider, the default media-upload byte cap, the record-entry value
 * renderer, and the expression-field door. A field deep in the tree reads these
 * here rather than every intermediate node drilling the prop.
 */
import { createContext } from 'react';
import type { ComponentType, ReactNode } from 'react';

import { DEFAULT_MAX_UPLOAD_BYTES } from './media';
import type { CompletionProvider } from './SchemaForm';
import type { JsonSchema } from './types';

// Ambient completion provider for the whole form. A string field deep in the
// tree reads it here rather than every intermediate node drilling the prop.
export const CompletionProviderContext = createContext<CompletionProvider | undefined>(undefined);

// Ambient default upload cap for the whole form; a media field reads it here so
// intermediate object/array nodes never drill the prop.
export const MaxUploadBytesContext = createContext<number>(DEFAULT_MAX_UPLOAD_BYTES);

/** One record entry, handed to a host-supplied value renderer. */
export interface RecordEntryContext {
  /** The entry's current key (may be blank/duplicate while the user edits). */
  readonly keyName: string;
  /** The entry value's form path (dotted from the form root). */
  readonly path: string;
  /** The entry value schema, as written (the renderer resolves any `$ref`). */
  readonly valueSchema: JsonSchema;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  /** The default value editor the record field would render for this entry. */
  readonly defaultField: ReactNode;
}

/**
 * A host-supplied per-entry value renderer for `record` fields — the injection
 * point a masked/secret editor (or any other value affordance) mounts through.
 * It returns the node to render in the entry's value slot; returning
 * `entry.defaultField` falls back to the built-in editor. Absent (the default),
 * every entry renders its `defaultField`.
 */
export type RecordEntryRenderer = (entry: RecordEntryContext) => ReactNode;

// Ambient record-entry value renderer for the whole form; the record field reads
// it here so intermediate object/array/record nodes never drill the prop.
export const RecordEntryRendererContext = createContext<RecordEntryRenderer | undefined>(undefined);

/** One top-level key of the expression's input document, with a one-line gloss. */
export interface ExpressionInputKey {
  readonly name: string;
  readonly gloss: string;
}

/**
 * What `.` IS for an expression-annotated field, as the form hands it to the
 * injected door. Built by the renderer from the schema's `x-tai42-expression`
 * annotation.
 *
 * Like the annotation type it is built from, this MIRRORS jq-studio's input-shape
 * descriptor without importing it: the schema-form tree names no jq type, in code
 * OR in its declarations, which is what keeps a consumer that never injects a door
 * free of the jq subgraph. `JqField` satisfies it structurally; a test pins that.
 */
export interface ExpressionInputShape {
  /** Stable, host-namespaced id, opaque to the door (memoisation/telemetry). */
  readonly id: string;
  /** Short chip label — what `.` is here, e.g. "node envelope". */
  readonly label: string;
  /** One sentence: what `.` is in this field. */
  readonly blurb: string;
  /** The top-level keys of `.`, each with a one-liner. */
  readonly keys: readonly ExpressionInputKey[];
  /** What the expression must RETURN, e.g. "true or false". */
  readonly returns: string;
  /** Per-field caveats. */
  readonly caveats?: readonly string[];
  /** A static skeleton of `.` for the door's test surface. */
  readonly sample?: unknown;
}

/**
 * Exactly the props the form hands an injected expression field — no more, so any
 * expression editor can satisfy the contract, and no less, so the form is free to
 * pass all of them. The label/description/error slots are the door's own chrome:
 * an expression field brings its a11y-linked label and helper slots, so the form
 * does NOT wrap it in the usual `Field`.
 */
export interface ExpressionFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly description?: ReactNode;
  readonly error?: ReactNode;
  readonly shape?: ExpressionInputShape;
  /** Render a multiline resting control; the form always asks for one. */
  readonly multiline?: boolean;
}

/**
 * The expression-authoring door a host INJECTS into the form — `JqField`, which the
 * host imports straight from `@tai42/jq-studio`.
 *
 * It is a COMPONENT, rendered as an element, never called as a function: the door
 * owns hooks and state (editor open, worker handle), which only survive as its own
 * element identity. A host may inject a `lazy` door to keep the jq subgraph in a
 * split chunk — the form mounts it inside a Suspense boundary that paints the
 * resting shell while that chunk resolves.
 */
// The injected reference must be STABLE across renders (a module-level
// component or memoized value): an inline arrow remounts the door — and drops
// its open-editor state — on every parent render.
export type ExpressionFieldComponent = ComponentType<ExpressionFieldProps>;

/**
 * The ambient door for the whole form. Absent (the default), an
 * expression-annotated field renders the PLAIN string input, byte-identically to
 * an unannotated one — the jq authoring door is opt-in, because the dynamic import
 * that would fetch it on demand still EMITS its chunks, worker, and wasm into
 * every consumer that bundles the SDK.
 *
 * A host wires it ONCE above its tree (`SchemaEditor`'s preview and
 * `ElicitationForm` render forms a caller does not own the props of, and a plugin
 * page renders its own); the form's own `expressionField` prop overrides it for a
 * single form.
 */
export const ExpressionFieldContext = createContext<ExpressionFieldComponent | undefined>(
  undefined,
);
