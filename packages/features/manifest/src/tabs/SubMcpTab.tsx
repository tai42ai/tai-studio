/**
 * SUB-MCP tab — the derived sub-MCP servers (`/api/sub-mcp`): a slug mapped to a
 * curated subset of tool names.
 *
 *  - LIST every entry with a DELETE control guarded by a confirm `<Dialog>`.
 *  - CREATE a new entry from a slug + a multi-select of tool names
 *    (`GET /api/tools`), posted with `POST /api/sub-mcp`.
 *
 * Every mutation invalidates `subMcpKey` so the list re-fetches.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  EmptyState,
  ErrorState,
  Field,
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
import { useState } from 'react';
import type { ReactNode, SyntheticEvent } from 'react';

import { subMcpAvailableToolsKey, subMcpKey } from '../keys';

/** Pull the tool-name list out of a sub-MCP entry, tolerating an absent/loose shape. */
function entryTools(entry: Record<string, unknown>): string[] {
  const tools = entry.tools;
  if (!Array.isArray(tools)) return [];
  return tools.filter((item): item is string => typeof item === 'string');
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
  entries: readonly [string, Record<string, unknown>][];
  onDelete: (slug: string) => void;
}): ReactNode {
  return (
    <ScrollRegion label="Sub-MCP servers">
      <Table>
        <THead>
          <TR>
            <TH>Slug</TH>
            <TH>Tools</TH>
            <TH>
              <span className="tai-visually-hidden">Actions</span>
            </TH>
          </TR>
        </THead>
        <TBody>
          {entries.map(([slug, entry]) => {
            const tools = entryTools(entry);
            return (
              <TR key={slug}>
                <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>{slug}</TD>
                <TD>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--tai-space-1)' }}>
                    {tools.length === 0 ? (
                      <span style={{ color: 'var(--tai-color-text-muted)' }}>none</span>
                    ) : (
                      tools.map((tool) => (
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
            );
          })}
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

  const [slug, setSlug] = useState('');
  const [selected, setSelected] = useState<readonly string[]>([]);
  const [slugError, setSlugError] = useState<string | undefined>(undefined);
  const [toolsError, setToolsError] = useState<string | undefined>(undefined);

  const create = useMutation({
    mutationFn: (input: { slug: string; tools: string[] }) =>
      api.createSubMcp(input.slug, input.tools),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: subMcpKey });
      setSlug('');
      setSelected([]);
    },
  });

  const toggleTool = (tool: string, checked: boolean): void => {
    setSelected((prev) =>
      checked ? [...prev, tool] : prev.filter((existing) => existing !== tool),
    );
  };

  const onSubmit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const trimmed = slug.trim();
    const nextSlugError = trimmed === '' ? 'A slug is required.' : undefined;
    const nextToolsError =
      selected.length === 0 ? 'Select at least one tool for the sub-MCP.' : undefined;
    setSlugError(nextSlugError);
    setToolsError(nextToolsError);
    if (nextSlugError !== undefined || nextToolsError !== undefined) return;
    create.mutate({ slug: trimmed, tools: [...selected] });
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
            style={{ margin: 0, fontSize: 'var(--tai-text-sm)', color: 'var(--tai-color-danger)' }}
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
