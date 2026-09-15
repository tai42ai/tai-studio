/**
 * The drop zones inside the access-control mapper's `DndContext`: one per real
 * scope, one per pending (unsaved) scope, the Unassigned bucket, and the Public
 * zone. Presentational over the derived chip surface; every action is a callback.
 */
import type { AddUrlToScopeBody } from '@tai42/api-client';
import { Badge, Button, EmptyState } from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

import { AddRouteRow } from './AddRouteRow';
import { chipFor, type MapperChips, scopeUrls } from './scope-mapping';
import type { ChipData } from './ScopeItemChip';
import { ScopeZone } from './ScopeZone';

const publicNoteStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-3)',
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

export interface MapperZonesProps {
  readonly chips: MapperChips;
  readonly slugs: ReadonlySet<string>;
  readonly pendingScopes: readonly string[];
  readonly interactive: boolean;
  readonly readOnly: boolean;
  readonly onAssign: (body: AddUrlToScopeBody) => void;
  readonly onRemoveScopeChip: (data: ChipData, isLastUrl: boolean) => void;
  readonly onDeleteScope: (scopeId: string, itemCount: number) => void;
  readonly onDiscardPending: (scopeId: string) => void;
  readonly onUnpin: (url: string) => void;
}

function RealScopeZone({
  scopeId,
  chips,
  slugs,
  interactive,
  readOnly,
  onAssign,
  onRemoveScopeChip,
  onDeleteScope,
}: {
  readonly scopeId: string;
  readonly chips: MapperChips;
} & Pick<
  MapperZonesProps,
  'slugs' | 'interactive' | 'readOnly' | 'onAssign' | 'onRemoveScopeChip' | 'onDeleteScope'
>): ReactNode {
  const urls = scopeUrls(chips.groups, scopeId, chips.publicSet);
  const zoneChips = urls.map((url) => chipFor(url, { kind: 'scope', scopeId }, slugs));
  return (
    <ScopeZone
      zone={{ kind: 'scope', scopeId }}
      title={<Badge variant="primary">{scopeId}</Badge>}
      count={zoneChips.length}
      chips={zoneChips}
      interactive={interactive}
      emptyNote="Drag a route here to map it."
      onRemoveChip={(data) => {
        onRemoveScopeChip(data, urls.length <= 1);
      }}
      removeLabelOf={(data) => `Remove URL ${data.url}`}
      headerAction={
        readOnly ? null : (
          <Button
            type="button"
            variant="danger"
            aria-label={`Delete scope ${scopeId}`}
            onClick={() => {
              onDeleteScope(scopeId, zoneChips.length);
            }}
          >
            Delete scope
          </Button>
        )
      }
      footer={
        readOnly ? null : <AddRouteRow scopeId={scopeId} disabled={!interactive} onAdd={onAssign} />
      }
    />
  );
}

function PendingScopeZone({
  scopeId,
  interactive,
  readOnly,
  onAssign,
  onDiscardPending,
}: {
  readonly scopeId: string;
} & Pick<
  MapperZonesProps,
  'interactive' | 'readOnly' | 'onAssign' | 'onDiscardPending'
>): ReactNode {
  return (
    <ScopeZone
      zone={{ kind: 'scope', scopeId }}
      title={<Badge variant="neutral">{scopeId}</Badge>}
      headerBadge={<Badge variant="warning">pending</Badge>}
      count={0}
      chips={[]}
      interactive={interactive}
      emptyNote="Saved when the first item is assigned."
      headerAction={
        readOnly ? null : (
          <Button
            type="button"
            aria-label={`Discard pending scope ${scopeId}`}
            onClick={() => {
              onDiscardPending(scopeId);
            }}
          >
            Discard
          </Button>
        )
      }
      footer={
        readOnly ? null : <AddRouteRow scopeId={scopeId} disabled={!interactive} onAdd={onAssign} />
      }
    />
  );
}

export function MapperZones(props: MapperZonesProps): ReactNode {
  const { chips, pendingScopes, interactive, readOnly, onUnpin } = props;
  return (
    <>
      {chips.realScopeIds.length === 0 && pendingScopes.length === 0 ? (
        <EmptyState
          title="No scopes"
          description="Create a scope, then drag routes onto it to map them."
        />
      ) : null}

      {chips.realScopeIds.map((scopeId) => (
        <RealScopeZone
          key={scopeId}
          scopeId={scopeId}
          chips={chips}
          slugs={props.slugs}
          interactive={interactive}
          readOnly={readOnly}
          onAssign={props.onAssign}
          onRemoveScopeChip={props.onRemoveScopeChip}
          onDeleteScope={props.onDeleteScope}
        />
      ))}

      {pendingScopes
        .filter((scopeId) => !chips.groups.has(scopeId))
        .map((scopeId) => (
          <PendingScopeZone
            key={`pending-${scopeId}`}
            scopeId={scopeId}
            interactive={interactive}
            readOnly={readOnly}
            onAssign={props.onAssign}
            onDiscardPending={props.onDiscardPending}
          />
        ))}

      <ScopeZone
        zone={{ kind: 'unassigned' }}
        title={<strong>Unassigned</strong>}
        count={chips.unassignedChips.length}
        chips={chips.unassignedChips}
        interactive={interactive}
        emptyNote="Every route and sub-MCP mount is mapped."
      />

      <ScopeZone
        zone={{ kind: 'public' }}
        title={<strong>Public</strong>}
        headerBadge={<Badge variant="warning">no auth</Badge>}
        count={chips.publicChips.length}
        chips={chips.publicChips}
        interactive={interactive}
        emptyNote="No routes are pinned public."
        footer={
          <p style={publicNoteStyle}>
            Public routes are served without API-key authentication or any scope check. This is not
            a scope.{readOnly ? '' : ' Drop a route here to pin it public.'}
          </p>
        }
        onRemoveChip={
          readOnly
            ? undefined
            : (data) => {
                onUnpin(data.url);
              }
        }
        removeLabelOf={(data) => `Unpin ${data.url}`}
      />
    </>
  );
}
