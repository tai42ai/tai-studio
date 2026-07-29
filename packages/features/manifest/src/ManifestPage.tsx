/**
 * `ManifestPage` — the feature entry the shell mounts at the `manifest` route.
 * Three SDK `<Tabs>` over the routers this feature owns: the loaded MANIFEST
 * view, the MCP server status + config, and the derived SUB-MCP servers. State is
 * server state, so each tab drives its own TanStack Query; this component owns no
 * data of its own.
 */
import { PageHeader, Stack, Tabs } from '@tai42/studio-sdk';
import type { PageProps } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { ManifestTab } from './tabs/ManifestTab';
import { McpTab } from './tabs/McpTab';
import { SubMcpTab } from './tabs/SubMcpTab';

// The `manifest` route carries no search params, so the
// passed props are unused; the typed parameter documents the shell → feature
// contract (the shell calls every page with `PageProps<token>`).
export function ManifestPage(_props: PageProps<'manifest'>): ReactNode {
  return (
    <Stack>
      <PageHeader eyebrow="Administration" title="Manifest" />
      <Tabs
        items={[
          { value: 'manifest', label: 'Manifest', content: <ManifestTab /> },
          { value: 'mcp', label: 'MCP', content: <McpTab /> },
          { value: 'sub-mcp', label: 'Sub-MCP', content: <SubMcpTab /> },
        ]}
      />
    </Stack>
  );
}
