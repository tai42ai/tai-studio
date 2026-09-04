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
import type { ConversationDeliveryStatus } from '@tai42/api-client';

import { ComposeMessage } from './ComposeMessage';
import { ConversationFilters } from './ConversationFilters';
import { EntryGate } from './EntryGate';
import { useSelectionFocus } from './focus';
import { MessageSearch } from './MessageSearch';
import type { ConversationsSearch } from './search';
import { ThreadActions } from './ThreadActions';
import { ThreadList, threadRowLabel } from './ThreadList';
import { ThreadMode } from './ThreadMode';
import { Transcript } from './Transcript';

export function RouteThreads({
  route,
  thread,
  status,
  address,
  q,
  search,
  headingRef,
}: {
  readonly route: string;
  readonly thread: string | undefined;
  readonly status: ConversationDeliveryStatus | undefined;
  readonly address: string | undefined;
  readonly q: string | undefined;
  /** The sanitized page search, for the filter bar's merge-edits. */
  readonly search: ConversationsSearch;
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

      <ConversationFilters search={search} />

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
              status={status}
              address={address}
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
            q !== undefined ? (
              /* No thread picked but a needle is set: the same `q` searches the
                 whole route instead of one thread's transcript. */
              <MessageSearch key={`search:${q}`} route={route} q={q} />
            ) : (
              <Card>
                <EmptyState
                  title="No thread selected"
                  description="Choose a thread to read its transcript, or search message text above."
                />
              </Card>
            )
          ) : (
            /* Keyed by thread so a switch resets each control's own state — the
               mode read, the compose text and any in-flight write belong to the
               thread they were opened on. */
            <div key={thread} className="tai-stack tai-stack-3">
              <ThreadMode route={route} threadId={thread} />
              <Transcript route={route} threadId={thread} q={q} headingRef={focus.headingRef} />
              <ComposeMessage route={route} threadId={thread} />
              <ThreadActions route={route} threadId={thread} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
