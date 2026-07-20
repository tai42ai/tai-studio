/**
 * Tests for the OAuth popup flow. The security pins live here: a
 * message is acted on ONLY when origin + source + type all match; any failure is
 * ignored and `completeOAuth` is never called.
 */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OAUTH_MESSAGE_TYPE, useOAuthPopup } from './oauth';
import {
  makeClient,
  makeFakePopup,
  postMessageFrom,
  renderWithProviders,
  type FakePopup,
} from './test-utils';

function Harness({ url, onSuccess }: { url: string; onSuccess?: () => void }): React.ReactNode {
  const oauth = useOAuthPopup(onSuccess ? { onSuccess } : {});
  return (
    <div>
      <button
        onClick={() => {
          oauth.start(url);
        }}
      >
        start
      </button>
      <div data-testid="notice">
        {oauth.notice ? `${oauth.notice.kind}:${oauth.notice.message}` : ''}
      </div>
      <div data-testid="pending">{String(oauth.pending)}</div>
    </div>
  );
}

const goodMessage = { type: OAUTH_MESSAGE_TYPE, code: 'the-code', state: 'the-state', error: null };

function stubOpen(popup: FakePopup | null): void {
  vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useOAuthPopup — trusted message', () => {
  it('completes and reports success on a valid message (origin + source + type)', async () => {
    const popup = makeFakePopup();
    stubOpen(popup);
    const completeOAuth = vi.fn().mockResolvedValue({
      kind: 'success',
      connection_id: 'c1',
      return_url: '/x',
    });
    const onSuccess = vi.fn();
    renderWithProviders(<Harness url="https://provider/auth" onSuccess={onSuccess} />, {
      client: makeClient({ completeOAuth }),
    });

    fireEvent.click(screen.getByText('start'));
    postMessageFrom(popup, goodMessage);

    await waitFor(() => {
      expect(completeOAuth).toHaveBeenCalledWith('the-state', 'the-code', undefined);
    });
    await waitFor(() => {
      expect(screen.getByTestId('notice').textContent).toContain('success:');
    });
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(popup.close).toHaveBeenCalled();
  });

  it('reports the reason on a failed result', async () => {
    const popup = makeFakePopup();
    stubOpen(popup);
    const completeOAuth = vi
      .fn()
      .mockResolvedValue({ kind: 'failed', reason: 'token exchange rejected' });
    renderWithProviders(<Harness url="https://provider/auth" />, {
      client: makeClient({ completeOAuth }),
    });

    fireEvent.click(screen.getByText('start'));
    postMessageFrom(popup, goodMessage);

    await waitFor(() => {
      expect(screen.getByTestId('notice').textContent).toBe('failed:token exchange rejected');
    });
  });

  it('reports cancelled on a cancelled result', async () => {
    const popup = makeFakePopup();
    stubOpen(popup);
    const completeOAuth = vi.fn().mockResolvedValue({ kind: 'cancelled', message: 'user said no' });
    renderWithProviders(<Harness url="https://provider/auth" />, {
      client: makeClient({ completeOAuth }),
    });

    fireEvent.click(screen.getByText('start'));
    postMessageFrom(popup, { ...goodMessage, code: null, error: 'access_denied' });

    await waitFor(() => {
      expect(screen.getByTestId('notice').textContent).toBe('cancelled:user said no');
    });
    expect(completeOAuth).toHaveBeenCalledWith('the-state', '', 'access_denied');
  });
});

describe('useOAuthPopup — security pin: untrusted messages are ignored', () => {
  it('ignores a message from the WRONG ORIGIN', async () => {
    const popup = makeFakePopup();
    stubOpen(popup);
    const completeOAuth = vi
      .fn()
      .mockResolvedValue({ kind: 'success', connection_id: 'c', return_url: '/x' });
    renderWithProviders(<Harness url="https://provider/auth" />, {
      client: makeClient({ completeOAuth }),
    });

    fireEvent.click(screen.getByText('start'));
    postMessageFrom(popup, goodMessage, 'https://evil.example');

    await Promise.resolve();
    expect(completeOAuth).not.toHaveBeenCalled();
    expect(screen.getByTestId('notice').textContent).toBe('');
  });

  it('ignores a message from the WRONG SOURCE (not our popup)', async () => {
    const popup = makeFakePopup();
    stubOpen(popup);
    const completeOAuth = vi
      .fn()
      .mockResolvedValue({ kind: 'success', connection_id: 'c', return_url: '/x' });
    renderWithProviders(<Harness url="https://provider/auth" />, {
      client: makeClient({ completeOAuth }),
    });

    fireEvent.click(screen.getByText('start'));
    postMessageFrom({ notThePopup: true }, goodMessage);

    await Promise.resolve();
    expect(completeOAuth).not.toHaveBeenCalled();
    expect(screen.getByTestId('notice').textContent).toBe('');
  });

  it('ignores a message with the WRONG TYPE', async () => {
    const popup = makeFakePopup();
    stubOpen(popup);
    const completeOAuth = vi
      .fn()
      .mockResolvedValue({ kind: 'success', connection_id: 'c', return_url: '/x' });
    renderWithProviders(<Harness url="https://provider/auth" />, {
      client: makeClient({ completeOAuth }),
    });

    fireEvent.click(screen.getByText('start'));
    postMessageFrom(popup, { ...goodMessage, type: 'something:else' });

    await Promise.resolve();
    expect(completeOAuth).not.toHaveBeenCalled();
    expect(screen.getByTestId('notice').textContent).toBe('');
  });
});

describe('useOAuthPopup — popup lifecycle', () => {
  it('surfaces a loud error when the popup is blocked (window.open returns null)', () => {
    stubOpen(null);
    const completeOAuth = vi.fn();
    renderWithProviders(<Harness url="https://provider/auth" />, {
      client: makeClient({ completeOAuth }),
    });

    fireEvent.click(screen.getByText('start'));

    expect(screen.getByTestId('notice').textContent).toContain('error:');
    expect(screen.getByTestId('notice')).toHaveTextContent(/popup blocked/i);
    expect(completeOAuth).not.toHaveBeenCalled();
  });

  it('refuses a non-http(s) authorize URL and never opens a window (XSS guard)', () => {
    const openSpy = vi.spyOn(window, 'open');
    const completeOAuth = vi.fn();
    renderWithProviders(<Harness url="javascript:alert(document.cookie)" />, {
      client: makeClient({ completeOAuth }),
    });

    fireEvent.click(screen.getByText('start'));

    expect(openSpy).not.toHaveBeenCalled();
    expect(screen.getByTestId('notice').textContent).toContain('error:');
    expect(screen.getByTestId('notice')).toHaveTextContent(/invalid authorization URL/i);
    expect(completeOAuth).not.toHaveBeenCalled();
  });

  it('treats a popup closed with NO trusted message as cancelled', () => {
    vi.useFakeTimers();
    const popup = makeFakePopup();
    stubOpen(popup);
    const completeOAuth = vi.fn();
    renderWithProviders(<Harness url="https://provider/auth" />, {
      client: makeClient({ completeOAuth }),
    });

    fireEvent.click(screen.getByText('start'));
    popup.closed = true;
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(completeOAuth).not.toHaveBeenCalled();
    expect(screen.getByTestId('notice').textContent).toBe('cancelled:Sign-in cancelled.');
  });

  it('removes the message listener on unmount', () => {
    const popup = makeFakePopup();
    stubOpen(popup);
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderWithProviders(<Harness url="https://provider/auth" />, {
      client: makeClient({ completeOAuth: vi.fn() }),
    });

    fireEvent.click(screen.getByText('start'));
    unmount();

    expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function));
  });
});
