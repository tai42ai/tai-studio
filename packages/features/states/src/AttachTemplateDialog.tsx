/**
 * The attach form: pick a template (only those not yet attached), place it at an
 * object-level path, and set its parameter and up-front declaration values.
 * Declarations can also be edited later on the attachment.
 */
import { useState, type ReactNode } from 'react';
import {
  Field,
  FormDialog,
  Select,
  SchemaForm,
  defaultValueForSchema,
  useApi,
} from '@tai42/studio-sdk';
import type { JsonSchema } from '@tai42/studio-sdk';
import type { StateTemplateListItem } from '@tai42/api-client';

import {
  declarationsSchema,
  declaresAnything,
  objectLevelPaths,
  paramsSchema,
} from './stateTemplateSchemas';

export interface AttachTemplateDialogProps {
  readonly stateName: string;
  readonly schema: JsonSchema;
  readonly attachedTemplates: readonly string[];
  readonly templates: readonly StateTemplateListItem[];
  readonly onClose: () => void;
  readonly onAttached: () => void;
}

export function AttachTemplateDialog({
  stateName,
  schema: stateSchema,
  attachedTemplates,
  templates,
  onClose,
  onAttached,
}: AttachTemplateDialogProps): ReactNode {
  const api = useApi();
  const [template, setTemplate] = useState('');
  const [path, setPath] = useState('');
  const selected = templates.find((t) => t.name === template);
  const paramSchema = paramsSchema(selected);
  const declSchema = declarationsSchema(selected);
  const [params, setParams] = useState<unknown>({});
  const [declarations, setDeclarations] = useState<unknown>({});

  const available = templates.filter((t) => !attachedTemplates.includes(t.name));
  const pathOptions = objectLevelPaths(stateSchema).map((segments) => ({
    value: segments.join('/'),
    label: segments.length === 0 ? '(root)' : segments.join(' / '),
  }));

  const onSubmit = async (): Promise<void> => {
    const pathParts = path === '' ? [] : path.split('/');
    await api.attachStateTemplate(stateName, template, {
      path: pathParts,
      parameters: (params ?? {}) as Record<string, unknown>,
      declarations: (declarations ?? {}) as Record<string, unknown>,
    });
    onAttached();
  };

  return (
    <FormDialog
      title={`Attach template to '${stateName}'`}
      submitLabel="Attach"
      pendingLabel="Attaching"
      submitDisabled={template === ''}
      onSubmit={onSubmit}
      onClose={onClose}
    >
      <Field label="Template">
        <Select
          value={template}
          onValueChange={(next) => {
            setTemplate(next);
            const nextTemplate = templates.find((t) => t.name === next);
            setParams(defaultValueForSchema(paramsSchema(nextTemplate)));
            const nextDecl = declarationsSchema(nextTemplate);
            setDeclarations(nextDecl === null ? {} : defaultValueForSchema(nextDecl));
          }}
          aria-label="Template"
          placeholder="Choose a template"
          options={available.map((t) => ({ value: t.name, label: `${t.name} — ${t.description}` }))}
        />
      </Field>
      <Field
        label="Attachment path"
        description="Where the template's fragment composes into the document."
      >
        <Select
          value={path}
          onValueChange={setPath}
          aria-label="Attachment path"
          options={pathOptions}
        />
      </Field>
      {selected !== undefined && Object.keys(paramSchema).length > 0 ? (
        <Field label="Parameters" group>
          <SchemaForm schema={paramSchema} value={params} onChange={setParams} />
        </Field>
      ) : null}
      {selected !== undefined && declaresAnything(declSchema) ? (
        <Field label="Declarations" group>
          <SchemaForm schema={declSchema} value={declarations} onChange={setDeclarations} />
        </Field>
      ) : null}
    </FormDialog>
  );
}
