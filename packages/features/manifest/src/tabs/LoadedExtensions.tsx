/**
 * The extensions this server loaded (`GET /api/extensions`), grouped by kind. A caller
 * whose projection cannot read the catalog sees a no-grant notice; any other failure is
 * an error with Retry. A catalog that serves one kind as both single- and
 * multi-select is a catalog fault: `groupByKind` throws, and the thrown message renders
 * as the error.
 */
import type { ExtensionKindGroup } from '@tai42/studio-sdk';
import {
  EmptyState,
  errorMessage,
  ErrorState,
  extensionsQueryKey,
  groupByKind,
  isForbiddenError,
  Skeleton,
  useApi,
} from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useId, useMemo } from 'react';

type Grouping = { readonly groups: ExtensionKindGroup[] } | { readonly error: string };

function KindGroup({ group }: { readonly group: ExtensionKindGroup }): ReactNode {
  const kindId = useId();
  return (
    <section aria-labelledby={kindId} className="tai-stack tai-stack-2">
      {/* `tai-field-label` sets no margin; the stack gap spaces the groups. */}
      <h4 id={kindId} className="tai-field-label" style={{ margin: 0 }}>
        Kind: {group.kind}
      </h4>
      {group.multiple ? null : <span className="tai-muted">(one per combo)</span>}
      <ul className="tai-stack tai-stack-2" style={{ margin: 0 }}>
        {group.members.map((member) => (
          <li key={member.name} className="tai-mono">
            {member.name}
          </li>
        ))}
      </ul>
    </section>
  );
}

function LoadedExtensionsBody(): ReactNode {
  const api = useApi();
  const query = useQuery({
    queryKey: extensionsQueryKey,
    queryFn: ({ signal }) => api.listExtensions(signal),
  });
  const grouping = useMemo<Grouping | undefined>(() => {
    if (query.data === undefined) return undefined;
    try {
      return { groups: groupByKind(query.data) };
    } catch (error) {
      return { error: errorMessage(error) };
    }
  }, [query.data]);

  if (query.isPending) {
    return (
      <div className="tai-stack tai-stack-2">
        <Skeleton height={16} />
        <Skeleton height={16} />
        <Skeleton height={16} />
      </div>
    );
  }
  if (query.isError) {
    if (isForbiddenError(query.error)) {
      return (
        <EmptyState
          title="Loaded extensions are not available to this session"
          description="This part lists the extension modules the server loaded, by kind. Reading it needs read access to extensions."
        />
      );
    }
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (grouping === undefined) return null;
  if ('error' in grouping) return <ErrorState message={grouping.error} />;
  if (grouping.groups.length === 0) {
    return (
      <EmptyState
        title="No extensions are loaded"
        description="This server registered no extensions."
      />
    );
  }
  return (
    <div className="tai-stack tai-stack-3">
      {grouping.groups.map((group) => (
        <KindGroup key={group.kind} group={group} />
      ))}
    </div>
  );
}

export function LoadedExtensions(): ReactNode {
  return (
    <div className="tai-stack tai-stack-3">
      <h3 className="tai-card-title">Loaded extensions</h3>
      <LoadedExtensionsBody />
    </div>
  );
}
