/** Declarative settings-form schema response. */
import { z } from 'zod';

import { jsonValue } from './shared';

// The settings form is auto-rendered from a declarative group/field description
// the skeleton emits from its typed settings models.

export const settingsSchema = z.object({
  groups: z.array(
    z.object({
      name: z.string(),
      module: z.string(),
      qualname: z.string(),
      fields: z.array(
        z.object({
          name: z.string(),
          env_var: z.string(),
          type: z.string(),
          default: jsonValue.nullable(),
          required: z.boolean(),
          secret: z.boolean(),
          description: z.string().nullable(),
          nested_group: z.string().nullable(),
          default_namespace_var: z.string().nullable(),
          value: jsonValue.nullable(),
        }),
      ),
    }),
  ),
});
export type SettingsSchema = z.infer<typeof settingsSchema>;
