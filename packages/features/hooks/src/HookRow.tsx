/**
 * One registered-hook table row: name / topic / tool, the execution key, the
 * server-derived trigger-auth door, a condition badge and one badge per set
 * door-contract jq (start / cancel / resume / extras), and per-row Edit / Delete doors.
 */
import type { HookParams, TriggerAuth } from '@tai42/api-client';
import { Badge, Button, TD, TR } from '@tai42/studio-sdk';
import { type ReactNode, useEffect, useRef } from 'react';

import { describeTriggerAuth } from './trigger-auth';

export interface HookRowProps {
  readonly hook: HookParams;
  /** The topic's server-derived door; `undefined` renders as "Unknown". */
  readonly door: TriggerAuth | undefined;
  readonly onEdit: (hook: HookParams) => void;
  readonly onDelete: (name: string) => void;
  /** The row a deep link points at: marked current on the accent tint, scrolled to. */
  readonly highlighted?: boolean;
}

export function HookRow({
  hook,
  door,
  onEdit,
  onDelete,
  highlighted = false,
}: HookRowProps): ReactNode {
  const rowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (highlighted) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);
  return (
    <TR
      ref={rowRef}
      aria-current={highlighted ? 'true' : undefined}
      style={highlighted ? { background: 'var(--tai-color-accent-tint)' } : undefined}
    >
      <TD>{hook.name}</TD>
      <TD>{hook.topic}</TD>
      <TD>{hook.tool}</TD>
      <TD>
        <code style={{ fontSize: 'var(--tai-text-sm)' }}>{hook.execution_key}</code>
      </TD>
      <TD>
        <Badge variant="neutral">
          {door === undefined ? 'Unknown' : describeTriggerAuth(door)}
        </Badge>
      </TD>
      <TD>
        <div style={{ display: 'flex', gap: 'var(--tai-space-1)' }}>
          {hook.condition !== null ? <Badge variant="primary">condition</Badge> : null}
          {hook.start_expr !== null ? <Badge variant="neutral">start</Badge> : null}
          {hook.cancel_expr !== null ? <Badge variant="neutral">cancel</Badge> : null}
          {hook.resume_expr !== null ? <Badge variant="neutral">resume</Badge> : null}
          {hook.extras_expr !== null ? <Badge variant="neutral">extras</Badge> : null}
        </div>
      </TD>
      <TD style={{ textAlign: 'right' }}>
        <div
          style={{ display: 'inline-flex', gap: 'var(--tai-space-2)', justifyContent: 'flex-end' }}
        >
          <Button
            aria-label={`Edit hook ${hook.name}`}
            onClick={() => {
              onEdit(hook);
            }}
          >
            Edit
          </Button>
          <Button
            variant="ghost"
            aria-label={`Delete hook ${hook.name}`}
            onClick={() => {
              onDelete(hook.name);
            }}
          >
            Delete
          </Button>
        </div>
      </TD>
    </TR>
  );
}
