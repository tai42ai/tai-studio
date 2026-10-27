/**
 * One section of the Pick tools step: the server's advertised tools with a tick per
 * tool, the state of its read while it has not answered, and the outcome of its save.
 */
import type { FleetReportSummary, McpAdvertisedTools } from '@tai42/api-client';
import {
  AlertTriangleIcon,
  Badge,
  Button,
  Checkbox,
  CheckIcon,
  errorMessage,
  ErrorState,
  Field,
  FleetReport,
  HolderList,
  isForbiddenError,
  matchesSearch,
  Skeleton,
  TextInput,
  toolDisplayLabel,
  useApi,
  useToolDisplayNames,
} from '@tai42/studio-sdk';
import type { UseQueryResult } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';

import {
  countLine,
  draftBody,
  type PickDraft,
  pickMode,
  sameBody,
  type ToolFilterBody,
} from './pick-tools-model';

const UNBOUND_REASON: Record<string, (name: string) => string> = {
  server_failed: () =>
    'Not mounted: this server failed when its tools were last loaded. Fix it from its card to mount this tool.',
  not_loaded: () =>
    "Not mounted: the worker that answered has not loaded this server's tools (it was deregistered there, or that worker has not loaded a recent change yet). Fix it from its card to mount this tool.",
  preset_conflict: (name) =>
    `Not mounted: a preset already uses the name ${name}, so this tool is not bound under it. Rename or delete that preset, then reload the server from the Manifest screen to mount it.`,
  unusable_schema: () =>
    "Not mounted: the server describes this tool's input in a form that cannot be used (an empty anyOf or oneOf, or nesting past the depth limit). The server log names the cause.",
  not_listed_at_bind: () =>
    'Not mounted: the server did not list this tool when its tools were last loaded. Reload the server from the Manifest screen to mount it.',
};

function statusOf(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : null;
}

export interface SectionResult {
  readonly saved?: ToolFilterBody;
  readonly summary?: FleetReportSummary | null;
  readonly error?: unknown;
}

export function SectionBody({
  read,
  draft,
  onDraft,
}: {
  read: McpAdvertisedTools;
  draft: PickDraft;
  onDraft: (draft: PickDraft) => void;
}): ReactNode {
  const names = useToolDisplayNames();
  const [filter, setFilter] = useState('');
  const mode = pickMode(read);
  const shown = (name: string): boolean => matchesSearch(filter, toolDisplayLabel(names, name));
  const setTick = (name: string, tick: boolean): void => {
    onDraft({ ...draft, ticks: { ...draft.ticks, [name]: tick } });
  };
  const setAllVisible = (tick: boolean): void => {
    const ticks = { ...draft.ticks };
    for (const name of [...read.tools.map((tool) => tool.name), ...read.unadvertised]) {
      if (shown(name)) ticks[name] = tick;
    }
    onDraft({ ...draft, ticks });
  };

  if (read.tools.length === 0 && read.unadvertised.length === 0) {
    return <p className="tai-status">This server advertises no tools.</p>;
  }

  const anyTicked = Object.values(draft.ticks).some(Boolean);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
      <Checkbox
        label="Mount every tool, including tools the server adds later"
        checked={draft.all}
        onCheckedChange={(checked) => {
          onDraft({ ...draft, all: checked });
        }}
      />
      {draft.all && read.include.length > 0 ? (
        <p className="tai-status">
          {"Saving clears this server's include list: every tool it offers will be mounted."}
        </p>
      ) : null}
      {draft.all && read.exclude.length > 0 ? (
        <p className="tai-status">
          {"Saving clears this server's exclude list: every tool it offers will be mounted."}
        </p>
      ) : null}
      {draft.all ? null : (
        <>
          {mode === 'exclude' ? (
            <p className="tai-status">
              This server mounts every tool except the unticked ones, including tools it adds later.
              Saving keeps it that way: the unticked tools are saved as its exclude list.
            </p>
          ) : null}
          <Field label="Filter tools">
            <TextInput
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
              }}
            />
          </Field>
          <div style={{ display: 'flex', gap: 'var(--tai-space-2)' }}>
            <Button
              onClick={() => {
                setAllVisible(true);
              }}
            >
              Select all
            </Button>
            <Button
              onClick={() => {
                setAllVisible(false);
              }}
            >
              Clear
            </Button>
          </div>
          {mode === 'exclude' && !anyTicked ? (
            <p className="tai-status">
              Saving this unmounts every tool this server lists now. Tools it adds later will mount;
              turn on mount every tool to mount them all again.
            </p>
          ) : null}
          <p className="tai-status">{countLine(read, draft)}</p>
          {mode === 'include' && !anyTicked ? (
            <p className="tai-status tai-status-warn">
              <AlertTriangleIcon />
              Tick at least one tool, or turn on mount every tool.
            </p>
          ) : null}
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {read.tools
              .filter((tool) => shown(tool.name))
              .map((tool) => (
                <li key={tool.name} style={{ marginBottom: 'var(--tai-space-2)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}>
                    <Checkbox
                      label={toolDisplayLabel(names, tool.name)}
                      checked={draft.ticks[tool.name] === true}
                      onCheckedChange={(checked) => {
                        setTick(tool.name, checked);
                      }}
                    />
                    {tool.selected && !tool.bound ? (
                      <Badge variant="warning">Not mounted</Badge>
                    ) : null}
                  </div>
                  {tool.description !== null && tool.description !== '' ? (
                    <p className="tai-status" style={{ margin: 0, overflowWrap: 'anywhere' }}>
                      {tool.description}
                    </p>
                  ) : null}
                  {tool.selected && !tool.bound && tool.unbound_reason !== null ? (
                    <p className="tai-status tai-status-warn" style={{ margin: 0 }}>
                      <AlertTriangleIcon />
                      {UNBOUND_REASON[tool.unbound_reason]?.(tool.name)}
                    </p>
                  ) : null}
                </li>
              ))}
            {read.unadvertised.filter(shown).map((name) => (
              <li key={name} style={{ marginBottom: 'var(--tai-space-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--tai-space-2)' }}>
                  <Checkbox
                    label={toolDisplayLabel(names, name)}
                    checked={draft.ticks[name] === true}
                    onCheckedChange={(checked) => {
                      setTick(name, checked);
                    }}
                  />
                  <Badge>Not advertised</Badge>
                </div>
                <p className="tai-status" style={{ margin: 0 }}>
                  The server no longer lists this tool; it stays in the selection unless you change
                  it here.
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** A section's read while it has not answered with data: loading, refused or failed. */
export function SectionRead({
  title,
  query,
  justAdded,
  addFleet,
}: {
  readonly title: string;
  readonly query: UseQueryResult<McpAdvertisedTools> | undefined;
  readonly justAdded: boolean;
  readonly addFleet: FleetReportSummary | null;
}): ReactNode {
  if (query === undefined || query.isPending) {
    return (
      <div
        role="status"
        style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}
      >
        <p className="tai-status" style={{ margin: 0 }}>
          Asking the server for its tools…
        </p>
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} height={20} />
        ))}
      </div>
    );
  }
  if (!query.isError) return null;
  if (isForbiddenError(query.error)) {
    return (
      <p role="status" className="tai-status">
        {`This session cannot list the tools of ${title}. Listing them needs write access to POST /api/mcp-status/${title}/advertised-tools; ask an administrator to grant it.`}
      </p>
    );
  }
  if (statusOf(query.error) === 404) {
    return (
      <>
        <ErrorState
          message={
            justAdded
              ? `${title} was just added, but the worker that answered has not loaded it yet.`
              : `The worker that answered has no MCP server titled ${title}. It may have been removed, or this worker has not loaded a recent change yet.`
          }
          onRetry={() => void query.refetch()}
        />
        {justAdded && addFleet !== null ? <FleetReport summary={addFleet} /> : null}
      </>
    );
  }
  return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
}

/** A section's save outcome: Saved with its fleet report, or the failure with its holders. */
export function SectionOutcome({
  title,
  read,
  draft,
  result,
  onLeave,
}: {
  readonly title: string;
  readonly read: McpAdvertisedTools | undefined;
  readonly draft: PickDraft | undefined;
  readonly result: SectionResult | undefined;
  readonly onLeave: () => void;
}): ReactNode {
  const api = useApi();
  if (result === undefined) return null;
  if (result.error !== undefined) {
    const holders = api.holdersFromError(result.error);
    const message = errorMessage(result.error);
    const failureText = holders !== null ? (message.split('\n')[0] ?? '') : message;
    return (
      <div>
        <p role="alert" className="tai-status tai-status-err">
          <AlertTriangleIcon />
          {`Could not save ${title}: ${failureText}`}
        </p>
        {holders !== null ? (
          <HolderList
            holders={holders}
            label={`Holders of the tools ${title} would unpick`}
            lead="Remove those references first, or tick those tools again."
            onNavigate={onLeave}
          />
        ) : null}
      </div>
    );
  }
  const savedNow =
    result.saved !== undefined &&
    read !== undefined &&
    draft !== undefined &&
    sameBody(draftBody(read, draft), result.saved);
  if (!savedNow) return null;
  return (
    <>
      <p className="tai-status tai-status-ok">
        <CheckIcon />
        Saved
      </p>
      {result.summary !== undefined && result.summary !== null ? (
        <FleetReport summary={result.summary} />
      ) : null}
    </>
  );
}
