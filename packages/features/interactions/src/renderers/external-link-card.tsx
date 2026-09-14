import type { ReactNode } from 'react';

import type { Interaction } from '@tai42/api-client';
import { ExternalLinkButton } from '@tai42/studio-sdk';

import { MalformedPayload } from './malformed-payload';

export function ExternalLinkCard({
  interaction,
}: {
  readonly interaction: Interaction;
}): ReactNode {
  const url = interaction.format_payload.url;
  if (typeof url !== 'string') {
    return (
      <MalformedPayload message="This link question is malformed: its url must be a text value." />
    );
  }
  // `ExternalLinkButton` scheme-checks the href: a `javascript:`/`data:` url is
  // neutralized to non-navigable text (an XSS pin), only `http`/`https` navigate.
  return (
    <div data-testid="external-link">
      <ExternalLinkButton url={url} />
    </div>
  );
}
