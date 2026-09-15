/**
 * One trigger-link table row: name, topic, the bound execution key, the trigger-auth
 * door, expiry, a params indicator, the token hash prefix, and a per-row revoke
 * (shown only to a writer). The raw token is never shown — only its hash prefix.
 */
import type { TriggerLinkRecord } from '@tai42/api-client';
import { Badge, Button, TD, TR } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { formatExpiry } from './expiry';
import { describeTriggerAuth } from './trigger-auth';

/** A link carries params when `tool_kwargs` is a NON-EMPTY object; `{}` and `null`
 * both read as param-less. */
function hasParams(record: TriggerLinkRecord): boolean {
  return record.tool_kwargs !== null && Object.keys(record.tool_kwargs).length > 0;
}

export interface TriggerLinkRowProps {
  readonly record: TriggerLinkRecord;
  readonly canWrite: boolean;
  readonly onRevoke: (name: string) => void;
}

export function TriggerLinkRow({ record, canWrite, onRevoke }: TriggerLinkRowProps): ReactNode {
  return (
    <TR>
      <TD>{record.name}</TD>
      <TD>{record.topic}</TD>
      <TD>
        <code style={{ fontSize: 'var(--tai-text-sm)' }}>{record.execution_key}</code>
      </TD>
      <TD>
        <Badge variant="neutral">{describeTriggerAuth(record.trigger_auth)}</Badge>
      </TD>
      <TD>{formatExpiry(record.expires_at, { nullLabel: 'Permanent' })}</TD>
      <TD>{hasParams(record) ? <Badge variant="neutral">params</Badge> : null}</TD>
      <TD>
        <code style={{ fontSize: 'var(--tai-text-sm)' }}>{record.token_hash_prefix}</code>
      </TD>
      <TD style={{ textAlign: 'right' }}>
        {canWrite ? (
          <Button
            variant="ghost"
            aria-label={`Revoke trigger link ${record.name}`}
            onClick={() => {
              onRevoke(record.name);
            }}
          >
            Revoke
          </Button>
        ) : null}
      </TD>
    </TR>
  );
}
