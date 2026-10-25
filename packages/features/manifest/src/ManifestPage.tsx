/**
 * `ManifestPage` — the feature entry the shell mounts at the `manifest` route, an
 * Administration surface. It holds the loaded manifest, the MCP server configuration and
 * status, the extension settings (loaded and declared) and the section doors. State is server state, so each section drives its
 * own TanStack Query; this component owns no data of its own.
 */
import type { PageProps } from '@tai42/studio-sdk';
import { PageHeader, Stack } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { McpServersSection } from './mcp/mcp-servers';
import { ManifestExtensionsCard } from './tabs/ManifestExtensionsCard';
import { ManifestSectionsCard } from './tabs/ManifestSectionsCard';
import { ManifestTab } from './tabs/ManifestTab';

// The `manifest` route carries no search params, so the passed props are unused; the
// typed parameter documents the shell → feature contract (the shell calls every page
// with `PageProps<token>`).
export function ManifestPage(_props: PageProps<'manifest'>): ReactNode {
  return (
    <Stack gap={6}>
      <PageHeader eyebrow="Administration" title="Manifest" />
      <ManifestTab />
      <McpServersSection />
      <ManifestExtensionsCard />
      <ManifestSectionsCard />
    </Stack>
  );
}
