/**
 * The attach form: pick a template (only those not yet attached), place it at an
 * object-level path, and set its parameter and up-front declaration values.
 * Declarations can also be edited later on the attachment.
 */
import type { StateTemplateListItem } from '@tai42/api-client';
import type { JsonSchema } from '@tai42/studio-sdk';
import {
  defaultValueForSchema,
  Field,
  FormDialog,
  NoFiniteValueError,
  SchemaForm,
  Select,
  useApi,
} from '@tai42/studio-sdk';
import { type ReactNode, useState } from 'react';

import {
  declarationsSchema,
  declaresAnything,
  objectLevelPaths,
  paramsSchema,
} from './stateTemplateSchemas';

/** A template's starting parameter and declaration values. */
interface AttachmentSeed {
  readonly params: unknown;
  readonly declarations: unknown;
}

/**
 * Seed a chosen template's parameter and declaration values, or the message saying
 * why it cannot be attached: a schema that admits no finite value has no value the
 * user could ever submit. Any other error propagates.
 */
function seedAttachment(
  name: string,
  template: StateTemplateListItem | undefined,
): AttachmentSeed | string {
  try {
    const declarations = declarationsSchema(template);
    return {
      params: defaultValueForSchema(paramsSchema(template)),
      declarations: declarations === null ? {} : defaultValueForSchema(declarations),
    };
  } catch (error) {
    if (!(error instanceof NoFiniteValueError)) throw error;
    console.error(`Template '${name}' cannot be attached`, error);
    return `Template '${name}' cannot be attached: ${error.message}`;
  }
}

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
  const [templateError, setTemplateError] = useState<string | undefined>(undefined);
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
      <Field label="Template" error={templateError}>
        <Select
          value={template}
          onValueChange={(next) => {
            // A template that cannot be seeded is refused: the choice stays as it was
            // and the field says why.
            const seed = seedAttachment(
              next,
              templates.find((t) => t.name === next),
            );
            if (typeof seed === 'string') {
              setTemplateError(seed);
              return;
            }
            setTemplateError(undefined);
            setTemplate(next);
            setParams(seed.params);
            setDeclarations(seed.declarations);
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
