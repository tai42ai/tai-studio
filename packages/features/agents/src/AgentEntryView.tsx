/**
 * One agents-explorer entry as the list shows it — its table cells and its card —
 * with the actions of its own kind:
 *  - a REGISTERED agent: Run (opens the streaming run view) and a link to its run
 *    tool on the tools page;
 *  - an AUTHORED agent: Run (the authored-run door) and Manage, a link to the presets
 *    page where its versioning, rollback and delete live (never duplicated here).
 * An authored agent also shows its active version. A caller who may file the entry's
 * tool also gets "Move" on either kind, filing that tool into a folder.
 *
 * SAFETY: names and descriptions are server-supplied strings, rendered as ESCAPED
 * text through the DS components, never an HTML sink.
 */
import { AppLink, Badge, Button, Card, type ExplorerColumn, TD } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { type AgentEntry, entryDescription } from './agent-entries';

/** The explorer's columns, in cell order. */
export const AGENT_COLUMNS: readonly ExplorerColumn[] = [
  { key: 'name', header: 'Name' },
  { key: 'kind', header: 'Kind' },
  { key: 'description', header: 'Description' },
  { key: 'base', header: 'Base agent' },
  { key: 'version', header: 'Active version' },
  { key: 'actions', header: 'Actions' },
];

export interface AgentEntryViewProps {
  readonly entry: AgentEntry;
  readonly onRun: (entry: AgentEntry) => void;
  /** Open the move-to-folder dialog; absent for a caller who cannot file. */
  readonly onMove: ((entry: AgentEntry) => void) | undefined;
}

function EntryName({ entry }: { readonly entry: AgentEntry }): ReactNode {
  return (
    <span
      className="tai-mono"
      data-testid="agent-name"
      data-agent={entry.toolName}
      data-kind={entry.kind}
    >
      {entry.toolName}
    </span>
  );
}

function EntryKind({ entry }: { readonly entry: AgentEntry }): ReactNode {
  return entry.kind === 'registered' ? (
    <Badge>Registered</Badge>
  ) : (
    <Badge variant="info">Authored</Badge>
  );
}

function EntryActions({ entry, onRun, onMove }: AgentEntryViewProps): ReactNode {
  return (
    <div className="tai-row">
      <Button
        type="button"
        variant="primary"
        aria-label={
          entry.kind === 'registered'
            ? `Run agent ${entry.toolName}`
            : `Run authored agent ${entry.toolName}`
        }
        onClick={() => {
          onRun(entry);
        }}
      >
        Run
      </Button>
      {entry.kind === 'registered' ? (
        <AppLink
          to="tools"
          // The run tool is registered under the agent's REGISTRATION name (which
          // can differ from tool_name), so the tools page is keyed on that name.
          search={{ tool: entry.toolName }}
          // The name BEGINS with the visible text (WCAG 2.5.3, Label in Name).
          aria-label={`Open run tool for ${entry.toolName}`}
        >
          Open run tool
        </AppLink>
      ) : (
        <AppLink
          to="presets"
          search={{ preset: entry.toolName }}
          aria-label={`Manage authored agent ${entry.toolName}`}
        >
          Manage
        </AppLink>
      )}
      {onMove !== undefined ? (
        <Button
          type="button"
          variant="ghost"
          // The dialog's own title; it starts with the visible word, so a voice user
          // who says what they read reaches it.
          aria-label={`Move ${entry.toolName} to a folder`}
          onClick={() => {
            onMove(entry);
          }}
        >
          Move
        </Button>
      ) : null}
    </div>
  );
}

/** The entry's table cells, one per {@link AGENT_COLUMNS} entry. */
export function AgentEntryCells(props: AgentEntryViewProps): ReactNode {
  const { entry } = props;
  return (
    <>
      <TD>
        <EntryName entry={entry} />
      </TD>
      <TD>
        <EntryKind entry={entry} />
      </TD>
      <TD>{entryDescription(entry) || '—'}</TD>
      <TD className="tai-mono">{entry.kind === 'authored' ? entry.baseAgent.name : '—'}</TD>
      <TD>{entry.kind === 'authored' ? entry.preset.active_version : '—'}</TD>
      <TD>
        <EntryActions {...props} />
      </TD>
    </>
  );
}

/** The entry's card for the explorer's card view. */
export function AgentEntryCard(props: AgentEntryViewProps): ReactNode {
  const { entry } = props;
  const description = entryDescription(entry);
  return (
    <Card>
      <div className="tai-stack tai-stack-2">
        <div className="tai-row">
          <EntryName entry={entry} />
          <EntryKind entry={entry} />
        </div>
        {description ? <span className="tai-muted">{description}</span> : null}
        {entry.kind === 'authored' ? (
          <>
            <span className="tai-muted">
              Base agent <span className="tai-mono">{entry.baseAgent.name}</span>
            </span>
            <span className="tai-muted">Active version {entry.preset.active_version}</span>
          </>
        ) : null}
        <EntryActions {...props} />
      </div>
    </Card>
  );
}
