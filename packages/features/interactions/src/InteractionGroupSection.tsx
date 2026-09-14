import { useId, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { Badge, Card, ChevronDownIcon, ChevronRightIcon } from '@tai42/studio-sdk';
import type { StreamInteraction } from '@tai42/studio-sdk';

import { groupPendingLabel } from './inbox-grouping';
import type { InteractionGroup } from './inbox-grouping';
import { InteractionCard } from './renderers';

export const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

export const groupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
};

const groupHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
  justifyContent: 'flex-start',
};

/**
 * A collapsible section for a multi-question group: a header button (keyboard
 * operable, `aria-expanded`) carrying the group's pending count over the group's
 * question cards. Defaults to expanded so its questions are actionable without a
 * first click.
 */
export function InteractionGroupSection({
  group,
  submittingId,
  onSubmit,
  onCancel,
}: {
  readonly group: InteractionGroup;
  readonly submittingId: string | undefined;
  readonly onSubmit: (interaction: StreamInteraction, answer: unknown) => void;
  readonly onCancel: (interaction: StreamInteraction) => void;
}): ReactNode {
  const [open, setOpen] = useState(true);
  const panelId = useId();
  return (
    <Card>
      <div style={groupStyle} data-testid="interaction-group" data-group-id={group.groupId}>
        <button
          type="button"
          className="tai-btn tai-btn-ghost"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            setOpen((prev) => !prev);
          }}
          style={groupHeaderStyle}
        >
          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
          <span>Related questions</span>
          <Badge variant={group.pending > 0 ? 'primary' : 'neutral'}>
            {groupPendingLabel(group)}
          </Badge>
        </button>
        {open ? (
          <div id={panelId} style={listStyle}>
            {group.items.map((interaction) => (
              <InteractionCard
                key={interaction.interaction_id}
                interaction={interaction}
                disabled={submittingId === interaction.interaction_id}
                onSubmit={(answer) => {
                  onSubmit(interaction, answer);
                }}
                onCancel={() => {
                  onCancel(interaction);
                }}
              />
            ))}
          </div>
        ) : null}
      </div>
    </Card>
  );
}
