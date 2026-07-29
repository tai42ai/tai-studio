/**
 * `MediaGallery` — the display-only media shown WITH an `ask_user` question:
 * images and/or links carried on the `interaction.add` frame's optional `media`
 * field. It is question CONTEXT, never an answer control — it touches no answer,
 * callback, or lifecycle behavior.
 *
 * UNTRUSTED PAYLOADS: every item's `url` and `caption` arrive from the question
 * source and are UNTRUSTED. Captions and urls render ONLY as React-escaped text.
 * The ONLY attribute sinks are the gated image `src` (an image src is admitted
 * exclusively when it is an `https:` URL or a `data:image/` URI — the same
 * https-or-`data:image` rule the server contract and the SPA CSP enforce) and
 * `ExternalLinkButton`'s scheme-gated `href` (its own http(s) allow-list
 * neutralizes every other scheme). There is NO `dangerouslySetInnerHTML` here.
 *
 * Every failure state is LOUD, never a silent skip: a media item that fails the
 * per-item schema parse is a malformed alert; an image whose src fails the scheme
 * gate is a blocked notice (its url shown as escaped text, never a live attribute);
 * an image that fails to LOAD is a visible notice, never a bare broken-image glyph.
 */
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { schemas } from '@tai42/api-client';
import type { InteractionMediaItem } from '@tai42/api-client';
import { Badge, ExternalLinkButton, isSafeHttpUrl } from '@tai42/studio-sdk';

import { MalformedPayload } from './renderers';

/**
 * The image src gate: an image renders ONLY for an `https:` URL or a `data:image/`
 * URI. `isSafeHttpUrl` is TIGHTENED to https-only here (it alone also admits
 * `http:`, which the SPA CSP `img-src` blocks and the contract never emits), and
 * the `data:image/` prefix is the mime pin (`isSafeHttpUrl` rejects every `data:`
 * URI, so it alone would block a legit inline image). The two branches are NOT
 * interchangeable: `http:`, `javascript:`, `data:text/html`, and every other
 * scheme fail BOTH → a loud blocked item. `data:image/*` in an `<img>` cannot
 * execute script (scripting is disabled in image contexts, including SVG-in-img).
 */
function isRenderableImageSrc(url: string): boolean {
  const isHttpsUrl = isSafeHttpUrl(url) && new URL(url).protocol === 'https:';
  return isHttpsUrl || url.startsWith('data:image/');
}

// -- styles ------------------------------------------------------------------

const galleryStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
};

const itemStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-2)',
};

const imageStyle: CSSProperties = {
  maxWidth: '100%',
  maxHeight: '320px',
  width: 'auto',
  height: 'auto',
  objectFit: 'contain',
  borderRadius: 'var(--tai-radius-md)',
  border: '1px solid var(--tai-color-border)',
};

const captionStyle: CSSProperties = {
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};

const blockedStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-1)',
};

const blockedUrlStyle: CSSProperties = {
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
  wordBreak: 'break-all',
};

// -- image item --------------------------------------------------------------

/**
 * One image item. Its own component (not an inline `.map` body) because the
 * load-failure flag is per-image `useState`, which the rules of hooks forbid inside
 * a `.map` callback. `referrerPolicy="no-referrer"` is REQUIRED: it stops the
 * Studio URL (which can encode the interaction/operator context) from leaking to
 * the image host on a remote-image load.
 */
function MediaImage({
  url,
  caption,
}: {
  readonly url: string;
  readonly caption?: string;
}): ReactNode {
  // The load-failure state keys on the url that failed, not a bare boolean, so a
  // new url rendered at this same position gets a fresh load attempt instead of
  // inheriting a stale failure notice.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!isRenderableImageSrc(url)) {
    return (
      <div role="alert" data-testid="media-item-blocked" style={blockedStyle}>
        <Badge variant="danger">Blocked image</Badge>
        <span style={blockedUrlStyle}>{url}</span>
      </div>
    );
  }

  if (failedUrl === url) {
    return (
      <div role="alert" data-testid="media-image-error" style={blockedStyle}>
        <Badge variant="danger">Image failed to load</Badge>
        <span style={blockedUrlStyle}>{url}</span>
      </div>
    );
  }

  return (
    <div style={itemStyle}>
      <img
        src={url}
        alt={caption ?? 'Attached image'}
        referrerPolicy="no-referrer"
        style={imageStyle}
        onError={() => {
          setFailedUrl(url);
        }}
      />
      {caption !== undefined ? <span style={captionStyle}>{caption}</span> : null}
    </div>
  );
}

// -- one item ----------------------------------------------------------------

/** Render one media item after validating it per item against the item schema. */
function MediaItemView({
  item,
  index,
}: {
  readonly item: unknown;
  readonly index: number;
}): ReactNode {
  const parsed = schemas.interactionMediaItem.safeParse(item);
  if (!parsed.success) {
    return (
      <MalformedPayload
        testId="media-item-malformed"
        message={`Media item ${String(index + 1)} is malformed and was not shown.`}
      />
    );
  }

  const media: InteractionMediaItem = parsed.data;
  // A blank (empty/whitespace) caption is treated as absent so the img alt and the
  // link label fall back to their defaults rather than rendering an empty `alt=""`
  // (a decorative-image signal, wrong for a content image) or a blank link label.
  const caption =
    typeof media.caption === 'string' && media.caption.trim() !== '' ? media.caption : undefined;

  if (media.kind === 'image') {
    return <MediaImage url={media.url} caption={caption} />;
  }
  // A link: `ExternalLinkButton` scheme-checks the href — a `javascript:`/`data:`
  // (or any non-http(s)) url is neutralized to non-navigable text. `http:` links
  // are valid (anchors are not governed by the image gate).
  return (
    <div style={itemStyle} data-testid="media-item-link">
      <ExternalLinkButton url={media.url}>{caption ?? media.url}</ExternalLinkButton>
    </div>
  );
}

// -- gallery -----------------------------------------------------------------

export function MediaGallery({ media }: { readonly media: readonly unknown[] }): ReactNode {
  return (
    <div data-testid="media-gallery" style={galleryStyle}>
      {media.map((item, index) => (
        <MediaItemView key={index} item={item} index={index} />
      ))}
    </div>
  );
}
