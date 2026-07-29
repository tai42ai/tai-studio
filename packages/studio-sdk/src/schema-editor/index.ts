/**
 * Schema-editor — the shared, validated JSON-Schema authoring control. Public
 * surface: the `SchemaEditor` component, its change type, and the pure lint helper
 * consumers reuse to pre-check a stored schema.
 */
export { SchemaEditor } from './SchemaEditor';
export type { SchemaEditorProps, SchemaEditorChange } from './SchemaEditor';
export { lintSchemaText } from './lint';
export type { SchemaLintResult } from './lint';
