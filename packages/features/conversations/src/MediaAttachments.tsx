/**
 * `MediaAttachments` — the byte-backed inbound attachments a visitor sent, shown in
 * the transcript's visitor bubble beside `inbound_text`.
 *
 * UNTRUSTED PAYLOADS: every item arrives from the sender and is parsed PER ITEM
 * against `attachmentMediaItem` (the record's array is a loose `unknown[]`), so one
 * malformed/hostile item is a loud per-item notice, never a whole-record failure that
 * would vanish the transcript. A `url` reaches an attribute sink ONLY through the SDK's
 * served-media discipline, and each sink admits exactly what it can render safely: the
 * image and document sinks admit an `https:` URL (or the platform's served-media
 * reference) because they carry an explicit no-referrer control on the load; the
 * audio/video sinks, which have no per-element referrer control, admit ONLY the
 * platform's own served-media reference (same-origin, leaks no page URL). Every
 * other-shaped url is a loud "failed to load" notice — the url itself is never placed
 * in an attribute sink and is not echoed in the notice. There is no
 * `dangerouslySetInnerHTML` here.
 *
 * A `link` item renders as a scheme-checked external link.
 *
 * Every failure state is LOUD: a parse failure is a malformed alert, a url that fails
 * the src gate or an element that fails to LOAD is a "failed to load" alert.
 */
import type { AttachmentMediaItem } from '@tai42/api-client';
import { schemas } from '@tai42/api-client';
import {
  Badge,
  ExternalLinkButton,
  MediaDocument,
  MediaImage,
  MediaPlayer,
} from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';

// -- styles ------------------------------------------------------------------

const galleryStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
};

const noticeStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-1)',
};

const noticeTextStyle: CSSProperties = {
  color: 'var(--tai-color-text-muted)',
  fontSize: 'var(--tai-text-sm)',
};

const LOAD_FAILURE = 'Attachment failed to load.';

// -- notices -----------------------------------------------------------------

function AttachmentNotice({
  message,
  testId,
  badge,
}: {
  readonly message: string;
  readonly testId: string;
  readonly badge: string;
}): ReactNode {
  return (
    <div role="alert" data-testid={testId} style={noticeStyle}>
      <Badge variant="danger">{badge}</Badge>
      <span style={noticeTextStyle}>{message}</span>
    </div>
  );
}

/** The one notice for a url a sink refuses or that fails to load; the url is never echoed. */
function loadFailureNotice(): ReactNode {
  return <AttachmentNotice testId="attachment-error" badge="Attachment" message={LOAD_FAILURE} />;
}

// -- one item ----------------------------------------------------------------

/** Render one attachment after validating it per item against the attachment schema. */
function AttachmentItem({
  item,
  index,
}: {
  readonly item: unknown;
  readonly index: number;
}): ReactNode {
  const parsed = schemas.attachmentMediaItem.safeParse(item);
  if (!parsed.success) {
    return (
      <AttachmentNotice
        testId="attachment-malformed"
        badge="Malformed"
        message={`Attachment ${String(index + 1)} is malformed and was not shown.`}
      />
    );
  }

  const media: AttachmentMediaItem = parsed.data;
  // A blank (empty/whitespace) caption or filename is treated as absent so the alt and
  // the download label fall back to their defaults rather than rendering an empty label.
  const caption =
    typeof media.caption === 'string' && media.caption.trim() !== '' ? media.caption : undefined;
  const filename =
    typeof media.filename === 'string' && media.filename.trim() !== '' ? media.filename : undefined;

  if (media.kind === 'image') {
    return (
      <MediaImage
        url={media.url}
        caption={caption}
        altFallback={filename ?? 'Attached image'}
        renderNotice={loadFailureNotice}
      />
    );
  }
  if (media.kind === 'document') {
    return (
      <MediaDocument
        url={media.url}
        label={filename ?? caption ?? 'Attachment'}
        renderNotice={loadFailureNotice}
      />
    );
  }
  if (media.kind === 'link') {
    // A link: `ExternalLinkButton` scheme-checks the href, so a non-http(s) url is
    // neutralized to non-navigable text.
    return (
      <div data-testid="attachment-link">
        <ExternalLinkButton url={media.url}>{caption ?? media.url}</ExternalLinkButton>
      </div>
    );
  }
  return (
    <MediaPlayer
      kind={media.kind}
      url={media.url}
      label={filename ?? (media.kind === 'audio' ? 'Audio attachment' : 'Video attachment')}
      renderNotice={loadFailureNotice}
    />
  );
}

// -- gallery -----------------------------------------------------------------

export function MediaAttachments({ items }: { readonly items: readonly unknown[] }): ReactNode {
  return (
    <div data-testid="attachment-gallery" style={galleryStyle}>
      {items.map((item, index) => (
        <AttachmentItem key={index} item={item} index={index} />
      ))}
    </div>
  );
}
