/**
 * The Templates tab. The top table lists this state's attachments (the template, its path
 * in the document, its parameter and declaration counts) with per-attachment
 * Edit-declarations and Detach icon actions. `Attach template` opens a form over the
 * picked template's parameter schema. Below, the state-template catalog lists every
 * platform template (name, description, how many states attach it, a Shipped column) with
 * an upload door; deleting a template is refused while any state still attaches it.
 */
import { useState, type ChangeEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AppLink,
  Badge,
  Button,
  ConfirmDialog,
  EditIcon,
  EmptyState,
  ErrorState,
  Field,
  FormDialog,
  Select,
  Skeleton,
  UnplugIcon,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  SchemaForm,
  TextInput,
  defaultValueForSchema,
  errorMessage,
  isFeatureDisabled,
  featureDisabledMessage,
  FeatureDisabled,
  useApi,
  type JsonSchema,
} from '@tai42/studio-sdk';
import {
  ApiError,
  type StateAttachmentBody,
  type StateDetail,
  type StateTemplateBody,
  type StateTemplateListItem,
  type StateAttachment,
} from '@tai42/api-client';

import { stateAttachmentsKey, stateDetailKey, stateTemplatesKey, statesListKey } from './keys';

/** A template's parameter descriptor read as a JSON Schema for the attach form. */
function paramsSchema(template: StateTemplateListItem | undefined): JsonSchema {
  if (template === undefined) return {};
  return template.parameters;
}

/**
 * A template's declaration schema — the shape of the static values an attachment stores —
 * read from the document's `declarations.schema`; `null`/absent means the template
 * declares nothing.
 */
function declarationsSchema(template: StateTemplateListItem | undefined): JsonSchema | null {
  const declarations = template?.declarations;
  if (declarations === null || declarations === undefined) return null;
  const schema = (declarations as { schema?: unknown }).schema;
  if (typeof schema !== 'object' || schema === null) return null;
  return schema as JsonSchema;
}

/** Whether a declaration schema carries at least one field to fill. */
function declaresAnything(schema: JsonSchema | null): schema is JsonSchema {
  return schema !== null && Object.keys(schema).length > 0;
}

/** One orphaned open record a reconcile refusal names, from the 422 body's structured payload. */
interface OrphanRecord {
  readonly subject: string;
  readonly kind: string;
  readonly id: string | null;
  readonly label: string | null;
}

/**
 * The orphaned records of a reconcile refusal, read from the 422's STRUCTURED body
 * (`{ reconcile: true, orphans: [{subject, kind, id, label}…] }`, spread onto the error
 * body by the states door). `null` for any other failure — the resolve step keys on this
 * data, never on the message prose.
 */
function reconcileOrphans(error: unknown): OrphanRecord[] | null {
  if (!(error instanceof ApiError) || error.status !== 422) return null;
  const body = error.body;
  if (typeof body !== 'object' || body === null) return null;
  const payload = body as { reconcile?: unknown; orphans?: unknown };
  if (payload.reconcile !== true || !Array.isArray(payload.orphans)) return null;
  return payload.orphans.map((raw) => {
    const entry = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    return {
      subject: typeof entry.subject === 'string' ? entry.subject : '',
      kind: typeof entry.kind === 'string' ? entry.kind : '',
      id: typeof entry.id === 'string' ? entry.id : null,
      label: typeof entry.label === 'string' ? entry.label : null,
    };
  });
}

/**
 * The object-level paths an attachment may land on — the document root (`[]`) plus every
 * nested object property, walked from the state's base schema. A template's fragment
 * composes onto an object, so only object levels are offered.
 */
function objectLevelPaths(schema: JsonSchema | undefined): string[][] {
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

export function TemplatesTab({ state }: { readonly state: StateDetail }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const templatesQuery = useQuery({
    queryKey: stateTemplatesKey,
    queryFn: ({ signal }) => api.listStateTemplates(signal),
  });

  const [attachOpen, setAttachOpen] = useState(false);
  const [detach, setDetach] = useState<string | null>(null);
  const [editAttachment, setEditAttachment] = useState<StateAttachment | null>(null);

  const invalidateState = (): void => {
    void queryClient.invalidateQueries({ queryKey: stateDetailKey(state.name) });
    void queryClient.invalidateQueries({ queryKey: statesListKey });
    void queryClient.invalidateQueries({ queryKey: stateAttachmentsKey(state.name) });
    // Attach/detach changes the catalog's server-derived `attached_to` count (and the
    // Delete gating that reads it), so the catalog query must refetch too.
    void queryClient.invalidateQueries({ queryKey: stateTemplatesKey });
  };

  const detachMutation = useMutation({
    mutationFn: (template: string) => api.detachStateTemplate(state.name, template),
    onSuccess: () => {
      setDetach(null);
      invalidateState();
    },
  });

  if (templatesQuery.isError && isFeatureDisabled(templatesQuery.error)) {
    return (
      <FeatureDisabled feature="States" message={featureDisabledMessage(templatesQuery.error)} />
    );
  }

  const templates = templatesQuery.data ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-5)' }}>
      <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--tai-space-2)',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Attachments</h3>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setAttachOpen(true);
            }}
          >
            Attach template
          </Button>
        </div>
        {state.attachments.length === 0 ? (
          <EmptyState
            title="No templates attached"
            description="Attach a template to add its structure, template jq and declarations to this state."
            action={
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setAttachOpen(true);
                }}
              >
                Attach template
              </Button>
            }
          />
        ) : (
          // Wide content (long paths, the actions cell) scrolls INSIDE the card rather
          // than clipping the split-view detail pane.
          <div style={{ overflowX: 'auto' }}>
            <Table>
              <THead>
                <TR>
                  <TH>Template</TH>
                  <TH>Path</TH>
                  <TH>Parameters</TH>
                  <TH>Declarations</TH>
                  <TH>Actions</TH>
                </TR>
              </THead>
              <TBody>
                {state.attachments.map((attachment) => (
                  <TR key={`${attachment.template}:${attachment.path.join('/')}`}>
                    <TD>
                      <Badge variant="primary">{attachment.template}</Badge>
                    </TD>
                    <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>
                      {attachment.path.length > 0 ? attachment.path.join(' / ') : '(root)'}
                    </TD>
                    <TD>{Object.keys(attachment.parameters).length}</TD>
                    <TD>{Object.keys(attachment.declarations).length}</TD>
                    <TD>
                      <div
                        style={{
                          display: 'flex',
                          gap: 'var(--tai-space-2)',
                          justifyContent: 'flex-end',
                          flexWrap: 'nowrap',
                        }}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label="Edit declarations"
                          title="Edit declarations"
                          onClick={() => {
                            setEditAttachment(attachment);
                          }}
                        >
                          <EditIcon aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label="Detach"
                          title="Detach"
                          style={{ color: 'var(--tai-color-danger)' }}
                          onClick={() => {
                            setDetach(attachment.template);
                          }}
                        >
                          <UnplugIcon aria-hidden="true" />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </section>

      <TemplateCatalog
        templates={templates}
        loading={templatesQuery.isPending}
        error={templatesQuery.error}
      />

      {attachOpen ? (
        <AttachTemplateDialog
          stateName={state.name}
          schema={state.schema}
          attachedTemplates={state.attachments.map((a) => a.template)}
          templates={templates}
          onClose={() => {
            setAttachOpen(false);
          }}
          onAttached={() => {
            setAttachOpen(false);
            invalidateState();
          }}
        />
      ) : null}

      {editAttachment !== null ? (
        <EditDeclarationsDialog
          stateName={state.name}
          attachment={editAttachment}
          template={templates.find((t) => t.name === editAttachment.template)}
          onClose={() => {
            setEditAttachment(null);
          }}
          onSaved={() => {
            setEditAttachment(null);
            invalidateState();
          }}
        />
      ) : null}

      {detach !== null ? (
        <ConfirmDialog
          title={`Detach '${detach}' from '${state.name}'?`}
          confirmLabel="Detach"
          pendingLabel="Detaching"
          confirmVariant="danger"
          isPending={detachMutation.isPending}
          error={detachMutation.error}
          onConfirm={() => {
            detachMutation.mutate(detach);
          }}
          onClose={() => {
            if (!detachMutation.isPending) setDetach(null);
          }}
        >
          The template&rsquo;s structure, template jq and declarations are removed from this state;
          stored data under the attachment path stays.
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

/**
 * The attach form: pick a template (only those not yet attached), place it at an
 * object-level path, and set its parameter and up-front declaration values. Declarations
 * can also be edited later on the attachment.
 */
function AttachTemplateDialog({
  stateName,
  schema: stateSchema,
  attachedTemplates,
  templates,
  onClose,
  onAttached,
}: {
  readonly stateName: string;
  readonly schema: JsonSchema;
  readonly attachedTemplates: readonly string[];
  readonly templates: readonly StateTemplateListItem[];
  readonly onClose: () => void;
  readonly onAttached: () => void;
}): ReactNode {
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

/** Edit one attachment's static declaration values, over the template's declarations schema. */
function EditDeclarationsDialog({
  stateName,
  attachment,
  template,
  onClose,
  onSaved,
}: {
  readonly stateName: string;
  readonly attachment: StateAttachment;
  readonly template: StateTemplateListItem | undefined;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactNode {
  const api = useApi();
  const schema = declarationsSchema(template);
  const [value, setValue] = useState<unknown>(attachment.declarations);
  // When the edit would orphan open records the server refuses with a 422 whose body
  // carries `{ reconcile: true, orphans: [{subject, kind, id, label}…] }`; the resolve
  // step keys on THAT structured data and the operator names a reconcile resolution.
  const [orphans, setOrphans] = useState<readonly OrphanRecord[] | null>(null);
  const [resolution, setResolution] = useState('');

  const onSubmit = async (): Promise<void> => {
    const body: StateAttachmentBody = {
      declarations: (value ?? {}) as Record<string, unknown>,
      // Once the refusal has surfaced, the retry carries the close directive.
      ...(orphans !== null ? { options: { orphans: 'close', resolution } } : {}),
    };
    try {
      await api.patchStateAttachment(stateName, attachment.template, body);
      onSaved();
    } catch (error) {
      // A reconcile refusal (open records the new declarations no longer cover) reveals
      // the resolve view from its STRUCTURED payload; any other error surfaces as-is. The
      // throw keeps the dialog open — FormDialog closes ONLY on a resolved submit.
      const found = reconcileOrphans(error);
      if (orphans === null && found !== null) setOrphans(found);
      throw error;
    }
  };

  return (
    <FormDialog
      title={`Edit declarations of '${attachment.template}'`}
      submitLabel={orphans !== null ? 'Close orphans and save' : 'Save changes'}
      pendingLabel="Saving"
      submitDisabled={orphans !== null && resolution.trim() === ''}
      onSubmit={onSubmit}
      onClose={onClose}
    >
      {declaresAnything(schema) ? (
        <SchemaForm schema={schema} value={value} onChange={setValue} />
      ) : (
        <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
          This template declares nothing.
        </p>
      )}
      {orphans !== null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-1)' }}>
            <h4 style={{ margin: 0, fontSize: 'var(--tai-text-sm)' }}>Open records to close</h4>
            <div style={{ overflowX: 'auto' }}>
              <Table>
                <THead>
                  <TR>
                    <TH>Subject</TH>
                    <TH>Kind</TH>
                    <TH>Item</TH>
                  </TR>
                </THead>
                <TBody>
                  {orphans.map((orphan) => (
                    <TR key={`${orphan.subject}:${orphan.kind}:${orphan.id ?? ''}`}>
                      <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>{orphan.subject}</TD>
                      <TD>{orphan.kind}</TD>
                      <TD>{orphan.label ?? orphan.id ?? '—'}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </div>
          </section>
          <Field
            label="Resolution"
            description="The reconcile resolution to close the orphaned records with."
          >
            <TextInput
              value={resolution}
              placeholder="A resolution the template's reconcile accepts"
              onChange={(event) => {
                setResolution(event.target.value);
              }}
            />
          </Field>
        </div>
      ) : null}
    </FormDialog>
  );
}

/** The state-template catalog: every platform template, with an upload door. */
function TemplateCatalog({
  templates,
  loading,
  error,
}: {
  readonly templates: readonly StateTemplateListItem[];
  readonly loading: boolean;
  readonly error: unknown;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteName, setDeleteName] = useState<string | null>(null);
  const [pendingReplace, setPendingReplace] = useState<{
    readonly name: string;
    readonly body: Record<string, unknown>;
  } | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (name: string) => api.deleteStateTemplate(name),
    onSuccess: () => {
      setDeleteName(null);
      void queryClient.invalidateQueries({ queryKey: stateTemplatesKey });
    },
  });

  const putTemplate = async (
    name: string,
    body: Record<string, unknown>,
    replace: boolean,
  ): Promise<void> => {
    await api.putStateTemplate(name, body as unknown as StateTemplateBody, replace);
    await queryClient.invalidateQueries({ queryKey: stateTemplatesKey });
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    setUploadError(null);
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('This file must be a JSON object.');
      }
      const body = parsed as Record<string, unknown>;
      const name = typeof body.name === 'string' ? body.name : '';
      if (name === '') throw new Error('This template document has no `name`.');
      // A first upload does not overwrite: a name clash (409) surfaces the deliberate
      // Replace confirm, and only a confirm retries with replace=true.
      try {
        await putTemplate(name, body, false);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          setPendingReplace({ name, body });
          return;
        }
        throw error;
      }
    } catch (uploadErr) {
      setUploadError(errorMessage(uploadErr));
    }
  };

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--tai-space-2)',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>State templates</h3>
        <label className="tai-btn" style={{ cursor: 'pointer' }}>
          Upload template
          <input
            type="file"
            accept=".json"
            style={{ display: 'none' }}
            onChange={(event) => void onFile(event)}
          />
        </label>
      </div>
      {uploadError !== null ? (
        <p role="alert" style={{ margin: 0, color: 'var(--tai-color-err-text)' }}>
          {uploadError}
        </p>
      ) : null}
      {loading ? (
        <Skeleton height={120} />
      ) : error !== null && error !== undefined ? (
        <ErrorState message={errorMessage(error)} />
      ) : templates.length === 0 ? (
        <EmptyState
          title="No templates yet"
          description="Upload a template document to give states a declared structure, template jq and declarations."
        />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Description</TH>
                <TH>Attached to</TH>
                <TH>Shipped</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {templates.map((template) => (
                <TR key={template.name}>
                  <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>
                    <AppLink
                      to="states"
                      search={{ template: template.name }}
                      aria-label={`Open template ${template.name}`}
                    >
                      {template.name}
                    </AppLink>
                  </TD>
                  <TD>{template.description || '—'}</TD>
                  <TD>{template.attached_to}</TD>
                  <TD>
                    {template.shipped_default ? (
                      <Badge variant="neutral">shipped default</Badge>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={template.attached_to > 0}
                      title={
                        template.attached_to > 0
                          ? 'Detach this template from every state before deleting it.'
                          : undefined
                      }
                      onClick={() => {
                        setDeleteName(template.name);
                      }}
                    >
                      Delete
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {deleteName !== null ? (
        <ConfirmDialog
          title={`Delete template '${deleteName}'?`}
          confirmLabel="Delete template"
          pendingLabel="Deleting"
          confirmVariant="danger"
          isPending={deleteMutation.isPending}
          error={deleteMutation.error}
          onConfirm={() => {
            deleteMutation.mutate(deleteName);
          }}
          onClose={() => {
            if (!deleteMutation.isPending) setDeleteName(null);
          }}
        >
          Deleting removes the document. This can not be undone.
        </ConfirmDialog>
      ) : null}

      {pendingReplace !== null ? (
        <ReplaceTemplateConfirm
          name={pendingReplace.name}
          onClose={() => {
            setPendingReplace(null);
          }}
          onReplace={async () => {
            await putTemplate(pendingReplace.name, pendingReplace.body, true);
            setPendingReplace(null);
          }}
        />
      ) : null}
    </section>
  );
}

/** The name-clash Replace confirm for a template upload; a failed replace renders in-dialog. */
function ReplaceTemplateConfirm({
  name,
  onClose,
  onReplace,
}: {
  readonly name: string;
  readonly onClose: () => void;
  readonly onReplace: () => Promise<void>;
}): ReactNode {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  return (
    <ConfirmDialog
      title={`Replace template '${name}'?`}
      confirmLabel="Replace template"
      pendingLabel="Replacing"
      cancelLabel="Keep existing"
      confirmVariant="danger"
      isPending={busy}
      error={error as Error | string | null}
      onConfirm={() => {
        setBusy(true);
        setError(null);
        onReplace().catch((err: unknown) => {
          setError(err);
          setBusy(false);
        });
      }}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      A template with this name exists. Replacing it rewrites the document; attached states keep
      their values and are re-validated.
    </ConfirmDialog>
  );
}
