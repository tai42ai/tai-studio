/**
 * Levels 2 and 3 as one master/detail surface: the route's thread list on the
 * leading edge, the selected thread's transcript beside it. Below 1024 the split
 * collapses to whichever pane the selection names, so the detail pane grows a
 * Back link there — above it both panes are on screen and Back would be a control
 * that undoes nothing visible.
 *
 * Routing is shell-owned: every move is an `AppLink` writing the page's search,
 * never a path this feature composes.
 */
import type { ReactNode, RefObject } from 'react';
import { AppLink, ArrowLeftIcon, Card, EmptyState, useBreakpoint } from '@tai42/studio-sdk';

import { ComposeMessage } from './ComposeMessage';
import { EntryGate } from './EntryGate';
import { useSelectionFocus } from './focus';
import { ThreadList, threadRowLabel } from './ThreadList';
import { ThreadMode } from './ThreadMode';
import { Transcript } from './Transcript';

export function RouteThreads({
  route,
  thread,
  headingRef,
}: {
  readonly route: string;
  readonly thread: string | undefined;
  /** The threads pane's heading — the route drill's focus target. */
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
}): ReactNode {
  const { isSinglePane } = useBreakpoint();
  const focus = useSelectionFocus(thread, threadRowLabel);
  const pane = thread !== undefined ? 'detail' : 'list';

  return (
    <div className="tai-stack">
      <div>
        <AppLink
          to="conversations"
          search={{}}
          className="tai-btn tai-btn-ghost"
          aria-label="Back to all routes"
        >
          <ArrowLeftIcon />
          All routes
        </AppLink>
      </div>

      {/* Route-level management, shown only for a gated-capable (web channel)
          route; every other route renders nothing here. */}
      <EntryGate route={route} />

      <div className="tai-split" data-pane={pane}>
        <div className="tai-split-list">
          <Card>
            {/* Keyed like the transcript beside it: another route is another list,
                never this one re-rendered — what a list has paged in and what it
                has left to say belong to the route it was reading. */}
            <ThreadList
              key={route}
              route={route}
              selected={thread}
              listRef={focus.listRef}
              headingRef={headingRef}
            />
          </Card>
        </div>

        <div className="tai-split-detail tai-stack tai-stack-3">
          {isSinglePane && thread !== undefined ? (
            <div>
              <AppLink
                to="conversations"
                search={{ route }}
                className="tai-btn tai-btn-ghost"
                aria-label="Back to the thread list"
              >
                <ArrowLeftIcon />
                Back
              </AppLink>
            </div>
          ) : null}
          {thread === undefined ? (
            <Card>
              <EmptyState
                title="No thread selected"
                description="Choose a thread to read its transcript."
              />
            </Card>
          ) : (
            /* Keyed by thread so a switch resets each control's own state — the
               mode read, the compose text and any in-flight write belong to the
               thread they were opened on. */
            <div key={thread} className="tai-stack tai-stack-3">
              <ThreadMode route={route} threadId={thread} />
              <Transcript route={route} threadId={thread} headingRef={focus.headingRef} />
              <ComposeMessage route={route} threadId={thread} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
