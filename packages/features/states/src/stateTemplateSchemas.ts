/**
 * Schema readers for the template attach form: a template's parameter schema, its
 * declaration schema (the shape of the static values an attachment stores), whether a
 * declaration schema carries any field, and the object-level paths a fragment may land on.
 */
import type { StateTemplateListItem } from '@tai42/api-client';
import type { JsonSchema } from '@tai42/studio-sdk';

/** A template's parameter descriptor read as a JSON Schema for the attach form. */
export function paramsSchema(template: StateTemplateListItem | undefined): JsonSchema {
  if (template === undefined) return {};
  return template.parameters;
}

/**
 * A template's declaration schema, read from the document's `declarations.schema`;
 * `null`/absent means the template declares nothing.
 */
export function declarationsSchema(template: StateTemplateListItem | undefined): JsonSchema | null {
  const declarations = template?.declarations;
  if (declarations === null || declarations === undefined) return null;
  const schema = (declarations as { schema?: unknown }).schema;
  if (typeof schema !== 'object' || schema === null) return null;
  return schema as JsonSchema;
}

/** Whether a declaration schema carries at least one field to fill. */
export function declaresAnything(schema: JsonSchema | null): schema is JsonSchema {
  return schema !== null && Object.keys(schema).length > 0;
}

/**
 * The object-level paths an attachment may land on — the document root (`[]`) plus every
 * nested object property, walked from the state's resolved `effective_schema`. A template's
 * fragment composes onto an object, so only object levels are offered.
 */
export function objectLevelPaths(schema: JsonSchema | undefined): string[][] {
  const paths: string[][] = [[]];
  const walk = (node: JsonSchema | undefined, prefix: string[]): void => {
    const props = node?.properties;
    if (props === undefined) return;
    for (const [key, child] of Object.entries(props)) {
      const childSchema = child;
      if (childSchema.type === 'object' || childSchema.properties !== undefined) {
        const next = [...prefix, key];
        paths.push(next);
        walk(childSchema, next);
      }
    }
  };
  walk(schema, []);
  return paths;
}
