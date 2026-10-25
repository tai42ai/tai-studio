/**
 * The connect flow's Pick tools step: one section per server title, each listing the
 * tools the server advertises (a probe with the stored credential, so it runs when
 * the step opens and on Retry only) with a tick per tool. One Save writes the
 * sections whose pick differs from their stored lists, one at a time in section
 * order: every write reloads the fleet behind the reload gate, which refuses a write
 * that arrives during another reload.
 */
import {
  type FleetReportSummary,
  type McpAdvertisedTools,
  summarizeFleetFanout,
} from '@tai42/api-client';
import { Button, Field, mcpAdvertisedToolsKey, useApi } from '@tai42/studio-sdk';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import {
  draftBlocked,
  draftBody,
  initialDraft,
  type PickDraft,
  sameBody,
  type ToolFilterBody,
} from './pick-tools-model';
import { SectionBody, SectionOutcome, SectionRead, type SectionResult } from './pick-tools-section';

/** A section saved by the step, with the fleet report of its write. */
export interface SavedPick {
  readonly title: string;
  readonly summary: FleetReportSummary | null;
}

type AdvertisedRead = UseQueryResult<McpAdvertisedTools>;

function storedBody(read: McpAdvertisedTools): ToolFilterBody {
  return { include: read.include, exclude: read.exclude };
}

/** The sections' drafts, each seeded once its read answers, and the edit that sets one. */
function usePickDrafts(
  titles: readonly string[],
  reads: readonly AdvertisedRead[],
): [Record<string, PickDraft>, (title: string, draft: PickDraft) => void] {
  const [drafts, setDrafts] = useState<Record<string, PickDraft>>({});
  useEffect(() => {
    setDrafts((previous) => {
      let next = previous;
      titles.forEach((title, index) => {
        const data = reads[index]?.data;
        if (data !== undefined && previous[title] === undefined) {
          next = { ...next, [title]: initialDraft(data) };
        }
      });
      return next;
    });
  }, [titles, reads]);
  const editDraft = (title: string, draft: PickDraft): void => {
    setDrafts((previous) => ({ ...previous, [title]: draft }));
  };
  return [drafts, editDraft];
}

/**
 * Each section's write: its drafted body when it differs from the last saved or the
 * stored lists, else null; and whether its draft cannot be saved.
 */
function pickSections(
  titles: readonly string[],
  reads: readonly AdvertisedRead[],
  drafts: Record<string, PickDraft>,
  results: Record<string, SectionResult>,
): { title: string; body: ToolFilterBody | null; blocked: boolean }[] {
  return titles.map((title, index) => {
    const read = reads[index]?.data;
    const draft = drafts[title];
    if (read === undefined || draft === undefined) return { title, body: null, blocked: false };
    const body = draftBody(read, draft);
    const baseline = results[title]?.saved ?? storedBody(read);
    return {
      title,
      body: sameBody(body, baseline) ? null : body,
      blocked: draftBlocked(read, draft),
    };
  });
}

export function PickToolsStep({
  titles,
  justAdded,
  addFleet,
  onDone,
  onDirtyChange,
  onLeave,
}: {
  readonly titles: readonly string[];
  /** The titles were just added by this flow's own Connect step. */
  readonly justAdded: boolean;
  /** The fleet report of the connect or install that added them, when it did not converge. */
  readonly addFleet: FleetReportSummary | null;
  readonly onDone: (saved: readonly SavedPick[]) => void;
  readonly onDirtyChange: (dirty: boolean) => void;
  /** Called before a holder link navigates away. */
  readonly onLeave: () => void;
}): ReactNode {
  const api = useApi();
  const reads = useQueries({
    queries: titles.map((title) => ({
      queryKey: mcpAdvertisedToolsKey(title),
      queryFn: ({ signal }: { signal: AbortSignal }) => api.listMcpAdvertisedTools(title, signal),
      staleTime: Infinity,
      refetchOnWindowFocus: false,
    })),
  });
  const [drafts, editDraft] = usePickDrafts(titles, reads);
  const [results, setResults] = useState<Record<string, SectionResult>>({});
  const [progress, setProgress] = useState<{ i: number; n: number; title: string } | null>(null);
  const saveRef = useRef<HTMLButtonElement>(null);

  const sections = pickSections(titles, reads, drafts, results);
  const pending = sections.filter((section) => section.body !== null);
  const blocked = sections.find((section) => section.blocked);
  const dirty = pending.length > 0;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  const anyFailed = titles.some((title) => results[title]?.error !== undefined);
  const savedList = (current: Record<string, SectionResult>): SavedPick[] =>
    titles
      .filter((title) => current[title]?.saved !== undefined)
      .map((title) => ({ title, summary: current[title]?.summary ?? null }));

  const save = async (): Promise<void> => {
    if (pending.length === 0) {
      onDone(savedList(results));
      return;
    }
    let current = results;
    for (const [i, section] of pending.entries()) {
      const body = section.body;
      if (body === null) continue;
      setProgress({ i: i + 1, n: pending.length, title: section.title });
      try {
        const reply = await api.setMcpToolFilter(section.title, {
          include: [...body.include],
          exclude: [...body.exclude],
        });
        current = {
          ...current,
          [section.title]: {
            saved: body,
            summary: summarizeFleetFanout(
              reply.fanout,
              reply.awaiting_respawn,
              reply.span_release_error,
            ),
          },
        };
        setResults(current);
      } catch (error: unknown) {
        current = { ...current, [section.title]: { error } };
        setResults(current);
        setProgress(null);
        saveRef.current?.focus();
        return;
      }
    }
    setProgress(null);
    onDone(savedList(current));
  };

  let label = 'Save';
  if (progress !== null) label = `Saving ${String(progress.i)} of ${String(progress.n)}…`;
  else if (pending.length === 0) label = 'Continue';
  else if (anyFailed) label = 'Save remaining';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
      {titles.map((title, index) => {
        const query = reads[index];
        const draft = drafts[title];
        const content = (
          <>
            {query?.isSuccess === true && draft !== undefined ? (
              <SectionBody
                read={query.data}
                draft={draft}
                onDraft={(next) => {
                  editDraft(title, next);
                }}
              />
            ) : (
              <SectionRead title={title} query={query} justAdded={justAdded} addFleet={addFleet} />
            )}
            <SectionOutcome
              title={title}
              read={query?.data}
              draft={draft}
              result={results[title]}
              onLeave={onLeave}
            />
          </>
        );
        return titles.length === 1 ? (
          <div key={title}>{content}</div>
        ) : (
          <Field key={title} label={title} group>
            {content}
          </Field>
        );
      })}
      {progress !== null ? (
        <p role="status" className="tai-status">{`Saving ${progress.title}…`}</p>
      ) : null}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 'var(--tai-space-2)',
        }}
      >
        {blocked !== undefined ? (
          <span className="tai-status">{`Tick at least one tool in ${blocked.title}, or turn on mount every tool.`}</span>
        ) : null}
        <Button
          ref={saveRef}
          variant="primary"
          disabled={progress !== null || blocked !== undefined}
          onClick={() => void save()}
        >
          {label}
        </Button>
      </div>
    </div>
  );
}
