/**
 * The preset's input and output contract fields: the input schema, the input map, the
 * output schema and the output map. Each is optional; the pairing, compile and render
 * rules are the server's. The schema descriptions vary by dialog (a create states what
 * the field is; a new version also says how to carry or drop the current value), so the
 * caller supplies them.
 */
import type { TemplatedText } from '@tai42/api-client';
import {
  BindingTemplatedJqField,
  SchemaEditor,
  type SchemaEditorDraft,
  type TemplatedTextCatalog,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

export interface PresetIoFieldsProps {
  readonly inputSchema: SchemaEditorDraft;
  readonly onInputSchemaChange: (change: SchemaEditorDraft) => void;
  readonly inputMap: TemplatedText | null;
  readonly onInputMapChange: (map: TemplatedText | null) => void;
  readonly outputSchema: SchemaEditorDraft;
  readonly onOutputSchemaChange: (change: SchemaEditorDraft) => void;
  readonly outputMap: TemplatedText | null;
  readonly onOutputMapChange: (map: TemplatedText | null) => void;
  readonly inputSchemaDescription: string;
  readonly outputSchemaDescription: string;
  /** The stored templates a map may reference. */
  readonly templates: TemplatedTextCatalog;
  /** Prefixes the two schema editors' ids (`<prefix>-input-schema`, `<prefix>-output-schema`). */
  readonly idPrefix: string;
}

export function PresetIoFields({
  inputSchema,
  onInputSchemaChange,
  inputMap,
  onInputMapChange,
  outputSchema,
  onOutputSchemaChange,
  outputMap,
  onOutputMapChange,
  inputSchemaDescription,
  outputSchemaDescription,
  templates,
  idPrefix,
}: PresetIoFieldsProps): ReactNode {
  return (
    <>
      <SchemaEditor
        value={inputSchema.schema}
        onChange={onInputSchemaChange}
        requireTitle={false}
        label="Input schema"
        description={inputSchemaDescription}
        idPrefix={`${idPrefix}-input-schema`}
      />

      <BindingTemplatedJqField
        label="Input map"
        value={inputMap}
        onChange={onInputMapChange}
        description="An optional jq program that turns the caller's input (.) into the base tool's arguments. $fixed holds the fixed kwargs."
        templates={templates}
      />

      <SchemaEditor
        value={outputSchema.schema}
        onChange={onOutputSchemaChange}
        requireTitle={false}
        label="Output schema"
        description={outputSchemaDescription}
        idPrefix={`${idPrefix}-output-schema`}
      />

      <BindingTemplatedJqField
        label="Output map"
        value={outputMap}
        onChange={onOutputMapChange}
        description="An optional jq program that reshapes the base tool's result (.) before the output schema is checked."
        templates={templates}
      />
    </>
  );
}
