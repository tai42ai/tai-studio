/**
 * `ManifestPage` — the feature entry the shell mounts at the `manifest` route: the
 * loaded-manifest CONFIG ARTIFACT view, an Administration surface. The MCP server
 * status + config moved to the unified Connectors page and the derived sub-MCP
 * servers to the Served Endpoints page, so this page is now the single artifact
 * inspector. State is server state, so its one section drives its own TanStack Query;
 * this component owns no data of its own.
 */
import { PageHeader, Stack } from '@tai42/studio-sdk';
import type { PageProps } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

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
      <ManifestSectionsCard />
    </Stack>
  );
}
