/**
 * The Modules tab. The top table lists this state's mounts (the module, its path in the
 * document, its parameter and declaration counts) with per-mount Edit-declarations and
 * Unmount icon actions. `Mount module` opens a form over the picked module's parameter
 * schema. Below, the module-document catalog lists every platform module (name,
 * description, how many states mount it, a Shipped column) with an upload door; deleting
 * a module is refused while any state still mounts it.
 */
import { useState, type ChangeEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
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
  type StateDetail,
  type StateModuleBody,
  type StateModuleListItem,
  type StateMount,
} from '@tai42/api-client';

import { stateDetailKey, stateModulesKey, statesListKey } from './keys';

/** A module's parameter descriptor read as a JSON Schema for the mount form. */
function paramsSchema(module: StateModuleListItem | undefined): JsonSchema {
  if (module === undefined) return {};
  return module.parameters;
}

/**
 * A module's declaration schema — the shape of the static values a mount stores — read
 * from the document's `declarations.schema`; `null`/absent means the module declares
 * nothing.
 */
function declarationsSchema(module: StateModuleListItem | undefined): JsonSchema | null {
  const declarations = module?.declarations;
  if (declarations === null || declarations === undefined) return null;
  const schema = (declarations as { schema?: unknown }).schema;
  if (typeof schema !== 'object' || schema === null) return null;
  return schema as JsonSchema;
}

/** Whether a declaration schema carries at least one field to fill. */
function declaresAnything(schema: JsonSchema | null): schema is JsonSchema {
  return schema !== null && Object.keys(schema).length > 0;
}

/**
 * The object-level paths a mount may land on — the document root (`[]`) plus every
 * nested object property, walked from the state's base schema. A module's fragment
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

export function ModulesTab({ state }: { readonly state: StateDetail }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();

  const modulesQuery = useQuery({
    queryKey: stateModulesKey,
    queryFn: ({ signal }) => api.listStateModules(signal),
  });

  const [mountOpen, setMountOpen] = useState(false);
  const [unmount, setUnmount] = useState<string | null>(null);
  const [editMount, setEditMount] = useState<StateMount | null>(null);

  const invalidateState = (): void => {
    void queryClient.invalidateQueries({ queryKey: stateDetailKey(state.name) });
    void queryClient.invalidateQueries({ queryKey: statesListKey });
  };

  const unmountMutation = useMutation({
    mutationFn: (module: string) => api.unmountStateModule(state.name, module),
    onSuccess: () => {
      setUnmount(null);
      invalidateState();
    },
  });

  if (modulesQuery.isError && isFeatureDisabled(modulesQuery.error)) {
    return (
      <FeatureDisabled feature="States" message={featureDisabledMessage(modulesQuery.error)} />
    );
  }

  const modules = modulesQuery.data ?? [];

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
          <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Mounts</h3>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              setMountOpen(true);
            }}
          >
            Mount module
          </Button>
        </div>
        {state.mounts.length === 0 ? (
          <EmptyState
            title="No modules mounted"
            description="Mount a module to add its structure, writer rules and declarations to this state."
            action={
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  setMountOpen(true);
                }}
              >
                Mount module
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
                  <TH>Module</TH>
                  <TH>Path</TH>
                  <TH>Parameters</TH>
                  <TH>Declarations</TH>
                  <TH>Actions</TH>
                </TR>
              </THead>
              <TBody>
                {state.mounts.map((mount) => (
                  <TR key={`${mount.module}:${mount.path.join('/')}`}>
                    <TD>
                      <Badge variant="primary">{mount.module}</Badge>
                    </TD>
                    <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>
                      {mount.path.length > 0 ? mount.path.join(' / ') : '(root)'}
                    </TD>
                    <TD>{Object.keys(mount.parameters).length}</TD>
                    <TD>{Object.keys(mount.declarations).length}</TD>
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
                            setEditMount(mount);
                          }}
                        >
                          <EditIcon aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label="Unmount"
                          title="Unmount"
                          style={{ color: 'var(--tai-color-danger)' }}
                          onClick={() => {
                            setUnmount(mount.module);
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

      <ModuleCatalog
        modules={modules}
        loading={modulesQuery.isPending}
        error={modulesQuery.error}
      />

      {mountOpen ? (
        <MountModuleDialog
          stateName={state.name}
          schema={state.schema}
          mountedModules={state.mounts.map((m) => m.module)}
          modules={modules}
          onClose={() => {
            setMountOpen(false);
          }}
          onMounted={() => {
            setMountOpen(false);
            invalidateState();
          }}
        />
      ) : null}

      {editMount !== null ? (
        <EditDeclarationsDialog
          stateName={state.name}
          mount={editMount}
          module={modules.find((m) => m.name === editMount.module)}
          onClose={() => {
            setEditMount(null);
          }}
          onSaved={() => {
            setEditMount(null);
            invalidateState();
          }}
        />
      ) : null}

      {unmount !== null ? (
        <ConfirmDialog
          title={`Unmount '${unmount}' from '${state.name}'?`}
          confirmLabel="Unmount"
          pendingLabel="Unmounting"
          confirmVariant="danger"
          isPending={unmountMutation.isPending}
          error={unmountMutation.error}
          onConfirm={() => {
            unmountMutation.mutate(unmount);
          }}
          onClose={() => {
            if (!unmountMutation.isPending) setUnmount(null);
          }}
        >
          The module&rsquo;s structure, writer rules and declarations are removed from this state;
          stored data under the mount path stays.
        </ConfirmDialog>
      ) : null}
    </div>
  );
}

/**
 * The mount form: pick a module (only those not yet mounted), place it at an
 * object-level path, and set its parameter and up-front declaration values. Declarations
 * can also be edited later on the mount.
 */
function MountModuleDialog({
  stateName,
  schema: stateSchema,
  mountedModules,
  modules,
  onClose,
  onMounted,
}: {
  readonly stateName: string;
  readonly schema: JsonSchema;
  readonly mountedModules: readonly string[];
  readonly modules: readonly StateModuleListItem[];
  readonly onClose: () => void;
  readonly onMounted: () => void;
}): ReactNode {
  const api = useApi();
  const [module, setModule] = useState('');
  const [path, setPath] = useState('');
  const selected = modules.find((m) => m.name === module);
  const paramSchema = paramsSchema(selected);
  const declSchema = declarationsSchema(selected);
  const [params, setParams] = useState<unknown>({});
  const [declarations, setDeclarations] = useState<unknown>({});

  const available = modules.filter((m) => !mountedModules.includes(m.name));
  const pathOptions = objectLevelPaths(stateSchema).map((segments) => ({
    value: segments.join('/'),
    label: segments.length === 0 ? '(root)' : segments.join(' / '),
  }));

  const onSubmit = async (): Promise<void> => {
    const pathParts = path === '' ? [] : path.split('/');
    await api.mountStateModule(stateName, module, {
      path: pathParts,
      parameters: (params ?? {}) as Record<string, unknown>,
      declarations: (declarations ?? {}) as Record<string, unknown>,
    });
    onMounted();
  };

  return (
    <FormDialog
      title={`Mount module on '${stateName}'`}
      submitLabel="Mount"
      pendingLabel="Mounting"
      submitDisabled={module === ''}
      onSubmit={onSubmit}
      onClose={onClose}
    >
      <Field label="Module">
        <Select
          value={module}
          onValueChange={(next) => {
            setModule(next);
            const nextModule = modules.find((m) => m.name === next);
            setParams(defaultValueForSchema(paramsSchema(nextModule)));
            const nextDecl = declarationsSchema(nextModule);
            setDeclarations(nextDecl === null ? {} : defaultValueForSchema(nextDecl));
          }}
          aria-label="Module"
          placeholder="Choose a module"
          options={available.map((m) => ({ value: m.name, label: `${m.name} — ${m.description}` }))}
        />
      </Field>
      <Field
        label="Mount path"
        description="Where the module's fragment composes into the document."
      >
        <Select
          value={path}
          onValueChange={setPath}
          aria-label="Mount path"
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

/** Edit one mount's static declaration values, over the module's declarations schema. */
function EditDeclarationsDialog({
  stateName,
  mount,
  module,
  onClose,
  onSaved,
}: {
  readonly stateName: string;
  readonly mount: StateMount;
  readonly module: StateModuleListItem | undefined;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): ReactNode {
  const api = useApi();
  const schema = declarationsSchema(module);
  const [value, setValue] = useState<unknown>(mount.declarations);

  const onSubmit = async (): Promise<void> => {
    await api.patchStateMount(stateName, mount.module, {
      declarations: (value ?? {}) as Record<string, unknown>,
    });
    onSaved();
  };

  return (
    <FormDialog
      title={`Edit declarations of '${mount.module}'`}
      submitLabel="Save changes"
      pendingLabel="Saving"
      onSubmit={onSubmit}
      onClose={onClose}
    >
      {declaresAnything(schema) ? (
        <SchemaForm schema={schema} value={value} onChange={setValue} />
      ) : (
        <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
          This module declares nothing.
        </p>
      )}
    </FormDialog>
  );
}

/** The module-document catalog: every platform module, with an upload door. */
function ModuleCatalog({
  modules,
  loading,
  error,
}: {
  readonly modules: readonly StateModuleListItem[];
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
    mutationFn: (name: string) => api.deleteStateModule(name),
    onSuccess: () => {
      setDeleteName(null);
      void queryClient.invalidateQueries({ queryKey: stateModulesKey });
    },
  });

  const putModule = async (
    name: string,
    body: Record<string, unknown>,
    replace: boolean,
  ): Promise<void> => {
    await api.putStateModule(name, body as unknown as StateModuleBody, replace);
    await queryClient.invalidateQueries({ queryKey: stateModulesKey });
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
      if (name === '') throw new Error('This module document has no `name`.');
      // A first upload does not overwrite: a name clash (409) surfaces the deliberate
      // Replace confirm, and only a confirm retries with replace=true.
      try {
        await putModule(name, body, false);
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
        <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Module documents</h3>
        <label className="tai-btn" style={{ cursor: 'pointer' }}>
          Upload module
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
      ) : modules.length === 0 ? (
        <EmptyState
          title="No modules yet"
          description="Upload a module document to give states a declared structure, writer rules and declarations."
        />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Description</TH>
                <TH>Mounted on</TH>
                <TH>Shipped</TH>
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {modules.map((module) => (
                <TR key={module.name}>
                  <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>{module.name}</TD>
                  <TD>{module.description || '—'}</TD>
                  <TD>{module.mounted_on}</TD>
                  <TD>
                    {module.shipped_default ? (
                      <Badge variant="neutral">shipped default</Badge>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={module.mounted_on > 0}
                      title={
                        module.mounted_on > 0
                          ? 'Unmount this module from every state before deleting it.'
                          : undefined
                      }
                      onClick={() => {
                        setDeleteName(module.name);
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
          title={`Delete module '${deleteName}'?`}
          confirmLabel="Delete module"
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
        <ReplaceModuleConfirm
          name={pendingReplace.name}
          onClose={() => {
            setPendingReplace(null);
          }}
          onReplace={async () => {
            await putModule(pendingReplace.name, pendingReplace.body, true);
            setPendingReplace(null);
          }}
        />
      ) : null}
    </section>
  );
}

/** The name-clash Replace confirm for a module upload; a failed replace renders in-dialog. */
function ReplaceModuleConfirm({
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
      title={`Replace module '${name}'?`}
      confirmLabel="Replace module"
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
      A module with this name exists. Replacing it rewrites the document; mounted states keep their
      values and are re-validated.
    </ConfirmDialog>
  );
}
