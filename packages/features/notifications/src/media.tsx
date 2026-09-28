/**
 * `NotificationMedia` — the display-only media stored WITH an internal-sink
 * notification: images and/or links the `notify_user` call carried when it named
 * no channel, so they surface only in this inbox. It is message CONTEXT, never a
 * control — it touches no answer, callback, or lifecycle behavior.
 *
 * This mirrors the interactions inbox's `MediaGallery` idiom (a per-item scheme
 * gate + loud fallbacks, sharing the `interactionMediaItem` item schema — the wire
 * `MediaItem` shape is identical), with ONE deliberate difference: the sink stores
 * media RAW, so an image may be a `data:image/*` URI (kept inline, never
 * substituted to a served reference). It therefore renders the shared `MediaImage`
 * with `allowDataImage`, admitting `data:image/*` on top of an `https:` URL and the
 * platform's own served-media reference — exactly the image forms the server
 * `MediaItem` contract accepts and the Studio CSP `img-src` (`https:`/`data:`/
 * same-origin) permits. A `data:` of any other type stays blocked.
 *
 * UNTRUSTED PAYLOADS: every item's `url` and `caption` arrive from the notify
 * caller and are UNTRUSTED. Captions and urls render ONLY as React-escaped text.
 * The ONLY attribute sinks are the gated image `src` (via `MediaImage`) and
 * `ExternalLinkButton`'s scheme-gated `href`. There is NO `dangerouslySetInnerHTML`
 * here. Rendering a `data:image/*` through an `<img src>` is inert — a browser never
 * executes a `data:` image as script (an SVG data URI only runs script when
 * NAVIGATED to or embedded as a document, not when loaded as an image).
 *
 * Every failure state is LOUD, never a silent skip: an item that fails the per-item
 * schema parse is a malformed alert; an image whose src fails the scheme gate is a
 * blocked notice (its url shown as escaped text, never a live attribute); an image
 * that fails to LOAD is a visible notice, never a bare broken-image glyph.
 */
import type { InteractionMediaItem } from '@tai42/api-client';
import { schemas } from '@tai42/api-client';
import { Badge, ExternalLinkButton, MediaImage } from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

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

const captionStyle: CSSProperties = {
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};

const noticeStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-1)',
};

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
    return <MediaImage url={media.url} caption={caption} allowDataImage />;
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
