import type { CSSProperties, ReactNode } from 'react';

import { AlertTriangleIcon, AppLink, Badge } from '@tai42/studio-sdk';

import { useInbox } from './use-inbox';

// Floats against the page, not modal layers, so it must not paint through an open
// modal: `sticky` is the design system's page-level stacking rung.
const badgeFloatStyle: CSSProperties = {
  position: 'fixed',
  right: 'var(--tai-space-4)',
  bottom: 'var(--tai-space-4)',
  zIndex: 'var(--tai-z-sticky)',
};

const badgeContentStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--tai-space-1)',
};

/**
 * The floating badge: the count of pending interactions, mounted globally by the
 * shell so it is always visible. Reads the live derived `count` (the door's `total`
 * moved by the stream overlay): a terminal frame decrements even for a question on an
 * unloaded page, and a live add moves it without a refetch (the one residual — a frame
 * arriving while a refetch is in flight — reconciles on the next resync). A real
 * anchor to `/interactions` (focusable, keyboard-operable, middle-clickable).
 *
 * DEGRADED: on a true outage — the stream errored AND disconnected, OR a background
 * refetch of the paged base failed — the count is stale, so the badge flips to a
 * warning naming the fault and stays visible even at a stale zero. An outage is
 * never silent. A healthy stream with nothing pending renders nothing.
 */
export function InteractionsBadge(): ReactNode {
  const inbox = useInbox();
  // The interactions store is unconfigured: the stream is terminally 501 and will
  // never carry a question, so the always-mounted badge stays absent rather than
  // hanging at zero on a stream that keeps trying.
  if (inbox.disabled) return null;
  const pending = inbox.count;
  // A true outage means the count is stale: the stream errored AND is not connected,
  // OR a background resync of the paged base failed. A frame error on a still-open
  // stream is transient and does not degrade the badge.
  const streamDown = inbox.streamError !== null && !inbox.connected;
  const degraded = streamDown || inbox.refetchFailed;
  // Healthy and nothing pending → nothing to show. A degraded badge stays visible
  // even at zero so the outage is announced, not swallowed.
  if (pending === 0 && !degraded) return null;
  const countLabel = pending === 1 ? '1 pending question' : `${String(pending)} pending questions`;
  const label = degraded
    ? streamDown
      ? `Interactions stream disconnected — reconnecting (last known: ${countLabel})`
      : `Interactions list failed to refresh — retrying (last known: ${countLabel})`
    : countLabel;
  // role="status" is a polite live region: a newly-arriving count or a flip into the
  // degraded state is announced to a screen reader via the link's label.
  return (
    <div
      role="status"
      data-testid="interactions-badge"
      data-degraded={degraded ? 'true' : undefined}
      style={badgeFloatStyle}
    >
      <AppLink to="interactions" search={{}} aria-label={label}>
        {/* The warning triangle carries the degraded state non-visually too, so the
            outage is perceivable without relying on the warning tint (WCAG 1.4.1). */}
        <Badge variant={degraded ? 'warning' : 'primary'}>
          {degraded ? (
            <span style={badgeContentStyle}>
              <AlertTriangleIcon />
              {pending}
            </span>
          ) : (
            pending
          )}
        </Badge>
      </AppLink>
    </div>
  );
}
