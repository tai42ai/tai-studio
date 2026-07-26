/**
 * `ExternalLinkButton` — an open-link action whose href is scheme-checked
 * against an http/https allow-list. A `javascript:`/`data:`/other-scheme URL is
 * NOT navigable: it is NEUTRALIZED, rendered as plain text (no anchor, no
 * href), so a hostile URL can never become a live navigation target. This is an
 * XSS pin.
 *
 * The check and the rendering both live in `Button`'s link form — this module
 * is the named entry point for it, not a second implementation.
 */
import type { ReactNode } from 'react';

import { Button } from './primitives';

export { isSafeHttpUrl } from './primitives';

export interface ExternalLinkButtonProps {
  readonly url: string;
  readonly children?: ReactNode;
}

export function ExternalLinkButton({ url, children }: ExternalLinkButtonProps) {
  return <Button href={url}>{children ?? url}</Button>;
}
