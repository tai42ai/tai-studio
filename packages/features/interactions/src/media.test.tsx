import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  XSS,
  emitFrame,
  encodeInteraction,
  fullProjection,
  idJson,
  interactionJson,
  renderInbox,
} from './test-utils';

describe('MediaGallery — display-only question media (gated render + loud fallbacks)', () => {
  // The platform's own served-media url (relative, same origin): 43 urlsafe-base64
  // id chars after the route prefix. This is the ONLY inline image form the record
  // carries now — media is stored by reference, no `data:` inside the record.
  const SERVED_MEDIA_URL = `/api/interactions/media/${'a'.repeat(43)}`;
  // A tiny hermetic 1×1 PNG data: URI — a valid image, but not an accepted
  // record media url (records reference media; only the served-media test uses it).
  const PNG_DATA_URI =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  /** An `interaction.add` frame carrying a `media` array (defaults to a text question). */
  function mediaJson(fields: {
    interaction_id: string;
    media: readonly unknown[];
    format?: string;
    prompt?: string;
    format_payload?: Record<string, unknown>;
  }): string {
    return encodeInteraction({
      interaction_id: fields.interaction_id,
      group_id: `g-${fields.interaction_id}`,
      answer_format: fields.format ?? 'text',
      question: fields.prompt ?? 'Which one?',
      format_payload: fields.format_payload ?? {},
      created_at: '2026-07-04T00:00:00Z',
      timeout_at: '2026-07-04T00:05:00Z',
      media: fields.media,
    });
  }

  it('renders a served-media item as an <img>, keeping the relative ref same-origin (empty baseUrl)', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({ interaction_id: 'q-img', media: [{ kind: 'image', url: SERVED_MEDIA_URL }] }),
    );

    expect(screen.getByTestId('media-gallery')).toBeInTheDocument();
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    // Same-origin deployment (baseUrl ''): the ref stays relative, unjoined.
    expect(img?.getAttribute('src')).toBe(SERVED_MEDIA_URL);
    // No caption → the accessibility fallback, never `alt=""`.
    expect(img?.getAttribute('alt')).toBe('Attached image');
    // The privacy mitigation is a PINNED invariant, not optional polish.
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('joins a served-media ref to the configured API base (cross-origin deployment)', async () => {
    // A cross-origin deployment: Studio and the API are different origins. The
    // relative ref MUST resolve against the API base, not the SPA page origin, or
    // the browser loads it from Studio and 404s.
    const { channel, container } = renderInbox(undefined, fullProjection(), 'https://api.example');
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({ interaction_id: 'q-img-abs', media: [{ kind: 'image', url: SERVED_MEDIA_URL }] }),
    );

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe(`https://api.example${SERVED_MEDIA_URL}`);
    // The gate, alt fallback, and no-referrer are unchanged by the join.
    expect(img?.getAttribute('alt')).toBe('Attached image');
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('renders a caption as escaped text and uses it as the img alt', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-img-cap',
        media: [{ kind: 'image', url: SERVED_MEDIA_URL, caption: 'The blue widget' }],
      }),
    );

    const img = container.querySelector('img');
    expect(img?.getAttribute('alt')).toBe('The blue widget');
    expect(screen.getByText('The blue widget')).toBeInTheDocument();
  });

  it('passes a caption-less item that sends caption: null (nullish schema)', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-null-cap',
        media: [{ kind: 'image', url: SERVED_MEDIA_URL, caption: null }],
      }),
    );

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('alt')).toBe('Attached image');
    expect(screen.queryByTestId('media-item-malformed')).not.toBeInTheDocument();
  });

  it('renders a remote https image (the gate passes https) with no-referrer', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-https',
        media: [{ kind: 'image', url: 'https://images.example.com/widget.png' }],
      }),
    );

    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://images.example.com/widget.png');
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('blocks a javascript: image src — no <img>, no script, url only as literal text', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-js-img',
        media: [{ kind: 'image', url: 'javascript:alert(1)' }],
      }),
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    const blocked = screen.getByTestId('media-item-blocked');
    expect(blocked).toHaveAttribute('role', 'alert');
    expect(within(blocked).getByText('javascript:alert(1)')).toBeInTheDocument();
  });

  it('blocks a data:text/html image src (both gate branches fail) — no <img>, no script', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-html-img',
        media: [{ kind: 'image', url: 'data:text/html,<script>alert(1)</script>' }],
      }),
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByTestId('media-item-blocked')).toBeInTheDocument();
  });

  it('blocks a data:application/pdf image src (data: URIs are not accepted media)', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-pdf-img',
        media: [{ kind: 'image', url: 'data:application/pdf;base64,AAAA' }],
      }),
    );

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('media-item-blocked')).toBeInTheDocument();
  });

  it('blocks an http:// image src (images are https-only) — no <img>, url as escaped text', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-http-img',
        media: [{ kind: 'image', url: 'http://host.example/x.png' }],
      }),
    );

    expect(container.querySelector('img')).toBeNull();
    const blocked = screen.getByTestId('media-item-blocked');
    expect(within(blocked).getByText('http://host.example/x.png')).toBeInTheDocument();
  });

  it('blocks a data:image/png src — media is served by reference, never inline data:', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-data-img',
        media: [{ kind: 'image', url: PNG_DATA_URI }],
      }),
    );

    // The record never carries inline data: any more; the renderer blocks it.
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByTestId('media-item-blocked')).toBeInTheDocument();
  });

  it('blocks a served-media url whose id is the wrong length', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-bad-id',
        // A media-route url with a too-short id fails the id charset/length pin.
        media: [{ kind: 'image', url: '/api/interactions/media/tooshort' }],
      }),
    );

    expect(container.querySelector('img')).toBeNull();
    const blocked = screen.getByTestId('media-item-blocked');
    expect(within(blocked).getByText('/api/interactions/media/tooshort')).toBeInTheDocument();
  });

  it('neutralizes a javascript: link url — a non-navigable span, never an anchor', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-js-link',
        media: [{ kind: 'link', url: 'javascript:alert(1)' }],
      }),
    );

    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[data-neutralized="true"]')).not.toBeNull();
  });

  it('neutralizes a data:text/html link url — a non-navigable span, never an anchor', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-data-link',
        media: [{ kind: 'link', url: 'data:text/html,<script>alert(1)</script>' }],
      }),
    );

    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('[data-neutralized="true"]')).not.toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('renders a valid https link with the caption as its label', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-link',
        media: [{ kind: 'link', url: 'https://docs.example/page', caption: 'Open it here' }],
      }),
    );

    const anchor = container.querySelector('a');
    expect(anchor?.getAttribute('href')).toBe('https://docs.example/page');
    expect(anchor).toHaveTextContent('Open it here');
  });

  it('renders an http:// link as a live anchor (links keep http, unlike the https-only image gate)', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-http-link',
        media: [{ kind: 'link', url: 'http://docs.example/page' }],
      }),
    );

    const anchor = container.querySelector('a');
    expect(anchor?.getAttribute('href')).toBe('http://docs.example/page');
    expect(container.querySelector('[data-neutralized="true"]')).toBeNull();
  });

  it('treats a blank caption as absent — img alt falls back, no empty caption text', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-blank-cap',
        media: [
          { kind: 'image', url: SERVED_MEDIA_URL, caption: '   ' },
          { kind: 'link', url: 'https://docs.example/page', caption: '' },
        ],
      }),
    );

    // The image falls back to the accessibility alt, never a blank `alt=""`.
    expect(container.querySelector('img')?.getAttribute('alt')).toBe('Attached image');
    // The link label falls back to its url rather than rendering a blank anchor.
    expect(container.querySelector('a')).toHaveTextContent('https://docs.example/page');
  });

  it('renders a hostile caption as literal escaped text — never a live sink', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-cap-xss',
        media: [{ kind: 'image', url: SERVED_MEDIA_URL, caption: XSS }],
      }),
    );

    expect(screen.getByText(XSS)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
    // Only the single gated image element — the caption never minted another.
    expect(container.querySelectorAll('img')).toHaveLength(1);
  });

  it('shows a loud malformed alert for a bad item while the question stays ANSWERABLE', async () => {
    const user = userEvent.setup();
    const answer = vi.fn().mockResolvedValue(undefined);
    const { channel } = renderInbox(answer);
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-bad-item',
        prompt: 'Your name?',
        // Missing url, an unknown kind, and a non-object — all malformed per item.
        media: [{ kind: 'image' }, { kind: 'video', url: 'x' }, 'not-an-object'],
      }),
    );

    expect(screen.getAllByTestId('media-item-malformed').length).toBe(3);
    // The regression pin: a malformed media item never disables the answer control.
    await user.type(screen.getByLabelText('Your answer'), 'Ada');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(() => {
      expect(answer).toHaveBeenCalledWith('q-bad-item', 'Ada');
    });
  });

  it('replaces the <img> with a visible notice when the image fails to load', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({ interaction_id: 'q-img-err', media: [{ kind: 'image', url: SERVED_MEDIA_URL }] }),
    );

    const img = container.querySelector('img');
    if (img === null) throw new Error('expected the image to render before its load error');
    await act(async () => {
      fireEvent.error(img);
    });

    expect(container.querySelector('img')).toBeNull();
    const notice = screen.getByTestId('media-image-error');
    expect(notice).toHaveAttribute('role', 'alert');
  });

  it('renders NO media-gallery node when the frame carries no media', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      interactionJson({ interaction_id: 'q-no-media', format: 'text', prompt: 'Name?' }),
    );

    expect(screen.getByTestId('interaction-card')).toBeInTheDocument();
    expect(screen.queryByTestId('media-gallery')).not.toBeInTheDocument();
  });

  it('renders NO media-gallery node for an empty media array', async () => {
    const { channel } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({ interaction_id: 'q-empty-media', media: [] }),
    );

    expect(screen.getByTestId('interaction-card')).toBeInTheDocument();
    expect(screen.queryByTestId('media-gallery')).not.toBeInTheDocument();
  });

  it('keeps the media visible after the question is answered (media is context)', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-answered-media',
        media: [{ kind: 'image', url: SERVED_MEDIA_URL }],
      }),
    );
    await emitFrame(channel, 'interaction.answered', idJson('q-answered-media'));

    expect(screen.getByTestId('interaction-answered')).toBeInTheDocument();
    expect(screen.getByTestId('media-gallery')).toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('reloads a fresh image url at the same position after a prior url failed', async () => {
    const { channel, container } = renderInbox();
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({ interaction_id: 'q-reload', media: [{ kind: 'image', url: SERVED_MEDIA_URL }] }),
    );
    const first = container.querySelector('img');
    if (first === null) throw new Error('expected the first image to render before its load error');
    await act(async () => {
      fireEvent.error(first);
    });
    expect(screen.getByTestId('media-image-error')).toBeInTheDocument();

    // A redelivered add carries a DIFFERENT image url at the same array position.
    // The load-failure state keys on the failed url, so the stale error notice
    // clears and the new url gets a fresh <img> load attempt.
    await emitFrame(
      channel,
      'interaction.add',
      mediaJson({
        interaction_id: 'q-reload',
        media: [{ kind: 'image', url: 'https://images.example.com/fresh.png' }],
      }),
    );

    expect(screen.queryByTestId('media-image-error')).not.toBeInTheDocument();
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://images.example.com/fresh.png',
    );
  });
});
