/**
 * One states-table row, opening `?state=` to drive the detail pane. In split mode
 * (a state open) the master pane is narrow, so the numeric/time columns drop and only
 * Name + Subject kinds stay. The Records/Templates/Consumers columns load lazily per
 * row via {@link LazyCountCell}.
 */
import type { StateListItem } from '@tai42/api-client';
import { AppLink, Badge, openTargetProps, TD, TR, useAppNavigate } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { stateAttachmentsKey, stateConsumersKey, stateStatsKey } from './keys';
import { LazyCountCell } from './LazyCountCell';

/** The one platform-validated subject kind; rendered as a primary badge. */
const PERSON_KIND = 'person';

/** Format a row timestamp for the Updated cell: the locale instant, or `—` when unset;
 * an unparseable value shows verbatim (the full ISO rides on the cell's `title`). */
function formatWhen(value: string | null): string {
  if (value === null) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

const nameCellStyle = {
  fontFamily: 'var(--tai-font-mono)',
  display: 'inline-block',
  maxWidth: '24ch',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  verticalAlign: 'bottom',
} as const;

export interface StateRowProps {
  readonly state: StateListItem;
  readonly selected: boolean;
  readonly compact: boolean;
}

export function StateRow({ state, selected, compact }: StateRowProps): ReactNode {
  const navigate = useAppNavigate();
  const openProps = openTargetProps({
    onOpen: () => {
      navigate('states', { state: state.name });
    },
  });
  return (
    <TR
      data-testid={`state-row-${state.name}`}
      {...openProps}
      style={{
        ...(selected ? { background: 'var(--tai-color-surface)' } : {}),
        ...openProps.style,
      }}
    >
      <TD>
        <AppLink
          to="states"
          search={{ state: state.name }}
          aria-label={`Open state ${state.name}`}
          aria-current={selected ? 'page' : undefined}
        >
          <span style={nameCellStyle} title={state.name}>
            {state.name}
          </span>
        </AppLink>
      </TD>
      <TD>
        <span style={{ display: 'inline-flex', gap: 'var(--tai-space-1)', flexWrap: 'wrap' }}>
          {state.subject_kinds.map((kind) => (
            <Badge key={kind} variant={kind === PERSON_KIND ? 'primary' : 'neutral'}>
              {kind}
            </Badge>
          ))}
        </span>
      </TD>
      {compact ? null : (
        <>
          <TD>
            <LazyCountCell
              queryKey={stateStatsKey(state.name)}
              queryFn={(api, signal) => api.getStateStats(state.name, signal)}
              count={(data) => data.records}
            />
          </TD>
          <TD>
            <LazyCountCell
              queryKey={stateAttachmentsKey(state.name)}
              queryFn={(api, signal) => api.listStateAttachments(state.name, signal)}
              count={(data) => data.length}
            />
          </TD>
          <TD>
            <LazyCountCell
              queryKey={stateConsumersKey(state.name)}
              queryFn={(api, signal) => api.stateConsumers(state.name, signal)}
              count={(data) => data.filter((row) => row.unavailable === null).length}
            />
          </TD>
          <TD style={{ whiteSpace: 'nowrap' }} title={state.updated_at ?? undefined}>
            {formatWhen(state.updated_at)}
          </TD>
        </>
      )}
    </TR>
  );
}
