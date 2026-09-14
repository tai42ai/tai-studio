import type { ReactNode } from 'react';

import { Badge } from '@tai42/studio-sdk';

import { malformedStyle } from './renderer-styles';

/**
 * A LOUD inline notice for structurally-malformed content (a bad `format_payload`
 * — bad options, a non-object form schema, a non-string url — or a malformed media
 * item). It renders as a visible `alert` rather than degrading to an empty or
 * silently-dropped control. `testId` defaults to the format-payload test id; the
 * media gallery passes its own so both callers reuse this single alert visual.
 */
export function MalformedPayload({
  message,
  testId = 'malformed-payload',
}: {
  readonly message: string;
  readonly testId?: string;
}): ReactNode {
  return (
    <div role="alert" data-testid={testId} style={malformedStyle}>
      <Badge variant="danger">Malformed</Badge>
      <span style={{ color: 'var(--tai-color-text-muted)', fontSize: 'var(--tai-text-sm)' }}>
        {message}
      </span>
    </div>
  );
}
