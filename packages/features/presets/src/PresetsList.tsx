/**
 * The presets list (left pane). The active presets fill a folder explorer
 * (`PresetExplorer`) over the one tool-organization tree, drawn for this screen's
 * presets; the conflicted (quarantined) ones — whose names collided with a foreign
 * tool at boot — stay outside it in their own danger-accented "Conflicted" Card,
 * each row carrying the server's `conflicted_reason` (a conflicted preset is
 * DELETE-ONLY; the detail pane offers only Delete for it, so the table never
 * presents a dead button). The name link sets `?preset=` to drive the detail pane
 * from either place, keeping the explorer's `?tags=` / `?q=` filter.
 *
 * The overlay read (`listToolMeta`) supplies the folders, each preset's folder, its
 * DISPLAY NAME sub-line and its OVERLAY tags; a failed overlay read is stated loudly
 * above the explorer.
 */
import { apiRoutes, type PresetRecord, type ToolMetaOverlay } from '@tai42/api-client';
import {
  Badge,
  Button,
  Card,
  errorMessage,
  ErrorState,
  FeatureDisabled,
  type FoldersChanged,
  openTargetProps,
  type RouteSearch,
  ScrollRegion,
  Skeleton,
  Spinner,
  Table,
  TBody,
  TH,
  THead,
  toolMetaKey,
  TR,
  useApi,
  useAppNavigate,
  useCanWrite,
  useFeatureOffMessage,
} from '@tai42/studio-sdk';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { type ReactNode, useCallback, useMemo, useState } from 'react';

import { CreatePresetForm } from './CreatePresetForm';
import { presetsListKey } from './keys';
import {
  type OverlayDetail,
  PRESET_COLUMNS,
  PresetCells,
  presetOpenSearch,
  type PresetsFilter,
} from './PresetEntry';
import { PresetExplorer } from './PresetExplorer';
import { StoredPresetFault } from './StoredPresetFault';

/** The conflicted presets' table — outside the folder explorer, since a conflicted
 *  preset is delete-only and never filed. */
function ConflictedTable({
  presets,
  overlayByTool,
  selected,
  filter,
}: {
  readonly presets: readonly PresetRecord[];
  readonly overlayByTool: ReadonlyMap<string, OverlayDetail>;
  readonly selected: string | undefined;
  readonly filter: PresetsFilter;
}): ReactNode {
  const navigate = useAppNavigate();
  return (
    <ScrollRegion label="Conflicted presets">
      <Table>
        <THead>
          <TR>
            {PRESET_COLUMNS.map((column) => (
              <TH key={column.key}>{column.header}</TH>
            ))}
          </TR>
        </THead>
        <TBody>
          {presets.map((preset) => {
            // The whole row opens the preset — the same destination as the name link,
            // which stays the accessible path; the helper yields to it.
            const openProps = openTargetProps({
              onOpen: () => {
                navigate('presets', presetOpenSearch(preset.name, filter));
              },
            });
            const isSelected = preset.name === selected;
            return (
              <TR
                key={preset.name}
                data-testid={`preset-row-${preset.name}`}
                selected={isSelected}
                {...openProps}
                style={{
                  opacity: 0.7,
                  ...openProps.style,
                }}
              >
                <PresetCells
                  preset={preset}
                  overlay={overlayByTool.get(preset.name)}
                  selected={isSelected}
                  filter={filter}
                />
              </TR>
            );
          })}
        </TBody>
      </Table>
    </ScrollRegion>
  );
}

/**
 * The list's body below its header: the versioning OFF note, the loading rows, the
 * stored-row fault or a read error, or the active-preset explorer (which states an
 * empty list itself, above any folders) and the conflicted table.
 */
function PresetsListBody({
  query,
  metaQuery,
  versioningOffMessage,
  overlayByTool,
  search,
  onFoldersChanged,
}: {
  readonly query: UseQueryResult<PresetRecord[]>;
  readonly metaQuery: UseQueryResult<ToolMetaOverlay>;
  readonly versioningOffMessage: string | null;
  readonly overlayByTool: ReadonlyMap<string, OverlayDetail>;
  readonly search: RouteSearch<'presets'>;
  readonly onFoldersChanged: FoldersChanged;
}): ReactNode {
  const selected = search.preset;
  const api = useApi();
  const faulted = query.isError ? api.storedPresetFaultFromError(query.error) : null;
  const active = useMemo(
    () => (query.data ?? []).filter((preset) => !preset.conflicted),
    [query.data],
  );
  const conflicted = useMemo(
    () => (query.data ?? []).filter((preset) => preset.conflicted),
    [query.data],
  );

  return versioningOffMessage !== null ? (
    // The versioning store is OFF, so the preset store is empty and create is
    // refused: stand the muted OFF note where the create-oriented empty state and
    // its "Create a preset…" call to action would otherwise mislead.
    <Card>
      <FeatureDisabled feature="Preset versioning" message={versioningOffMessage} />
    </Card>
  ) : query.isPending ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
      <Skeleton height={32} />
      <Skeleton height={32} />
      <Skeleton height={32} />
    </div>
  ) : query.isError ? (
    faulted !== null ? (
      <StoredPresetFault error={query.error} name={faulted} selected={selected} />
    ) : (
      <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
    )
  ) : (
    <>
      <Card>
        <div className="tai-stack">
          {metaQuery.isError ? (
            // Without the overlay the folders, display names and tags are unknown, so
            // every preset shows at the root — said loudly, with a retry.
            <ErrorState
              message={`Folders, display names and tags could not be loaded: ${errorMessage(metaQuery.error)}`}
              onRetry={() => void metaQuery.refetch()}
            />
          ) : null}
          <PresetExplorer
            presets={active}
            hasConflicted={conflicted.length > 0}
            overlay={metaQuery.data}
            overlayByTool={overlayByTool}
            search={search}
            tagsAvailable={metaQuery.isSuccess}
            onFoldersChanged={onFoldersChanged}
            overlayLoaded={metaQuery.isSuccess}
          />
        </div>
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
            <ConflictedTable
              presets={conflicted}
              overlayByTool={overlayByTool}
              selected={selected}
              filter={search}
            />
          </div>
        </Card>
      ) : null}
    </>
  );
}

export function PresetsList({ search }: { readonly search: RouteSearch<'presets'> }): ReactNode {
  const api = useApi();
  const query = useQuery({ queryKey: presetsListKey, queryFn: () => api.listPresets() });
  // The overlay read (folders, display names, tags) is enrichment: a preset row renders
  // fully without it, so its failure never walls the list — the body states it loudly
  // with a retry and shows every preset at the root.
  const metaQuery = useQuery({ queryKey: toolMetaKey, queryFn: () => api.listToolMeta() });
  const queryClient = useQueryClient();
  const onFoldersChanged = useCallback(
    () => queryClient.invalidateQueries({ queryKey: toolMetaKey }),
    [queryClient],
  );
  const [createOpen, setCreateOpen] = useState(false);

  // Preset CREATE is refused (501 `versioning-not-configured`) on a deployment whose
  // versioning store is OFF. Detected proactively off the system kind-status table:
  // the create affordance is WITHDRAWN and the muted OFF note stands where it was, so
  // the operator never opens a form whose every submit is certain to refuse. OFF is a
  // state, not an error.
  // Proactive OFF read off the kind-status table (no write is attempted here): the
  // server's own `detail` line is the remediation message.
  const versioningOffMessage = useFeatureOffMessage('versioning');
  const versioningOff = versioningOffMessage !== null;
  const canCreate = useCanWrite(apiRoutes.post_api_presets.path);
  const overlayByTool = useMemo(
    () =>
      new Map<string, OverlayDetail>(
        (metaQuery.data?.meta ?? []).map((row) => [
          row.tool_name,
          { displayName: row.display_name, tags: row.tags },
        ]),
      ),
    [metaQuery.data],
  );

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
          {versioningOff || !canCreate ? null : (
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

      {/* Off for everyone wins over the caller's own access line. */}
      {!versioningOff && !canCreate ? (
        <p
          role="status"
          style={{
            margin: 0,
            color: 'var(--tai-color-text-muted)',
            fontSize: 'var(--tai-text-sm)',
          }}
        >
          Creating presets is outside your access — presets are shown read-only.
        </p>
      ) : null}

      <PresetsListBody
        query={query}
        metaQuery={metaQuery}
        versioningOffMessage={versioningOffMessage}
        overlayByTool={overlayByTool}
        search={search}
        onFoldersChanged={onFoldersChanged}
      />

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
