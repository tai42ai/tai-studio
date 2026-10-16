/**
 * The line above a Records table when some of the state's subjects are held by a failed pending
 * save: their rows show the last applied data. "Pending saves" scrolls to the card that retries
 * or discards the save. Nothing renders when no subject is held.
 */
import type { HeldPendingSave } from '@tai42/api-client';
import type { ReactNode } from 'react';

import { subjectIdentity } from './keys';
import { PENDING_SAVES_CARD_ID } from './PendingSavesCard';

export function HeldSubjectsLine({
  held = [],
}: {
  readonly held?: readonly HeldPendingSave[] | undefined;
}): ReactNode {
  const subjects = new Set(
    held.flatMap((save) => save.subjects.map((subject) => subjectIdentity(subject))),
  );
  if (subjects.size === 0) return null;
  return (
    <p style={{ margin: 0, color: 'var(--tai-color-warn-text)' }} data-testid="held-subjects-line">
      {subjects.size} subject(s) on this state are held by a failed pending save and show their last
      applied data. Retry or discard it under{' '}
      <button
        type="button"
        className="tai-link"
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          font: 'inherit',
          cursor: 'pointer',
        }}
        onClick={() => {
          document.getElementById(PENDING_SAVES_CARD_ID)?.scrollIntoView({ behavior: 'smooth' });
        }}
      >
        Pending saves
      </button>
      .
    </p>
  );
}
