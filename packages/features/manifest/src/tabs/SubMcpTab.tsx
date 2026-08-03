/**
 * SUB-MCP tab — the derived sub-MCP servers (`/api/sub-mcp`): a slug mapped to a
 * curated subset of tool names served on a transport.
 *
 *  - LIST every entry with its transport and its concrete endpoint URL
 *    (`/app/{slug}`, copy-to-clipboard) plus a DELETE control guarded by a confirm
 *    `<Dialog>`.
 *  - CREATE a new entry from a slug + a multi-select of tool names
 *    (`GET /api/tools`) + a transport, posted with `POST /api/sub-mcp`. Register is
 *    a SILENT-SWAP upsert server-side, so a slug that already exists is flagged and
 *    the replacement is confirmed before the write.
 *
 * Every mutation invalidates `subMcpKey` so the list re-fetches.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SubMcpMount } from '@tai42/api-client';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  CopyField,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
  RadioGroup,
  ScrollRegion,
  Skeleton,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  TextInput,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import type { RadioOption } from '@tai42/studio-sdk';
import { useState } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';

import { subMcpAvailableToolsKey, subMcpKey } from '../keys';

/** The transports the sub-MCP build path supports end to end (`http` default). */
const TRANSPORT_OPTIONS: readonly RadioOption[] = [
  { value: 'http', label: 'HTTP' },
  { value: 'sse', label: 'SSE' },
  { value: 'stdio', label: 'stdio' },
];

/** The endpoint a registered sub-MCP is served under (`/app/{slug}`). */
function endpointFor(slug: string): string {
  return `/app/${slug}`;
}

function DeleteSubMcpDialog({
  slug,
  onConfirm,
}: {
  slug: string;
  onConfirm: (slug: string) => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={`Delete sub-MCP "${slug}"?`}
      description="This removes the derived sub-MCP server. This cannot be undone."
      trigger={
        <Button type="button" variant="danger">
          Delete
        </Button>
      }
    >
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-2)' }}>
        <Button
          type="button"
          onClick={() => {
            setOpen(false);
          }}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="danger"
          onClick={() => {
            onConfirm(slug);
            setOpen(false);
          }}
        >
          Delete
        </Button>
      </div>
    </Dialog>
  );
}

function SubMcpList({
  entries,
  onDelete,
}: {
  entries: readonly [string, SubMcpMount][];
  onDelete: (slug: string) => void;
}): ReactNode {
  return (
    <ScrollRegion label="Sub-MCP servers">
      <Table>
        <THead>
          <TR>
            <TH>Slug</TH>
            <TH>Transport</TH>
            <TH>Endpoint</TH>
            <TH>Tools</TH>
            <TH>
              <span className="tai-visually-hidden">Actions</span>
            </TH>
          </TR>
        </THead>
        <TBody>
          {entries.map(([slug, mount]) => (
            <TR key={slug}>
              <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>{slug}</TD>
              <TD>
                <Badge variant="neutral">{mount.transport}</Badge>
              </TD>
              <TD>
                <CopyField
                  value={endpointFor(slug)}
                  label={`Endpoint for ${slug}`}
                  idPrefix={`sub-mcp-endpoint-${slug}`}
                />
              </TD>
              <TD>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--tai-space-1)' }}>
                  {mount.tools.length === 0 ? (
                    <span style={{ color: 'var(--tai-color-text-muted)' }}>none</span>
                  ) : (
                    mount.tools.map((tool) => (
                      <Badge key={tool} variant="neutral">
                        {tool}
                      </Badge>
                    ))
                  )}
                </div>
              </TD>
              <TD>
                <DeleteSubMcpDialog slug={slug} onConfirm={onDelete} />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </ScrollRegion>
  );
}

function CreateSubMcpForm(): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const toolsQuery = useQuery({
    queryKey: subMcpAvailableToolsKey,
    queryFn: ({ signal }) => api.listTools(signal),
  });
  // The already-registered slugs, read from the shared list cache, drive the
  // slug-swap pre-check (register is a silent-swap upsert server-side).
  const listQuery = useQuery({
    queryKey: subMcpKey,
    queryFn: ({ signal }) => api.listSubMcp(signal),
  });
  const existingSlugs = new Set(Object.keys(listQuery.data ?? {}));

  const [slug, setSlug] = useState('');
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [transport, setTransport] = useState('http');
  const [slugError, setSlugError] = useState<string | undefined>(undefined);
  const [toolsError, setToolsError] = useState<string | undefined>(undefined);
  const [confirmSwap, setConfirmSwap] = useState(false);

  const create = useMutation({
    mutationFn: (input: { slug: string; tools: string[]; transport: string }) =>
      api.createSubMcp(input.slug, input.tools, input.transport),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: subMcpKey });
      setSlug('');
      setSelected([]);
      setTransport('http');
    },
  });

  const toggleTool = (tool: string, checked: boolean): void => {
    setSelected((prev) =>
      checked ? [...prev, tool] : prev.filter((existing) => existing !== tool),
    );
  };

  const trimmedSlug = slug.trim();
  const wouldSwap = trimmedSlug !== '' && existingSlugs.has(trimmedSlug);

  const runCreate = (): void => {
    create.mutate({ slug: trimmedSlug, tools: [...selected], transport });
  };

  const onSubmit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const nextSlugError = trimmedSlug === '' ? 'A slug is required.' : undefined;
    const nextToolsError =
      selected.length === 0 ? 'Select at least one tool for the sub-MCP.' : undefined;
    setSlugError(nextSlugError);
    setToolsError(nextToolsError);
    if (nextSlugError !== undefined || nextToolsError !== undefined) return;
    // A matching slug is a REPLACE, not an add — confirm before the swap.
    if (wouldSwap) {
      setConfirmSwap(true);
      return;
    }
    runCreate();
  };

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}
    >
      <Field
        label="Slug"
        description="The identifier for the new sub-MCP server."
        error={slugError}
      >
        <TextInput
          value={slug}
          onChange={(event) => {
            setSlug(event.currentTarget.value);
          }}
          placeholder="my-sub-mcp"
          autoComplete="off"
        />
      </Field>

      {wouldSwap && slugError === undefined ? (
        <p
          role="alert"
          style={{
            margin: 0,
            fontSize: 'var(--tai-text-sm)',
            color: 'var(--tai-color-warn-text)',
          }}
        >
          A sub-MCP named &ldquo;{trimmedSlug}&rdquo; already exists. Registering will replace it.
        </p>
      ) : null}

      <RadioGroup
        label="Transport"
        options={TRANSPORT_OPTIONS}
        value={transport}
        onValueChange={setTransport}
        orientation="horizontal"
        variant="segmented"
      />

      {/* A multi-select group. Not a single-control `Field`: several checkboxes
          cannot share one injected control id, so the label/description/error are
          rendered directly on the enclosing fieldset. */}
      <fieldset
        style={{
          border: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--tai-space-2)',
        }}
      >
        <legend style={{ padding: 0, fontSize: 'var(--tai-text-sm)', fontWeight: 600 }}>
          Tools
        </legend>
        <p
          style={{
            margin: 0,
            fontSize: 'var(--tai-text-sm)',
            color: 'var(--tai-color-text-muted)',
          }}
        >
          Choose the tools this sub-MCP exposes.
        </p>
        {toolsQuery.isPending ? (
          <Skeleton height={80} />
        ) : toolsQuery.isError ? (
          <ErrorState
            message={errorMessage(toolsQuery.error)}
            onRetry={() => void toolsQuery.refetch()}
          />
        ) : toolsQuery.data.length === 0 ? (
          <EmptyState title="No tools available" description="There are no tools to expose yet." />
        ) : (
          <div
            style={{
              border: '1px solid var(--tai-color-border)',
              borderRadius: 'var(--tai-radius-md)',
              padding: 'var(--tai-space-3)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--tai-space-2)',
              maxHeight: '16rem',
              overflowY: 'auto',
            }}
          >
            {toolsQuery.data.map((tool) => (
              <Checkbox
                key={tool}
                label={tool}
                checked={selected.includes(tool)}
                onCheckedChange={(checked) => {
                  toggleTool(tool, checked);
                }}
              />
            ))}
          </div>
        )}
        {toolsError !== undefined ? (
          <p
            role="alert"
            style={{
              margin: 0,
              fontSize: 'var(--tai-text-sm)',
              color: 'var(--tai-color-err-text)',
            }}
          >
            {toolsError}
          </p>
        ) : null}
      </fieldset>

      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-3)' }}>
        <Button type="submit" variant="primary" disabled={create.isPending}>
          {create.isPending ? <Spinner label="Creating sub-MCP" /> : null}
          Create sub-MCP
        </Button>
      </div>
      {create.isError ? <ErrorState message={errorMessage(create.error)} /> : null}

      {confirmSwap ? (
        <ConfirmDialog
          title="Replace existing sub-MCP?"
          confirmLabel="Replace sub-MCP"
          pendingLabel="Replacing"
          confirmVariant="danger"
          isPending={create.isPending}
          onConfirm={() => {
            setConfirmSwap(false);
            runCreate();
          }}
          onClose={() => {
            setConfirmSwap(false);
          }}
        >
          <p style={{ margin: 0 }}>
            {`A sub-MCP named “${trimmedSlug}” is already registered. Replacing it swaps its tools and transport for the ones above.`}
          </p>
        </ConfirmDialog>
      ) : null}
    </form>
  );
}

function SubMcpListSection(): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: subMcpKey,
    queryFn: ({ signal }) => api.listSubMcp(signal),
  });

  const remove = useMutation({
    mutationFn: (slug: string) => api.deleteSubMcp(slug),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: subMcpKey }),
  });

  if (query.isPending) return <Skeleton height={72} />;
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const entries = Object.entries(query.data);
  return (
    <>
      {entries.length === 0 ? (
        <EmptyState
          title="No sub-MCP servers"
          description="Create one below to expose a curated set of tools."
        />
      ) : (
        <SubMcpList
          entries={entries}
          onDelete={(slug) => {
            remove.mutate(slug);
          }}
        />
      )}
      {remove.isError ? (
        <div style={{ marginTop: 'var(--tai-space-3)' }}>
          <ErrorState message={errorMessage(remove.error)} />
        </div>
      ) : null}
    </>
  );
}

export function SubMcpTab(): ReactNode {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-6)' }}>
      <Card>
        <h2 style={{ margin: '0 0 var(--tai-space-3)', fontSize: 'var(--tai-text-md)' }}>
          Sub-MCP servers
        </h2>
        <SubMcpListSection />
      </Card>
      <Card>
        <h2 style={{ margin: '0 0 var(--tai-space-3)', fontSize: 'var(--tai-text-md)' }}>
          Create a sub-MCP
        </h2>
        <CreateSubMcpForm />
      </Card>
    </div>
  );
}
