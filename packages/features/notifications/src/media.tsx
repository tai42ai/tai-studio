/**
 * `NotificationMedia` — the display-only media stored WITH an internal-sink
 * notification: images and/or links the `notify_user` call carried when it named
 * no channel, so they surface only in this inbox. It is message CONTEXT, never a
 * control — it touches no answer, callback, or lifecycle behavior.
 *
 * This mirrors the interactions inbox's `MediaGallery` idiom (a per-item scheme
 * gate + loud fallbacks, sharing the `interactionMediaItem` item schema — the
 * wire `MediaItem` shape is identical), with ONE deliberate difference: the sink
 * stores media RAW, so an image may be a `data:image/*` URI (kept inline, never
 * substituted to a served reference). The gate therefore admits `data:image/*` in
 * addition to an `https:` URL and the platform's own same-origin served-media
 * reference — exactly the image forms the server `MediaItem` contract accepts and
 * the inbox CSP `img-src` (`https:`/`data:`/same-origin) permits.
 *
 * UNTRUSTED PAYLOADS: every item's `url` and `caption` arrive from the notify
 * caller and are UNTRUSTED. Captions and urls render ONLY as React-escaped text.
 * The ONLY attribute sinks are the gated image `src` and `ExternalLinkButton`'s
 * scheme-gated `href`. There is NO `dangerouslySetInnerHTML` here. Rendering a
 * `data:image/*` through an `<img src>` is inert — a browser never executes a
 * `data:` image as script (an SVG data URI only runs script when NAVIGATED to or
 * embedded as a document, not when loaded as an image).
 *
 * Every failure state is LOUD, never a silent skip: an item that fails the
 * per-item schema parse is a malformed alert; an image whose src fails the scheme
 * gate is a blocked notice (its url shown as escaped text, never a live attribute);
 * an image that fails to LOAD is a visible notice, never a bare broken-image glyph.
 */
import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { schemas } from '@tai42/api-client';
import type { InteractionMediaItem } from '@tai42/api-client';
import { Badge, ExternalLinkButton, isSafeHttpUrl, useApi } from '@tai42/studio-sdk';

/**
 * The served-media route: media stored BY REFERENCE is served from the API origin
 * at `MEDIA_ROUTE_PREFIX + <id>`, where the id is 43 urlsafe-base64 chars (32
 * random bytes). A record may carry it as a RELATIVE url of exactly that shape —
 * the platform's own media reference, resolved to the API base at render time
 * (`resolveImageSrc`), not assumed same-origin as the SPA page.
 */
const MEDIA_ROUTE_PREFIX = '/api/interactions/media/';
const MEDIA_ID = /^[A-Za-z0-9_-]{43}$/;
/** The inline-image form the sink keeps RAW (never substituted to a reference). */
const DATA_IMAGE_PREFIX = 'data:image/';

function isServedMediaUrl(url: string): boolean {
  return url.startsWith(MEDIA_ROUTE_PREFIX) && MEDIA_ID.test(url.slice(MEDIA_ROUTE_PREFIX.length));
}

function isDataImageUrl(url: string): boolean {
  return url.startsWith(DATA_IMAGE_PREFIX);
}

/**
 * The image src gate: an image renders ONLY for an `https:` URL, a `data:image/*`
 * URI (the sink's raw inline form), or the platform's own served-media reference (a
 * relative `MEDIA_ROUTE_PREFIX + <id>`). `isSafeHttpUrl` is TIGHTENED to https-only
 * here (it alone also admits `http:`, which the inbox CSP `img-src` blocks and the
 * contract never emits for an image); the data-image branch pins the `data:image/`
 * prefix so a non-image `data:` scheme is refused; the served-media branch pins a
 * well-formed platform media id. Every other-shaped url — `http:`, `javascript:`, a
 * `data:` that is not an image, any other relative path — fails all three → a loud
 * blocked item. The gate keys on the reference form; `resolveImageSrc` joins an
 * admitted reference to the API base for the actual load.
 */
function isRenderableImageSrc(url: string): boolean {
  const isHttpsUrl = isSafeHttpUrl(url) && new URL(url).protocol === 'https:';
  return isHttpsUrl || isDataImageUrl(url) || isServedMediaUrl(url);
}

/**
 * The URL an admitted image actually loads. An `https:` url and a `data:image/*`
 * URI are self-contained and returned unchanged. A served-media reference is
 * RELATIVE and is joined to the API origin (`baseUrl`) — NOT the SPA page origin: in
 * a cross-origin deployment the two differ, and a page-relative src would resolve
 * against Studio and 404. An empty `baseUrl` (same-origin deployment) leaves the
 * reference relative, which is correct; a configured base's trailing slash is
 * stripped so the join never double-slashes.
 */
function resolveImageSrc(url: string, baseUrl: string): string {
  return isServedMediaUrl(url) ? `${baseUrl.replace(/\/+$/, '')}${url}` : url;
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

const noticeStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-1)',
};

const noticeUrlStyle: CSSProperties = {
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
  wordBreak: 'break-all',
};

// -- image item --------------------------------------------------------------

/**
 * One image item. Its own component (not an inline `.map` body) because the
 * load-failure flag is per-image `useState`, which the rules of hooks forbid inside
 * a `.map` callback. `referrerPolicy="no-referrer"` is REQUIRED: it stops the Studio
 * URL (which can encode operator context) from leaking to the image host on a
 * remote-image load.
 */
function MediaImage({
  url,
  caption,
}: {
  readonly url: string;
  readonly caption?: string;
}): ReactNode {
  // The load-failure state keys on the url that failed, not a bare boolean, so a new
  // url rendered at this same position gets a fresh load attempt instead of
  // inheriting a stale failure notice.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const { baseUrl } = useApi();

  if (!isRenderableImageSrc(url)) {
    return (
      <div role="alert" data-testid="notification-media-blocked" style={noticeStyle}>
        <Badge variant="danger">Blocked image</Badge>
        <span style={noticeUrlStyle}>{url}</span>
      </div>
    );
  }

  if (failedUrl === url) {
    return (
      <div role="alert" data-testid="notification-media-error" style={noticeStyle}>
        <Badge variant="danger">Image failed to load</Badge>
        <span style={noticeUrlStyle}>{url}</span>
      </div>
    );
  }

  return (
    <div style={itemStyle}>
      <img
        src={resolveImageSrc(url, baseUrl)}
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
      <div role="alert" data-testid="notification-media-malformed" style={noticeStyle}>
        <Badge variant="danger">Malformed</Badge>
        <span
          style={captionStyle}
        >{`Media item ${String(index + 1)} is malformed and was not shown.`}</span>
      </div>
    );
  }

  const media: InteractionMediaItem = parsed.data;
  // A blank (empty/whitespace) caption is treated as absent so the img alt and the
  // link label fall back to their defaults rather than rendering an empty `alt=""` (a
  // decorative-image signal, wrong for a content image) or a blank link label.
  const caption =
    typeof media.caption === 'string' && media.caption.trim() !== '' ? media.caption : undefined;

  if (media.kind === 'image') {
    return <MediaImage url={media.url} caption={caption} />;
  }
  // A link: `ExternalLinkButton` scheme-checks the href — a `javascript:`/`data:` (or
  // any non-http(s)) url is neutralized to non-navigable text.
  return (
    <div style={itemStyle} data-testid="notification-media-link">
      <ExternalLinkButton url={media.url}>{caption ?? media.url}</ExternalLinkButton>
    </div>
  );
}

// -- gallery -----------------------------------------------------------------

/** The list of media items stored on one notification, rendered in order. */
export function NotificationMedia({ media }: { readonly media: readonly unknown[] }): ReactNode {
  return (
    <div data-testid="notification-media" style={galleryStyle}>
      {media.map((item, index) => (
        <MediaItemView key={index} item={item} index={index} />
      ))}
    </div>
  );
}
