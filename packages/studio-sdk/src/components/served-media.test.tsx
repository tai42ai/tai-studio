import type { ApiClient } from '@tai42/api-client';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ApiProvider } from '../hooks/useApi';
import {
  isRenderableMediaSrc,
  isServedMediaUrl,
  MediaImage,
  resolveMediaSrc,
} from './served-media';

// The platform's own served-media reference: 43 urlsafe-base64 id chars after the route prefix.
const SERVED = `/api/interactions/media/${'a'.repeat(43)}`;

function withApi(ui: ReactElement, baseUrl: string): void {
  const client = { baseUrl } as unknown as ApiClient;
  const wrapper = ({ children }: { readonly children: ReactNode }): ReactElement => (
    <ApiProvider value={client}>{children}</ApiProvider>
  );
  render(ui, { wrapper });
}

describe('isRenderableMediaSrc', () => {
  it('admits an https url and the platform served-media reference', () => {
    expect(isRenderableMediaSrc('https://example.com/a.png')).toBe(true);
    expect(isRenderableMediaSrc(SERVED)).toBe(true);
  });

  it('rejects http, javascript, data, and a malformed served id', () => {
    expect(isRenderableMediaSrc('http://example.com/a.png')).toBe(false);
    expect(isRenderableMediaSrc('javascript:alert(1)')).toBe(false);
    expect(isRenderableMediaSrc('data:image/png;base64,AAAA')).toBe(false);
    expect(isRenderableMediaSrc('/api/interactions/media/too-short')).toBe(false);
  });

  it('blocks a data:image by default, admits it only when a raw-storing sink opts in', () => {
    expect(isRenderableMediaSrc('data:image/png;base64,AAAA')).toBe(false);
    expect(isRenderableMediaSrc('data:image/png;base64,AAAA', true)).toBe(true);
  });

  it('blocks a non-image data uri even when the opt-in is on', () => {
    expect(isRenderableMediaSrc('data:text/html,<script>1</script>', true)).toBe(false);
  });
});

describe('isServedMediaUrl', () => {
  it('admits only the platform served-media reference, not https/http/data/malformed', () => {
    expect(isServedMediaUrl(SERVED)).toBe(true);
    expect(isServedMediaUrl('https://example.com/a.png')).toBe(false);
    expect(isServedMediaUrl('http://example.com/a.png')).toBe(false);
    expect(isServedMediaUrl('data:image/png;base64,AAAA')).toBe(false);
    expect(isServedMediaUrl('/api/interactions/media/too-short')).toBe(false);
  });
});

describe('resolveMediaSrc', () => {
  it('returns an https url unchanged', () => {
    expect(resolveMediaSrc('https://x/y.png', 'https://api.example')).toBe('https://x/y.png');
  });

  it('joins a served reference to the API base, stripping a trailing slash', () => {
    expect(resolveMediaSrc(SERVED, 'https://api.example')).toBe(`https://api.example${SERVED}`);
    expect(resolveMediaSrc(SERVED, 'https://api.example/')).toBe(`https://api.example${SERVED}`);
  });

  it('leaves a served reference relative under an empty (same-origin) base', () => {
    expect(resolveMediaSrc(SERVED, '')).toBe(SERVED);
  });
});

describe('MediaImage', () => {
  it('renders a served reference as an <img>, keeping it relative same-origin', () => {
    withApi(<MediaImage url={SERVED} />, '');
    const img = document.querySelector('img');
    expect(img?.getAttribute('src')).toBe(SERVED);
    expect(img?.getAttribute('alt')).toBe('Attached image');
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('joins a served reference to the API base cross-origin', () => {
    withApi(<MediaImage url={SERVED} />, 'https://api.example');
    expect(document.querySelector('img')?.getAttribute('src')).toBe(`https://api.example${SERVED}`);
  });

  it('uses the caption as the alt and shows it, and honours a custom altFallback', () => {
    withApi(<MediaImage url={SERVED} caption="a widget" />, '');
    expect(document.querySelector('img')?.getAttribute('alt')).toBe('a widget');
    expect(screen.getByText('a widget')).toBeInTheDocument();
  });

  it('falls back to the given altFallback when there is no caption', () => {
    withApi(<MediaImage url={SERVED} altFallback="Attached document" />, '');
    expect(document.querySelector('img')?.getAttribute('alt')).toBe('Attached document');
  });

  it('shows a loud blocked notice for a url that fails the src gate', () => {
    withApi(<MediaImage url="javascript:alert(1)" />, '');
    expect(screen.getByTestId('media-item-blocked')).toBeInTheDocument();
    expect(screen.getByText('Blocked image')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('shows the default failure notice when an admitted image fails to load', () => {
    withApi(<MediaImage url={SERVED} />, '');
    const img = document.querySelector('img');
    if (img === null) throw new Error('no image');
    fireEvent.error(img);
    expect(screen.getByTestId('media-image-error')).toBeInTheDocument();
    expect(screen.getByText('Image failed to load')).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
  });

  it('calls renderNotice with the blocked state and url, rendering its node in place', () => {
    const calls: ['blocked' | 'failed', string][] = [];
    withApi(
      <MediaImage
        url="javascript:alert(1)"
        renderNotice={(state, url) => {
          calls.push([state, url]);
          return <div data-testid="custom-notice">nope</div>;
        }}
      />,
      '',
    );
    expect(calls).toEqual([['blocked', 'javascript:alert(1)']]);
    expect(screen.getByTestId('custom-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('media-item-blocked')).toBeNull();
  });

  it('calls renderNotice with the failed state when an admitted image fails to load', () => {
    const calls: ['blocked' | 'failed', string][] = [];
    withApi(
      <MediaImage
        url={SERVED}
        renderNotice={(state, url) => {
          calls.push([state, url]);
          return <div data-testid="custom-notice">nope</div>;
        }}
      />,
      '',
    );
    const img = document.querySelector('img');
    if (img === null) throw new Error('no image');
    fireEvent.error(img);
    expect(calls).toEqual([['failed', SERVED]]);
    expect(screen.getByTestId('custom-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('media-image-error')).toBeNull();
  });
});
