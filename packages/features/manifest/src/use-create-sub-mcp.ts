/**
 * The view-model for the create-sub-MCP form: the tools/list queries, the form
 * state, the create mutation (a silent-swap upsert), and the slug-swap pre-check.
 */
import { useState, type SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@tai42/studio-sdk';

import { subMcpAvailableToolsKey, subMcpKey } from './keys';

export function useCreateSubMcp() {
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

  return {
    toolsQuery,
    slug,
    setSlug,
    selected,
    transport,
    setTransport,
    slugError,
    toolsError,
    confirmSwap,
    setConfirmSwap,
    toggleTool,
    trimmedSlug,
    wouldSwap,
    runCreate,
    onSubmit,
    create,
  };
}
