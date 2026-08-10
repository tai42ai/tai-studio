/**
 * Ambient React contexts for the schema-form tree: the optional argument
 * completion provider and the default media-upload byte cap. A field deep in the
 * tree reads these here rather than every intermediate node drilling the prop.
 */
import { createContext } from 'react';
import type { ReactNode } from 'react';

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
