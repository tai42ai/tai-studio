/**
 * The drop zones inside the access-control mapper's `DndContext`: one per real
 * scope, one per pending (unsaved) scope, the Unassigned bucket, and the Public
 * zone, followed by the routes public by declaration (a plain list, not a drop zone,
 * and its chips are not draggable). Presentational over the derived chip surface;
 * every action is a callback.
 */
import type { AddUrlToScopeBody, AuthRoute } from '@tai42/api-client';
import { Badge, Button, EmptyState } from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

import { AddRouteRow } from './AddRouteRow';
import { chipFor, type MapperChips, scopeUrls, type SubMcpMounts } from './scope-mapping';
import type { ChipData } from './ScopeItemChip';
import { ScopeZone } from './ScopeZone';

const publicNoteStyle: CSSProperties = {
  margin: '0 0 var(--tai-space-3)',
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

const declaredZoneStyle: CSSProperties = {
  border: '1px solid var(--tai-color-border)',
  borderRadius: 'var(--tai-radius-md)',
  padding: 'var(--tai-space-3)',
  marginBottom: 'var(--tai-space-3)',
};

const declaredHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  marginBottom: 'var(--tai-space-2)',
};

const declaredCountStyle: CSSProperties = {
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

const declaredChipsStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--tai-space-2)',
  marginBottom: 'var(--tai-space-2)',
};

const declaredMethodsStyle: CSSProperties = {
  fontSize: 'var(--tai-text-xs)',
  color: 'var(--tai-color-text-muted)',
  fontFamily: 'var(--tai-font-sans)',
};

/**
 * The routes their registration declares public. No scope mapping or public pin
 * changes how they are served, so they are listed apart from every drop zone and
 * their chips are static text, never a drag handle. Renders nothing when there are none.
 */
function DeclaredPublicRoutes({ routes }: { readonly routes: readonly AuthRoute[] }): ReactNode {
  if (routes.length === 0) return null;
  const items = `${String(routes.length)} ${routes.length === 1 ? 'item' : 'items'}`;
  return (
    <div
      role="group"
      aria-label={`Routes public by declaration, ${items}`}
      style={declaredZoneStyle}
      data-zone="declared-public"
    >
      <div style={declaredHeaderStyle}>
        <Badge variant="warning">no auth</Badge>
        <strong>Public by declaration</strong>
        <span style={declaredCountStyle}>{items}</span>
      </div>
      <div style={declaredChipsStyle}>
        {routes.map((route) => (
          <span
            key={route.path}
            className="tai-chip tai-chip-static"
            style={{ fontFamily: 'var(--tai-font-mono)', flexDirection: 'column', gap: '2px' }}
          >
            <span>{route.path}</span>
            {route.methods.length === 0 ? null : (
              <span style={declaredMethodsStyle}>{route.methods.join(' ')}</span>
            )}
          </span>
        ))}
      </div>
      <p style={publicNoteStyle}>
        Declared public where they are registered: served without API-key authentication, whatever
        scope or pin they are given.
      </p>
    </div>
  );
}

export interface MapperZonesProps {
  readonly chips: MapperChips;
  readonly mounts: SubMcpMounts;
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
  mounts,
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
  'mounts' | 'interactive' | 'readOnly' | 'onAssign' | 'onRemoveScopeChip' | 'onDeleteScope'
>): ReactNode {
  const urls = scopeUrls(chips.groups, scopeId, chips.publicSet);
  const zoneChips = urls.map((url) => chipFor(url, { kind: 'scope', scopeId }, mounts));
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
          mounts={props.mounts}
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

      <DeclaredPublicRoutes routes={chips.declaredPublic} />
    </>
  );
}
