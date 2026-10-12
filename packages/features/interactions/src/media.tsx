/**
 * `MediaGallery` — the display-only media shown WITH an `ask` question: the images,
 * documents, audio, video and links carried on the `interaction.add` frame's optional
 * `media` field. It is question CONTEXT, never an answer control — it touches no answer,
 * callback, or lifecycle behavior.
 *
 * UNTRUSTED PAYLOADS: every item's `url` and `caption` arrive from the question
 * source and are UNTRUSTED. Captions and urls render ONLY as React-escaped text.
 * The ONLY attribute sinks are the SDK's gated served-media elements — `MediaImage`
 * and `MediaDocument` admit an `https:` URL or the platform's own served-media url
 * (the same rule the server contract and the SPA CSP enforce), `MediaPlayer` admits
 * only the served-media url — and `ExternalLinkButton`'s scheme-gated `href` (its own
 * http(s) allow-list neutralizes every other scheme). There is NO `dangerouslySetInnerHTML` here.
 *
 * Every failure state is LOUD, never a silent skip: a media item that fails the
 * per-item schema parse is a malformed alert; an image whose src fails the scheme
 * gate is a blocked notice (its url shown as escaped text, never a live attribute);
 * an image that fails to LOAD is a visible notice, never a bare broken-image glyph; a
 * document, audio or video item its sink refuses or that fails to load is a notice.
 */
import type { InteractionMediaItem } from '@tai42/api-client';
import { schemas } from '@tai42/api-client';
import {
  Badge,
  ExternalLinkButton,
  MediaDocument,
  MediaImage,
  MediaPlayer,
} from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

import { MalformedPayload } from './renderers/malformed-payload';
import { malformedStyle } from './renderers/renderer-styles';

// -- styles ------------------------------------------------------------------

const galleryStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
};

const noticeTextStyle: CSSProperties = {
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};

const itemStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-2)',
};

/** The label a document, audio or video item falls back to without a filename or caption. */
const DEFAULT_LABEL = {
  document: 'Attached document',
  audio: 'Attached audio',
  video: 'Attached video',
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
  if (media.kind === 'document' || media.kind === 'audio' || media.kind === 'video') {
    const notice = (): ReactNode => (
      <div role="alert" data-testid="media-item-unplayable" style={malformedStyle}>
        <Badge variant="danger">Media</Badge>
        <span style={noticeTextStyle}>{`Media item ${String(index + 1)} could not be shown.`}</span>
      </div>
    );
    const label = media.filename ?? caption ?? DEFAULT_LABEL[media.kind];
    return media.kind === 'document' ? (
      <MediaDocument url={media.url} label={label} renderNotice={notice} />
    ) : (
      <MediaPlayer kind={media.kind} url={media.url} label={label} renderNotice={notice} />
    );
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
