/** Declarative settings-form schema response. */
import { z } from 'zod';

import * as openapi from '../generated/openapi-schemas';
import { jsonValue } from './shared';

// The settings form is auto-rendered from a declarative group/field description
// the skeleton emits from its typed settings models. Each field is hand-typed: the spec
// publishes a field as an open object.

const settingsField = z.object({
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
});

export const settingsSchema = openapi.settingsSchemaView.extend({
  groups: z.array(openapi.settingsGroupView.extend({ fields: z.array(settingsField) })),
});
export type SettingsSchema = z.infer<typeof settingsSchema>;
