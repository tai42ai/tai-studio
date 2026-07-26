/**
 * `ExternalLinkButton` — an open-link action for a URL the Studio did not author
 * (a registry homepage, an interaction payload's link). Only an ABSOLUTE
 * `http(s)` URL is navigable here: every other spelling — another scheme, and a
 * relative reference, which would be a same-origin in-app navigation the caller
 * never intended — is NEUTRALIZED into plain text with no anchor and no href.
 * This is an XSS pin.
 *
 * The check and the neutralized rendering are `Button`'s; this module chooses the
 * stricter of the two link policies rather than re-implementing either.
 */
import type { ReactNode } from 'react';

import {
  Button,
  buttonClass,
  DEFAULT_BUTTON_VARIANT,
  isSafeHttpUrl,
  NeutralizedLink,
} from './primitives';

export { isSafeHttpUrl } from './primitives';

export interface ExternalLinkButtonProps {
  readonly url: string;
  readonly children?: ReactNode;
}

export function ExternalLinkButton({ url, children }: ExternalLinkButtonProps) {
  const label = children ?? url;
  if (!isSafeHttpUrl(url)) {
    // The same classes the navigable form wears, so the two never drift apart.
    return (
      <NeutralizedLink className={buttonClass(DEFAULT_BUTTON_VARIANT, undefined)}>
        {label}
      </NeutralizedLink>
    );
  }
  return <Button href={url}>{label}</Button>;
}
