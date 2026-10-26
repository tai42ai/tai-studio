/** Declarative settings-form schema response. */
import type { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';

// The settings form is auto-rendered from the declarative group/field description the
// skeleton emits from its typed settings models; the spec types each field, including
// the `value_source` that names which layer supplied the field's `value`.
export const settingsSchema = openapi.settingsSchemaView;
export type SettingsSchema = z.infer<typeof settingsSchema>;
