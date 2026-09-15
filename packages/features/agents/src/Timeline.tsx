/**
 * The streaming run timeline: it folds the flat parsed-event stream into ordered
 * display items ({@link buildTimeline}) and renders them with smart autoscroll —
 * while the viewport is pinned to the bottom, new content pulls the tail into view;
 * scrolling up detaches the follow, and a "Jump to latest" affordance re-pins.
 */
import type { ParsedAgentEvent } from '@tai42/api-client';
import { ArrowDownIcon, Button } from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { buildTimeline } from './build-timeline';
import { TimelineRow } from './timeline-rows';

/** How close to the bottom edge (px) still counts as "pinned to the tail". */
const BOTTOM_SLACK_PX = 32;

// The timeline is its OWN scroll region so following the tail never drags the
// input form above it off-screen: the form stays put and the transcript scrolls
// beneath it. Bounded by the viewport so it never grows without limit.
const timelineFrameStyle: CSSProperties = { position: 'relative' };
const timelineScrollStyle: CSSProperties = { maxHeight: '60vh', overflowY: 'auto' };

// The jump affordance floats over the bottom of the scroll region. The wrapper
// lets clicks fall through to the transcript behind it; only the button itself
// is a target.
const jumpWrapStyle: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 'var(--tai-space-3)',
  display: 'flex',
  justifyContent: 'center',
  pointerEvents: 'none',
};
const jumpButtonStyle: CSSProperties = { pointerEvents: 'auto' };

/**
 * Whether a scroll box sits within `slack` pixels of its bottom edge — the test
 * that gates tail-following. Pure over the three geometry reads, so the decision
 * is unit-testable without a live layout.
 */
export function isAtBottom(
  el: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>,
  slack: number = BOTTOM_SLACK_PX,
): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= slack;
}

/**
 * Render the folded event stream as an ordered timeline with smart autoscroll:
 * while the viewport is pinned to the bottom, new content pulls the tail into
 * view; scrolling up detaches the follow, and a "Jump to latest" affordance
 * appears so the reader can re-pin. The transcript is its own scroll region, so
 * following never moves the input form above it.
 */
export function Timeline({ events }: { readonly events: ParsedAgentEvent[] }): ReactNode {
  const { items } = buildTimeline(events);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [pinned, setPinned] = useState(true);

  // A manual scroll re-decides whether we are still at the tail: scrolling up
  // detaches the follow (and reveals the jump affordance); scrolling back down
  // re-arms it.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (el === null) return;
    setPinned(isAtBottom(el));
  }, []);

  // Jump the scroll region straight to its bottom. Instant and container-only: a
  // smooth or window-level scroll would emit intermediate non-bottom scroll
  // events that flip `pinned` off and drag the input form out of the region.
  const scrollToTail = useCallback(() => {
    const el = scrollRef.current;
    if (el !== null) el.scrollTop = el.scrollHeight;
  }, []);

  // Follow the tail on new content while pinned. The event count is the growth
  // signal: it advances on a fresh item AND on a delta that folds into the open
  // bubble (item count unchanged). Detached, the viewport stays put.
  const eventCount = events.length;
  useEffect(() => {
    if (pinned) scrollToTail();
  }, [eventCount, pinned, scrollToTail]);

  const jumpToLatest = useCallback(() => {
    scrollToTail();
    setPinned(true);
  }, [scrollToTail]);

  return (
    <div style={timelineFrameStyle}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="tai-stack tai-stack-3"
        data-testid="agent-timeline"
        style={timelineScrollStyle}
      >
        {items.map((item) => (
          <TimelineRow key={item.id} item={item} />
        ))}
      </div>
      {!pinned ? (
        <div style={jumpWrapStyle}>
          <Button
            type="button"
            variant="secondary"
            onClick={jumpToLatest}
            style={jumpButtonStyle}
            data-testid="timeline-jump"
            aria-label="Jump to latest"
          >
            <ArrowDownIcon />
            Jump to latest
          </Button>
        </div>
      ) : null}
    </div>
  );
}
