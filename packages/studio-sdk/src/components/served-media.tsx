/**
 * Served-media rendering primitives: the discipline for showing platform media by
 * reference. A feature renders media through these so the reference gate, the origin
 * join, and the per-image load-failure handling live here ONCE and are never
 * reimplemented per feature. A raw-storing sink opts in to inline `data:image/*` via
 * `allowDataImage`; every other caller renders only served references and `https:` urls.
 *
 * UNTRUSTED PAYLOADS: a `url` arrives from an untrusted sender. It reaches an
 * attribute sink ONLY through {@link isRenderableMediaSrc} (an `https:` URL, the
 * platform's own served-media reference, or — for a raw-storing sink that opts in —
 * an inline `data:image/*` URI) joined by {@link resolveMediaSrc}; any other-shaped
 * url is a loud blocked notice, its text React-escaped, never a live attribute.
 * There is no `dangerouslySetInnerHTML` here.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';

import { useApi } from '../hooks/useApi';
import { Badge } from './badge';
import { isSafeHttpUrl } from './primitives';

/**
 * The served-media route: media is stored by reference and served from the API
 * origin at `MEDIA_ROUTE_PREFIX + <id>`, where the id is 43 urlsafe-base64 chars
 * (32 random bytes). A record carries it as a RELATIVE url of exactly that shape —
 * the platform's own media reference, resolved to the API base at render time
 * ({@link resolveMediaSrc}), not assumed same-origin as the SPA page.
 */
const MEDIA_ROUTE_PREFIX = '/api/interactions/media/';
const MEDIA_ID = /^[A-Za-z0-9_-]{43}$/;

/**
 * Whether `url` is the platform's own served-media reference: a relative
 * `MEDIA_ROUTE_PREFIX + <id>` with a well-formed 43-char urlsafe-base64 id. A served
 * reference is same-origin to the API base ({@link resolveMediaSrc}) and leaks no page
 * context on load, so a sink with no per-element referrer control (`<audio>`/`<video>`,
 * where `referrerPolicy` is not a valid attribute) admits ONLY this form.
 */
export function isServedMediaUrl(url: string): boolean {
  return url.startsWith(MEDIA_ROUTE_PREFIX) && MEDIA_ID.test(url.slice(MEDIA_ROUTE_PREFIX.length));
}

/**
 * The media src gate: a media element renders ONLY for an `https:` URL, the
 * platform's own served-media reference (a relative `MEDIA_ROUTE_PREFIX + <id>`),
 * or — when the caller opts in with `allowDataImage` — an inline `data:image/*` URI.
 * `isSafeHttpUrl` is TIGHTENED to https-only here (it alone also admits `http:`,
 * which the Studio CSP `img-src`/`media-src` blocks and the contract never emits);
 * the served-media branch pins a well-formed platform media id (a relative url
 * `isSafeHttpUrl` cannot parse). `allowDataImage` defaults OFF: only a sink that
 * stores media RAW (never substituted to a served reference) opts in, and even then
 * ONLY `data:image/*` is admitted — a `data:` of any other type (`data:text/html`,
 * an SVG document, …) is ALWAYS blocked. `http:`, `javascript:`, a non-image
 * `data:`, and any other-shaped relative url fail every branch → a loud blocked
 * item. The gate keys on the reference form; {@link resolveMediaSrc} joins an
 * admitted reference to the API base for the actual load.
 */
export function isRenderableMediaSrc(url: string, allowDataImage = false): boolean {
  const isHttpsUrl = isSafeHttpUrl(url) && new URL(url).protocol === 'https:';
  return isHttpsUrl || (allowDataImage && url.startsWith('data:image/')) || isServedMediaUrl(url);
}

/**
 * The URL an admitted media element actually loads. An `https:` url is already
 * absolute and is returned unchanged. A served-media reference is RELATIVE and is
 * joined to the API origin (`baseUrl`) — NOT the SPA page origin: in a cross-origin
 * deployment the two differ, and a page-relative src would resolve against Studio
 * and 404. An empty `baseUrl` (same-origin deployment) leaves the reference
 * relative, which is correct; a configured base's trailing slash is stripped so the
 * join never double-slashes.
 */
export function resolveMediaSrc(url: string, baseUrl: string): string {
  return isServedMediaUrl(url) ? `${baseUrl.replace(/\/+$/, '')}${url}` : url;
}

// -- styles ------------------------------------------------------------------

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

export interface MediaImageProps {
  readonly url: string;
  readonly caption?: string;
  /** The `alt` text when the item carries no caption. */
  readonly altFallback?: string;
  /**
   * Render the notice shown when no image is displayed: `state` is `'blocked'` when
   * the url fails the src gate and `'failed'` when an admitted url fails to LOAD, and
   * `url` is that url. When omitted, the SDK's own danger-badge notice (with the url)
   * is rendered.
   */
  readonly renderNotice?: (state: 'blocked' | 'failed', url: string) => ReactNode;
  /**
   * Opt in to inline `data:image/*` sources (default OFF). Set ONLY by a sink that
   * stores media raw; a `data:` of any other type stays blocked. See
   * {@link isRenderableMediaSrc}.
   */
  readonly allowDataImage?: boolean;
}

/**
 * One served/remote image. Its own component (not an inline `.map` body) because the
 * load-failure flag is per-image `useState`, which the rules of hooks forbid inside a
 * `.map` callback. `referrerPolicy="no-referrer"` is REQUIRED: it stops the Studio URL
 * (which can encode the interaction/operator context) from leaking to the image host
 * on a remote-image load. `altFallback` supplies the `alt` when the item has no caption;
 * a caller overrides it for its own content and can supply `renderNotice` to render the
 * blocked/failed states in its own presentation.
 */
export function MediaImage({
  url,
  caption,
  altFallback = 'Attached image',
  renderNotice,
  allowDataImage = false,
}: MediaImageProps): ReactNode {
  // The load-failure state keys on the url that failed, not a bare boolean, so a new
  // url rendered at this same position gets a fresh load attempt instead of inheriting
  // a stale failure notice.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const { baseUrl } = useApi();

  if (!isRenderableMediaSrc(url, allowDataImage)) {
    if (renderNotice !== undefined) return renderNotice('blocked', url);
    return (
      <div role="alert" data-testid="media-item-blocked" style={blockedStyle}>
        <Badge variant="danger">Blocked image</Badge>
        <span style={blockedUrlStyle}>{url}</span>
      </div>
    );
  }

  if (failedUrl === url) {
    if (renderNotice !== undefined) return renderNotice('failed', url);
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
        src={resolveMediaSrc(url, baseUrl)}
        alt={caption ?? altFallback}
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
