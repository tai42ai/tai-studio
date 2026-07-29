/**
 * The tool-extensions surface: a read-only catalog of the skeleton's
 * registered extensions. Data comes from `api.listExtensions()` through TanStack
 * Query; the catalog is grouped into per-tool FAMILIES and each entry shows its
 * `kind` as a Badge. All server-supplied strings render as text (React escapes
 * them) — there is no HTML sink here.
 *
 * The four query states follow the convention: a <Skeleton> while loading, an
 * <EmptyState> when the catalog is empty, and a loud <ErrorState> on any failure
 * (a rejected request or a zod mismatch is always a visible error, never a silent
 * empty render).
 */
import { useQuery } from '@tanstack/react-query';
import type { CSSProperties, ReactNode } from 'react';

import type { Extension } from '@tai42/api-client';
import {
  AppLink,
  Badge,
  Card,
  ChevronRightIcon,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  errorMessage,
  groupIntoFamilies,
  kindVariant,
  useApi,
} from '@tai42/studio-sdk';
import type { ExtensionFamily, PageProps } from '@tai42/studio-sdk';

import { ApplyExtensionsPanel } from './apply-extensions';
import { extensionsQueryKey } from './keys';

export { extensionsQueryKey } from './keys';

const familyGridStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

const memberListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 'var(--tai-space-3) 0 0',
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-2)',
};

const memberRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-3)',
};

const memberNameStyle: CSSProperties = {
  fontFamily: 'var(--tai-font-mono)',
  fontSize: 'var(--tai-text-md)',
  color: 'var(--tai-color-text)',
  wordBreak: 'break-all',
};

// The family is keyed on its base TOOL name — a machine identifier, so mono.
const familyHeadingStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--tai-font-mono)',
  fontSize: 'var(--tai-text-lg)',
  color: 'var(--tai-color-text)',
};

const familyHeaderRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: 'var(--tai-space-3)',
  flexWrap: 'wrap',
};

const familyCountStyle: CSSProperties = {
  marginLeft: 'var(--tai-space-2)',
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
  fontWeight: 400,
};

/** A single extension entry: its (escaped) name and its `kind` Badge. */
export function ExtensionEntry({ extension }: { extension: Extension }): ReactNode {
  return (
    <li style={memberRowStyle}>
      <span style={memberNameStyle}>{extension.name}</span>
      <Badge variant={kindVariant(extension.kind)}>{extension.kind}</Badge>
    </li>
  );
}

/** One base tool and its branch variants, rendered as a titled card. */
export function ExtensionFamilyCard({ family }: { family: ExtensionFamily }): ReactNode {
  return (
    <Card>
      <div style={familyHeaderRowStyle}>
        <h2 style={familyHeadingStyle}>
          {family.base}
          <span style={familyCountStyle}>
            {family.members.length === 1
              ? '1 variant'
              : `${String(family.members.length)} variants`}
          </span>
        </h2>
        <AppLink
          to="tools"
          search={{ tool: family.base }}
          aria-label={`Author ${family.base} extension combos on the tools page`}
        >
          Author combos
          <ChevronRightIcon />
        </AppLink>
      </div>
      <ul style={memberListStyle}>
        {family.members.map((extension) => (
          <ExtensionEntry key={extension.name} extension={extension} />
        ))}
      </ul>
    </Card>
  );
}

/** The loading placeholder: a few skeleton cards standing in for families. */
function ExtensionsLoading(): ReactNode {
  return (
    <div style={familyGridStyle} data-testid="extensions-loading">
      {[0, 1, 2].map((row) => (
        <Card key={row}>
          <Skeleton width="30%" height={20} />
          <div style={{ marginTop: 'var(--tai-space-3)' }}>
            <Skeleton width="60%" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/**
 * The extensions page. The route carries no search parameters, so the props are
 * unused; the typed signature keeps it interchangeable with every other feature
 * page the shell mounts.
 */
// The `extensions` route carries no search params; the typed `_props` keeps this
// page's signature uniform with every other shell-mounted feature page.
export function ExtensionsPage(_props: PageProps<'extensions'>): ReactNode {
  const api = useApi();
  const query = useQuery({
    queryKey: extensionsQueryKey,
    queryFn: ({ signal }) => api.listExtensions(signal),
  });

  let body: ReactNode;
  if (query.isPending) {
    body = <ExtensionsLoading />;
  } else if (query.isError) {
    const { error } = query;
    body = <ErrorState message={errorMessage(error)} onRetry={() => void query.refetch()} />;
  } else if (query.data.length === 0) {
    body = (
      <EmptyState
        title="No tool extensions"
        description="This deployment has no registered extensions."
      />
    );
  } else {
    const families = groupIntoFamilies(query.data);
    body = (
      <div style={familyGridStyle}>
        {families.map((family) => (
          <ExtensionFamilyCard key={family.base} family={family} />
        ))}
      </div>
    );
  }

  return (
    <div className="tai-stack">
      <PageHeader title="Tool extensions" eyebrow="Capabilities" />

      <ApplyExtensionsPanel />

      <div style={familyGridStyle}>
        <h2 className="tai-section-title">Extension catalog</h2>
        {body}
      </div>
    </div>
  );
}
