/**
 * The agents explorer: ONE `ExplorerView` over the registered agents and the authored
 * agents together, on the one tool-organization tree drawn for this screen's
 * population — a folder shows when its subtree holds one of these agents or holds no
 * tool at all, so folders holding only other tools stay on the Tools screen. Each
 * entry sits in the folder its tool's overlay row files it in. The reads and their
 * derivations come in as the page's one `useAgentCatalog` read.
 *
 * The registry read is load-bearing — its failure walls the list. A presets or overlay
 * failure is said loudly above a list that stays usable (a scoped caller's 403 on the
 * presets read is absence, not a failure). Once the overlay is loaded, every folder
 * carries the shared folder actions, each shown only where the caller may make that
 * write; a caller who may file a tool gets a per-entry "Move". A
 * not-configured refusal of any overlay write withdraws them all, here and on every
 * other screen.
 */
import type { AgentSummary } from '@tai42/api-client';
import {
  AppLink,
  Card,
  errorMessage,
  ErrorState,
  ExplorerView,
  FolderActionsMenu,
  MoveToFolderDialog,
  Skeleton,
  useAppNavigate,
} from '@tai42/studio-sdk';
import { type ReactNode, useState } from 'react';

import type { AgentEntry } from './agent-entries';
import { AGENT_COLUMNS, AgentEntryCard, AgentEntryCells } from './AgentEntryView';
import type { AuthoredRunTarget } from './authoring-types';
import type { AgentCatalog } from './useAgentCatalog';

/** The explorer's persisted list/card view key. */
const AGENTS_VIEW_SURFACE = 'agents';

export function AgentExplorer({
  catalog,
  onRun,
  onRunAuthored,
}: {
  readonly catalog: AgentCatalog;
  readonly onRun: (agent: AgentSummary) => void;
  readonly onRunAuthored: (target: AuthoredRunTarget) => void;
}): ReactNode {
  const navigate = useAppNavigate();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [moving, setMoving] = useState<AgentEntry | null>(null);
  const {
    agentsQuery,
    presetsQuery,
    metaQuery,
    presetsFailed,
    entries,
    allFolders,
    folders,
    folderIdByTool,
    overlayLoaded,
    canFileTools,
    onFoldersChanged,
  } = catalog;

  if (agentsQuery.isPending) {
    return (
      <div className="tai-stack" data-testid="agents-loading">
        {[0, 1, 2].map((row) => (
          <Card key={row}>
            <Skeleton width="40%" height={18} />
          </Card>
        ))}
      </div>
    );
  }
  if (agentsQuery.isError) {
    return (
      <ErrorState
        message={errorMessage(agentsQuery.error)}
        onRetry={() => void agentsQuery.refetch()}
      />
    );
  }

  const run = (entry: AgentEntry): void => {
    if (entry.kind === 'registered') onRun(entry.agent);
    else onRunAuthored({ name: entry.toolName, baseAgent: entry.baseAgent });
  };
  const viewProps = (entry: AgentEntry) => ({
    entry,
    onRun: run,
    onMove: canFileTools ? setMoving : undefined,
  });

  return (
    <div className="tai-stack">
      {presetsFailed ? (
        <ErrorState
          message={`Authored agents could not be loaded: ${errorMessage(presetsQuery.error)}`}
          onRetry={() => void presetsQuery.refetch()}
        />
      ) : null}
      {metaQuery.isError ? (
        // Without the overlay the folders are unknown, so every agent shows at the root.
        <ErrorState
          message={`Folders could not be loaded: ${errorMessage(metaQuery.error)}`}
          onRetry={() => void metaQuery.refetch()}
        />
      ) : null}
      <ExplorerView<AgentEntry>
        items={entries}
        getItemKey={(entry) => `${entry.kind}:${entry.toolName}`}
        getFolderId={(entry) => folderIdByTool.get(entry.toolName) ?? null}
        folders={folders}
        currentFolderId={currentFolderId}
        onNavigate={setCurrentFolderId}
        rootLabel="All agents"
        viewSurface={AGENTS_VIEW_SURFACE}
        label="Agents"
        columns={AGENT_COLUMNS}
        renderRow={(entry) => <AgentEntryCells {...viewProps(entry)} />}
        renderCard={(entry) => <AgentEntryCard {...viewProps(entry)} />}
        // The row opens the entry's own page — an authored agent's Manage (the presets
        // page), a registered agent's run tool — the same place its link goes.
        onOpenItem={(entry) => {
          if (entry.kind === 'authored') navigate('presets', { preset: entry.toolName });
          else navigate('tools', { tool: entry.toolName });
        }}
        renderFolderActions={
          overlayLoaded
            ? (folder) => (
                <FolderActionsMenu
                  folder={folder}
                  folders={allFolders}
                  onFoldersChanged={onFoldersChanged}
                />
              )
            : undefined
        }
        emptyStates={{
          empty: {
            title: 'No agents registered',
            description:
              'Agents come from installed agent plugins — install one from the marketplace to run it here.',
            action: (
              <AppLink
                to="marketplace"
                search={{ kind: 'agent' }}
                className="tai-btn tai-btn-secondary"
              >
                Browse marketplace
              </AppLink>
            ),
          },
          emptyFolder: {
            title: 'This folder is empty',
            // The hint names an action only for a caller who has it.
            description: canFileTools ? 'Move an agent here with its "Move" action.' : undefined,
          },
          noMatch: { title: 'No agents match' },
        }}
      />
      {moving !== null ? (
        <MoveToFolderDialog
          toolName={moving.toolName}
          label={moving.toolName}
          currentFolderId={folderIdByTool.get(moving.toolName) ?? null}
          folders={allFolders}
          onFoldersChanged={onFoldersChanged}
          onClose={() => {
            setMoving(null);
          }}
        />
      ) : null}
    </div>
  );
}
