/**
 * Schema-editor — the shared, validated JSON-Schema authoring control. Public
 * surface: the `SchemaEditor` component, its change type, and the pure lint helper
 * consumers reuse to pre-check a stored schema.
 */
export type { SchemaLintResult } from './lint';
export { lintSchemaText } from './lint';
export type { SchemaEditorChange, SchemaEditorProps } from './SchemaEditor';
export { SchemaEditor } from './SchemaEditor';
