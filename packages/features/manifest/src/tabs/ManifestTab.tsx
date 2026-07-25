/**
 * MANIFEST tab — the skeleton's loaded manifest view (`GET /api/manifest`),
 * rendered as a collapsible `<JsonTree>`. Every value is escaped React text, so
 * a manifest carrying markup is displayed literally and never interpreted.
 */
import { useQuery } from '@tanstack/react-query';
import {
  EmptyState,
  ErrorState,
  JsonTree,
  Skeleton,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { manifestKey } from '../keys';

export function ManifestTab(): ReactNode {
  const api = useApi();
  const query = useQuery({
    queryKey: manifestKey,
    queryFn: ({ signal }) => api.getManifest(signal),
  });

  if (query.isPending) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <Skeleton height={20} width="12rem" />
        <Skeleton height={16} />
        <Skeleton height={16} width="80%" />
      </div>
    );
  }

  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }

  const { mcp, user_tools } = query.data;
  if (mcp.length === 0 && user_tools.length === 0) {
    return (
      <EmptyState
        title="The manifest is empty"
        description="No MCP servers or user tools are declared yet."
      />
    );
  }

  return <JsonTree data={query.data} />;
}
