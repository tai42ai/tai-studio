/**
 * The tool-extensions surface: the apply-an-extension panel above a read-only
 * catalog of the skeleton's registered extensions, grouped by kind. Data comes
 * from `api.listExtensions()` through TanStack Query; the catalog is grouped with
 * the SDK's `groupByKind` (the same grouping the `ExtensionPicker` uses), one card
 * per kind with the kind as a Badge heading, the member count and, for a kind the
 * server serves as not `multiple`, the "one per tool" rule. All server-supplied
 * strings render as text (React escapes them) — there is no HTML sink here.
 *
 * The four query states follow the convention: a <Skeleton> while loading, an
 * <EmptyState> when the catalog is empty, and a loud <ErrorState> on any failure
 * (a rejected request or a zod mismatch is always a visible error, never a silent
 * empty render).
 */
import type { Extension } from '@tai42/api-client';
import type { ExtensionKindGroup, PageProps } from '@tai42/studio-sdk';
import {
  AppLink,
  Badge,
  Card,
  EmptyState,
  errorMessage,
  ErrorState,
  groupByKind,
  kindVariant,
  PageHeader,
  Skeleton,
  useApi,
} from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import type { CSSProperties, ReactNode } from 'react';

import { ApplyExtensionsPanel } from './apply-extensions';
import { extensionsQueryKey } from './keys';

export { extensionsQueryKey } from './keys';

const cardColumnStyle: CSSProperties = {
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

const memberNameStyle: CSSProperties = {
  fontFamily: 'var(--tai-font-mono)',
  fontSize: 'var(--tai-text-md)',
  color: 'var(--tai-color-text)',
  wordBreak: 'break-all',
};

// The kind heading row: the kind Badge, then the muted count and rule; wraps on
// a narrow card.
const kindHeadingStyle: CSSProperties = {
  margin: 0,
  display: 'flex',
  alignItems: 'baseline',
  gap: 'var(--tai-space-2)',
  flexWrap: 'wrap',
  fontSize: 'var(--tai-text-lg)',
  color: 'var(--tai-color-text)',
};

const kindMetaStyle: CSSProperties = {
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
  fontWeight: 400,
};

/** A single extension entry: its (escaped) registered name. */
export function ExtensionEntry({ extension }: { extension: Extension }): ReactNode {
  return (
    <li>
      <span style={memberNameStyle}>{extension.name}</span>
    </li>
  );
}

/**
 * One extension kind and its registered extensions, rendered as a card headed by
 * the kind Badge, the member count and — for a kind that is not `multiple` — the
 * "one per tool" rule.
 */
export function ExtensionKindCard({ group }: { group: ExtensionKindGroup }): ReactNode {
  const count = group.members.length;
  return (
    <Card>
      <h3 style={kindHeadingStyle}>
        <Badge variant={kindVariant(group.kind)}>{group.kind}</Badge>
        <span style={kindMetaStyle}>
          {count === 1 ? '1 extension' : `${String(count)} extensions`}
        </span>
        {group.multiple ? null : <span style={kindMetaStyle}>one per tool</span>}
      </h3>
      <ul style={memberListStyle}>
        {group.members.map((extension) => (
          <ExtensionEntry key={extension.name} extension={extension} />
        ))}
      </ul>
    </Card>
  );
}

/** The loading placeholder: a few skeleton cards standing in for kind cards. */
function ExtensionsLoading(): ReactNode {
  return (
    <div style={cardColumnStyle} data-testid="extensions-loading">
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
        description="Extensions arrive as marketplace plugins — install one to see it here."
        action={
          <AppLink
            to="marketplace"
            search={{ kind: 'extension' }}
            className="tai-btn tai-btn-secondary"
          >
            Browse marketplace
          </AppLink>
        }
      />
    );
  } else {
    const groups = groupByKind(query.data);
    body = (
      <div style={cardColumnStyle}>
        {groups.map((group) => (
          <ExtensionKindCard key={group.kind} group={group} />
        ))}
      </div>
    );
  }

  return (
    <div className="tai-stack">
      <PageHeader title="Tool extensions" eyebrow="Capabilities" />

      <ApplyExtensionsPanel />

      <div style={cardColumnStyle}>
        <h2 className="tai-section-title">Extension catalog</h2>
        {body}
      </div>
    </div>
  );
}
