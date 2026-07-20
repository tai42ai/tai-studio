/**
 * Behavioural tests for the typed result viewer. Cover the shape branches —
 * object → collapsible tree, string → escaped code block, primitive → text, no
 * value → empty state — plus the two load-bearing safety/limit paths: an
 * escaped-string XSS pin (`<script>` stays literal text, never a script element)
 * and the oversized-payload truncation with a working Blob download.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ResultViewer, RESULT_MAX_CHARS } from './ResultViewer';

describe('ResultViewer', () => {
  it('renders an object result as a collapsible JSON tree', () => {
    render(<ResultViewer result={{ greeting: 'hello', count: 2 }} />);

    expect(screen.getByText('greeting:')).toBeInTheDocument();
    expect(screen.getByText('"hello"')).toBeInTheDocument();
    // Objects render through native <details> disclosures.
    expect(document.querySelector('details')).not.toBeNull();
  });

  it('renders a string result as an escaped code block (no HTML sink)', () => {
    const payload = '<script>alert(1)</script>';
    const { container } = render(<ResultViewer result={payload} />);

    // The markup is present as LITERAL text, and no script element was created.
    expect(screen.getByText(payload)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });

  it('renders a primitive number result as readable text', () => {
    render(<ResultViewer result={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('shows an explicit empty state when the tool returned no value', () => {
    render(<ResultViewer result={undefined} />);
    expect(screen.getByText('No result')).toBeInTheDocument();
  });

  describe('media results', () => {
    it('renders an image media block as an <img> with a data: URI', () => {
      const data =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDX5BeYAAAAAElFTkSuQmCC';
      const { container } = render(
        <ResultViewer result={{ type: 'image', data, mimeType: 'image/png' }} />,
      );

      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img).toHaveAttribute('src', `data:image/png;base64,${data}`);
    });

    it('renders an image AHEAD of the 50k truncation (a large base64 image is not truncated)', () => {
      // A base64 payload far larger than RESULT_MAX_CHARS: a late media check
      // would never fire, so the media branch MUST run before truncation.
      const data = 'A'.repeat(RESULT_MAX_CHARS + 5_000);
      const { container } = render(
        <ResultViewer result={{ type: 'image', data, mimeType: 'image/png' }} />,
      );

      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      // The FULL, untruncated data rode into the src — nothing was sliced off.
      expect(img).toHaveAttribute('src', `data:image/png;base64,${data}`);
      // And the oversized-truncation notice/download were NOT shown.
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByRole('button', { name: /download full result/i })).toBeNull();
    });

    it('renders an audio media block as an <audio>', () => {
      const data = 'SUQzBAAAAAAA';
      const { container } = render(
        <ResultViewer result={{ type: 'audio', data, mimeType: 'audio/mpeg' }} />,
      );

      const audio = container.querySelector('audio');
      expect(audio).not.toBeNull();
      expect(audio).toHaveAttribute('src', `data:audio/mpeg;base64,${data}`);
      expect(container.querySelector('img')).toBeNull();
    });

    it('does NOT render a data: URI for a non-image/audio mimeType (security — falls back)', () => {
      // A media-shaped object whose mime is a script type must NEVER become a
      // data: URI; it falls back to the JSON tree instead.
      const { container } = render(
        <ResultViewer
          result={{ type: 'image', data: 'ZG9jdW1lbnQud3JpdGU=', mimeType: 'text/html' }}
        />,
      );

      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('audio')).toBeNull();
      // Falls through to the JSON tree (the mimeType field is shown as data).
      expect(screen.getByText('mimeType:')).toBeInTheDocument();
      expect(screen.getByText('"text/html"')).toBeInTheDocument();
    });

    it('does NOT media-render a plain JSON object that lacks the media shape', () => {
      const { container } = render(
        <ResultViewer result={{ type: 'image', note: 'no data field' }} />,
      );

      expect(container.querySelector('img')).toBeNull();
      expect(container.querySelector('audio')).toBeNull();
      expect(document.querySelector('details')).not.toBeNull();
    });
  });

  describe('oversized payloads', () => {
    interface UrlStatics {
      createObjectURL: (object: Blob | MediaSource) => string;
      revokeObjectURL: (url: string) => void;
    }

    afterEach(() => {
      vi.restoreAllMocks();
      Reflect.deleteProperty(URL, 'createObjectURL');
      Reflect.deleteProperty(URL, 'revokeObjectURL');
    });

    it('truncates and offers a working Blob download of the full result', async () => {
      const user = userEvent.setup();
      const createObjectURL = vi.fn((_object: Blob | MediaSource) => 'blob:tool-result');
      const revokeObjectURL = vi.fn((_url: string) => undefined);
      const urlStatics = URL as unknown as UrlStatics;
      urlStatics.createObjectURL = createObjectURL;
      urlStatics.revokeObjectURL = revokeObjectURL;
      const clickSpy = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => undefined);

      const big = 'x'.repeat(RESULT_MAX_CHARS + 500);
      render(<ResultViewer result={big} />);

      // A truncation notice is shown, not the whole payload.
      expect(screen.getByRole('status')).toHaveTextContent(/shown truncated/i);

      const download = screen.getByRole('button', { name: /download full result/i });
      await user.click(download);

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:tool-result');
    });
  });
});
