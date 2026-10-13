/**
 * The contract's published `ConversationRouteCreate` document, read for the route form:
 * its two door variants, the overlap policy it references, and the validation constraints
 * of a document property in the form the SDK's `SchemaForm` validator reads.
 */
import { servedDocumentsJson } from '@tai42/api-client';
import type { JsonSchema, JsonSchemaType } from '@tai42/studio-sdk';

const ROUTE_DOCUMENT = servedDocumentsJson.ConversationRouteCreate;

/** The `api` door's variant of the route-create union. */
export const API_VARIANT = ROUTE_DOCUMENT.$defs.ApiConversationRouteCreate;
/** The `channel` door's variant of the route-create union. */
export const CHANNEL_VARIANT = ROUTE_DOCUMENT.$defs.ChannelConversationRouteCreate;
/** The overlap policy both variants carry. */
export const OVERLAP_POLICY = ROUTE_DOCUMENT.$defs.OverlapPolicy;

/** A document property: a schema, or the `anyOf` of a schema and `null` an optional field is. */
interface DocumentProperty {
  readonly type?: string;
  readonly anyOf?: readonly DocumentProperty[];
  readonly const?: unknown;
  readonly enum?: readonly unknown[];
  readonly pattern?: string;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly exclusiveMinimum?: number;
}

/** The property's own schema: the non-null member of an optional property's `anyOf`. */
function valueSchema(property: DocumentProperty): DocumentProperty {
  return property.anyOf?.find((member) => member.type !== 'null') ?? property;
}

/** The property's type, with `null` added for an optional (`anyOf` with `null`) property. */
function formType(property: DocumentProperty): JsonSchema {
  const type = valueSchema(property).type as JsonSchemaType | undefined;
  if (type === undefined) return {};
  const nullable = property.anyOf?.some((member) => member.type === 'null') ?? false;
  return { type: nullable ? [type, 'null'] : type };
}

/** The numeric bounds, an integer's `exclusiveMinimum` read as its `minimum`. */
function numberBounds(schema: DocumentProperty): JsonSchema {
  const minimum =
    schema.exclusiveMinimum !== undefined && schema.type === 'integer'
      ? schema.exclusiveMinimum + 1
      : schema.minimum;
  return {
    ...(minimum !== undefined ? { minimum } : {}),
    ...(schema.maximum !== undefined ? { maximum: schema.maximum } : {}),
  };
}

/** The value constraints: a const, an enum, and the string pattern and length bounds. */
function valueConstraints(schema: DocumentProperty): JsonSchema {
  return {
    ...(schema.const !== undefined ? { const: schema.const } : {}),
    ...(schema.enum !== undefined ? { enum: schema.enum } : {}),
    ...(schema.pattern !== undefined ? { pattern: schema.pattern } : {}),
    ...(schema.minLength !== undefined ? { minLength: schema.minLength } : {}),
    ...(schema.maxLength !== undefined ? { maxLength: schema.maxLength } : {}),
  };
}

/**
 * The validation constraints of a document property, in the form the SDK validator reads:
 * an optional (`anyOf` with `null`) property becomes its schema with `null` added to its
 * type, and an integer's `exclusiveMinimum` its `minimum`.
 */
export function documentConstraints(property: DocumentProperty): JsonSchema {
  const schema = valueSchema(property);
  return { ...formType(property), ...valueConstraints(schema), ...numberBounds(schema) };
}
