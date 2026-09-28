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
 * Every failure state is LOUD: a parse failure is a malformed alert, a url that fails
 * the src gate or an element that fails to LOAD is a "failed to load" alert.
 */
import type { AttachmentMediaItem } from '@tai42/api-client';
import { schemas } from '@tai42/api-client';
import {
  Badge,
  isRenderableMediaSrc,
  isServedMediaUrl,
  MediaImage,
  resolveMediaSrc,
  useApi,
} from '@tai42/studio-sdk';
import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';

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

const chipStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--tai-space-2)',
};

const labelStyle: CSSProperties = {
  wordBreak: 'break-all',
};

const audioStyle: CSSProperties = {
  width: '100%',
};

const videoStyle: CSSProperties = {
  maxWidth: '100%',
  maxHeight: '320px',
  width: 'auto',
  height: 'auto',
  borderRadius: 'var(--tai-radius-md)',
  border: '1px solid var(--tai-color-border)',
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

// -- document ----------------------------------------------------------------

/**
 * A document attachment: a labelled download affordance. The served route sends
 * `Content-Disposition: attachment` for documents, so the anchor `download`-hints and
 * opens in a new tab; `rel="noreferrer"` stops the Studio URL leaking to the media
 * host. A url that fails the src gate is a loud notice, never a live href.
 */
function DocumentAttachment({
  url,
  label,
}: {
  readonly url: string;
  readonly label: string;
}): ReactNode {
  const { baseUrl } = useApi();
  if (!isRenderableMediaSrc(url)) {
    return <AttachmentNotice testId="attachment-error" badge="Attachment" message={LOAD_FAILURE} />;
  }
  return (
    <div style={chipStyle} data-testid="attachment-document">
      <Badge variant="neutral">Document</Badge>
      <a
        href={resolveMediaSrc(url, baseUrl)}
        target="_blank"
        rel="noreferrer"
        download
        title={label}
        style={labelStyle}
      >
        {label}
      </a>
    </div>
  );
}

// -- audio / video -----------------------------------------------------------

/**
 * A native `<audio>`/`<video controls>` player. `referrerPolicy` is not a valid
 * attribute on `<audio>`/`<video>`, so a remote load has no per-element referrer
 * control; the player therefore admits ONLY the platform's own served-media reference
 * (same-origin, leaking no page URL to a media host), and any other url — a bare
 * `https:` one included — is a loud notice. The load-failure flag keys on the url that
 * failed (not a bare boolean) so a new url at the same position gets a fresh load
 * attempt rather than inheriting a stale failure notice.
 */
function MediaPlayer({
  kind,
  url,
  label,
}: {
  readonly kind: 'audio' | 'video';
  readonly url: string;
  readonly label: string;
}): ReactNode {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const { baseUrl } = useApi();

  if (!isServedMediaUrl(url) || failedUrl === url) {
    return <AttachmentNotice testId="attachment-error" badge="Attachment" message={LOAD_FAILURE} />;
  }

  const src = resolveMediaSrc(url, baseUrl);
  const onError = (): void => {
    setFailedUrl(url);
  };

  if (kind === 'audio') {
    return (
      <div style={itemStyle}>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption -- an inbound attachment carries no caption track */}
        <audio
          controls
          src={src}
          aria-label={label}
          onError={onError}
          style={audioStyle}
          data-testid="attachment-audio"
        />
      </div>
    );
  }
  return (
    <div style={itemStyle}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- an inbound attachment carries no caption track */}
      <video
        controls
        src={src}
        aria-label={label}
        onError={onError}
        style={videoStyle}
        data-testid="attachment-video"
      />
    </div>
  );
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
        renderNotice={() => (
          <AttachmentNotice testId="attachment-error" badge="Attachment" message={LOAD_FAILURE} />
        )}
      />
    );
  }
  if (media.kind === 'document') {
    return <DocumentAttachment url={media.url} label={filename ?? caption ?? 'Attachment'} />;
  }
  return (
    <MediaPlayer
      kind={media.kind}
      url={media.url}
      label={filename ?? (media.kind === 'audio' ? 'Audio attachment' : 'Video attachment')}
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
