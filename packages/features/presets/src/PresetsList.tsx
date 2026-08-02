/**
 * The presets master table (left pane). One row per store-backed preset. Active
 * presets fill the main table; the conflicted (quarantined) ones — whose names
 * collided with a foreign tool at boot — are split into their own danger-accented
 * "Conflicted" Card below, each row carrying the server's `conflicted_reason` (a
 * conflicted preset is DELETE-ONLY; the detail pane offers only Delete for it, so
 * the table never presents a dead button). The name cell is an `AppLink` that sets
 * `?preset=` to drive the detail pane from either table; the active row is
 * highlighted.
 *
 * The Name cell also surfaces the tool's overlay DISPLAY NAME (from `listToolMeta`)
 * as a muted sub-line, and the Tags column renders the tool's OVERLAY tags — record
 * categorization tags are gone; that curation lives in the tool_meta overlay now.
 *
 * SAFETY: a preset carries arbitrary server-supplied strings, so every cell renders
 * them as ESCAPED text through the DS components, never an HTML sink.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { PresetRecord } from '@tai42/api-client';
import {
  AppLink,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  FeatureDisabled,
  ScrollRegion,
  Skeleton,
  Spinner,
  TBody,
  TD,
  TH,
  THead,
  TR,
  Table,
  errorMessage,
  useApi,
  useFeatureOff,
} from '@tai42/studio-sdk';

import { CreatePresetForm } from './CreatePresetForm';
import { TagChips } from './tags';
import { presetToolMetaKey, presetsListKey } from './keys';

/** A tool's overlay projection the table cells read: its display name + user tags. */
interface OverlayDetail {
  readonly displayName: string | null;
  readonly tags: readonly string[];
}

/** The generic fallback shown when a conflicted row carries no server reason. */
const GENERIC_CONFLICT_REASON =
  'Name collided with an existing tool at startup — delete to resolve.';

const linkStyle: CSSProperties = {
  color: 'var(--tai-color-accent)',
  textDecoration: 'none',
  fontFamily: 'var(--tai-font-mono)',
  // The name is one token: keep it on a single line so auto table layout gives the
  // column its width rather than collapsing it to a character. The ScrollRegion
  // scrolls a very long name; sibling sub-lines (display name, reason) still wrap.
  whiteSpace: 'nowrap',
};

function PresetRow({
  preset,
  overlay,
  selected,
}: {
  readonly preset: PresetRecord;
  readonly overlay: OverlayDetail | undefined;
  readonly selected: boolean;
}): ReactNode {
  const rowStyle: CSSProperties = {
    background: selected ? 'var(--tai-color-surface)' : undefined,
    opacity: preset.conflicted ? 0.7 : undefined,
  };
  const displayName = overlay?.displayName ?? null;
  const tags = overlay?.tags ?? [];

  return (
    <TR data-testid={`preset-row-${preset.name}`} style={rowStyle}>
      <TD>
        <AppLink
          to="presets"
          search={{ preset: preset.name }}
          aria-label={`Open preset ${preset.name}`}
          aria-current={selected ? 'page' : undefined}
        >
          <span style={linkStyle}>{preset.name}</span>
        </AppLink>
        {displayName !== null && displayName !== '' ? (
          <div
            style={{ color: 'var(--tai-color-text-muted)', fontSize: 'var(--tai-text-sm)' }}
            data-testid={`preset-display-name-${preset.name}`}
          >
            {displayName}
          </div>
        ) : null}
        {preset.conflicted ? (
          <div
            data-testid={`preset-conflicted-${preset.name}`}
            style={{
              marginTop: 'var(--tai-space-1)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--tai-space-1)',
            }}
          >
            <span>
              <Badge variant="danger">Conflicted</Badge>
            </span>
            <span style={{ color: 'var(--tai-color-text-muted)', fontSize: 'var(--tai-text-sm)' }}>
              {preset.conflicted_reason ?? GENERIC_CONFLICT_REASON}
            </span>
          </div>
        ) : null}
      </TD>
      <TD style={{ fontFamily: 'var(--tai-font-mono)' }}>{preset.base_tool}</TD>
      <TD>{preset.description || '—'}</TD>
      <TD>{preset.active_version}</TD>
      <TD>{tags.length > 0 ? <TagChips tags={tags} /> : '—'}</TD>
      <TD>{preset.extensions.length}</TD>
    </TR>
  );
}

/** The shared column header row — identical for the active and conflicted tables. */
function PresetTableHead(): ReactNode {
  return (
    <THead>
      <TR>
        <TH>Name</TH>
        <TH>Base tool</TH>
        <TH>Description</TH>
        <TH>Active version</TH>
        <TH>Tags</TH>
        <TH>Combos</TH>
      </TR>
    </THead>
  );
}

function PresetTable({
  presets,
  overlayByTool,
  selected,
}: {
  readonly presets: readonly PresetRecord[];
  readonly overlayByTool: ReadonlyMap<string, OverlayDetail>;
  readonly selected: string | undefined;
}): ReactNode {
  return (
    <ScrollRegion label="Presets">
      <Table>
        <PresetTableHead />
        <TBody>
          {presets.map((preset) => (
            <PresetRow
              key={preset.name}
              preset={preset}
              overlay={overlayByTool.get(preset.name)}
              selected={preset.name === selected}
            />
          ))}
        </TBody>
      </Table>
    </ScrollRegion>
  );
}

export function PresetsList({ selected }: { readonly selected: string | undefined }): ReactNode {
  const api = useApi();
  const query = useQuery({ queryKey: presetsListKey, queryFn: () => api.listPresets() });
  // The overlay read is enrichment: a preset row renders fully without it, so its
  // failure never walls the table — the display-name sub-line and the overlay tags
  // simply fall back to their empty state rather than blocking the list.
  const metaQuery = useQuery({ queryKey: presetToolMetaKey, queryFn: () => api.listToolMeta() });
  const [createOpen, setCreateOpen] = useState(false);

  // Preset CREATE is refused (501 `versioning-not-configured`) on a deployment whose
  // versioning store is OFF. Detected proactively off the system kind-status table:
  // the create affordance is WITHDRAWN and the muted OFF note stands where it was, so
  // the operator never opens a form whose every submit is certain to refuse. OFF is a
  // state, not an error.
  const versioningOff = useFeatureOff('versioning');

  const overlayByTool = new Map<string, OverlayDetail>(
    (metaQuery.data?.meta ?? []).map((row) => [
      row.tool_name,
      { displayName: row.display_name, tags: row.tags },
    ]),
  );

  const active = (query.data ?? []).filter((preset) => !preset.conflicted);
  const conflicted = (query.data ?? []).filter((preset) => preset.conflicted);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--tai-space-2)',
        }}
      >
        <h2 className="tai-card-title">All presets</h2>
        <div style={{ display: 'flex', gap: 'var(--tai-space-2)' }}>
          <Button type="button" onClick={() => void query.refetch()} disabled={query.isFetching}>
            {query.isFetching ? <Spinner label="Refreshing" /> : null}
            Refresh
          </Button>
          {versioningOff ? null : (
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                setCreateOpen(true);
              }}
            >
              Create preset
            </Button>
          )}
        </div>
      </header>

      {versioningOff ? (
        // The versioning store is OFF, so the preset store is empty and create is
        // refused: stand the muted OFF note where the create-oriented empty state and
        // its "Create a preset…" call to action would otherwise mislead.
        <Card>
          <FeatureDisabled feature="Preset versioning" envVar="VERSIONING_STORE_PG_PASSWORD" />
        </Card>
      ) : query.isPending ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
          <Skeleton height={32} />
          <Skeleton height={32} />
          <Skeleton height={32} />
        </div>
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <Card>
          <EmptyState
            title="No presets yet"
            description="Create a preset to bind a base tool with fixed kwargs into a new named tool."
          />
        </Card>
      ) : (
        <>
          <Card>
            {active.length > 0 ? (
              <PresetTable presets={active} overlayByTool={overlayByTool} selected={selected} />
            ) : (
              <EmptyState
                title="No active presets"
                description="Every preset is currently conflicted — resolve them below."
              />
            )}
          </Card>

          {conflicted.length > 0 ? (
            <Card>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}
                data-testid="presets-conflicted-section"
              >
                <h3
                  style={{
                    margin: 0,
                    fontSize: 'var(--tai-text-md)',
                    color: 'var(--tai-color-err-text)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 'var(--tai-space-2)',
                  }}
                >
                  Conflicted <Badge variant="danger">{conflicted.length}</Badge>
                </h3>
                <PresetTable
                  presets={conflicted}
                  overlayByTool={overlayByTool}
                  selected={selected}
                />
              </div>
            </Card>
          ) : null}
        </>
      )}

      {createOpen ? (
        <CreatePresetForm
          onClose={() => {
            setCreateOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
