/**
 * Ambient React contexts for the schema-form tree: the optional argument
 * completion provider and the default media-upload byte cap. A field deep in the
 * tree reads these here rather than every intermediate node drilling the prop.
 */
import { createContext } from 'react';

import { DEFAULT_MAX_UPLOAD_BYTES } from './media';
import type { CompletionProvider } from './SchemaForm';

// Ambient completion provider for the whole form. A string field deep in the
// tree reads it here rather than every intermediate node drilling the prop.
export const CompletionProviderContext = createContext<CompletionProvider | undefined>(undefined);

// Ambient default upload cap for the whole form; a media field reads it here so
// intermediate object/array nodes never drill the prop.
export const MaxUploadBytesContext = createContext<number>(DEFAULT_MAX_UPLOAD_BYTES);
