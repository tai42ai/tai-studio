/**
 * One per-target conversation-config row: its target (kind + name), whether it opts
 * into person linking (`multichannel`), its first-contact greeting, and the
 * write-gated Edit / Delete actions. Every server-supplied value renders as escaped
 * React text; no config field is interpreted as markup.
 */
import type { TargetConversationConfig } from '@tai42/api-client';
import { Badge, Button, TD, TR } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { EMPTY_PLACEHOLDER } from './format';

/** The stable identity of a config row — its `(target_kind, target_name)` key. */
export function configRowKey(config: TargetConversationConfig): string {
  return `${config.target_kind}:${config.target_name}`;
}

export function ConfigRow({
  config,
  canWrite,
  canDelete,
  onEdit,
  onDelete,
}: {
  readonly config: TargetConversationConfig;
  readonly canWrite: boolean;
  readonly canDelete: boolean;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}): ReactNode {
  const rowKey = configRowKey(config);
  return (
    <TR>
      <TD>
        <span className="tai-mono">{`${config.target_kind}: ${config.target_name}`}</span>
      </TD>
      <TD>
        <Badge variant={config.multichannel ? 'success' : 'neutral'}>
          {config.multichannel ? 'On' : 'Off'}
        </Badge>
      </TD>
      <TD>
        {config.greeting_template !== null ? (
          <span className="tai-mono">{config.greeting_template}</span>
        ) : (
          <span className="tai-muted">{EMPTY_PLACEHOLDER}</span>
        )}
      </TD>
      <TD style={{ textAlign: 'right' }}>
        <div
          style={{ display: 'inline-flex', gap: 'var(--tai-space-2)', justifyContent: 'flex-end' }}
        >
          {canWrite ? (
            <Button aria-label={`Edit config ${rowKey}`} onClick={onEdit}>
              Edit
            </Button>
          ) : null}
          {canDelete ? (
            <Button variant="ghost" aria-label={`Delete config ${rowKey}`} onClick={onDelete}>
              Delete
            </Button>
          ) : null}
        </div>
      </TD>
    </TR>
  );
}
