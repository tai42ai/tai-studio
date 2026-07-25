import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError, type ApiClient, type ClaimLinkCreated } from '@tai42/api-client';

import { MintedKeyDialog } from './MintedKeyDialog';
import { renderWithProviders } from './test-utils';

const KEY = 'sk-minted-xyz';
const CLAIM: ClaimLinkCreated = {
  claim_path: '/login#claim=tok-abc',
  token: 'tok-abc',
  expires_at: '2026-08-01T12:00:00Z',
};

function stubClient(createClaimLink: ApiClient['createClaimLink']): ApiClient {
  return { createClaimLink } as unknown as ApiClient;
}

describe('MintedKeyDialog', () => {
  it('shows the freshly minted key once', () => {
    renderWithProviders(<MintedKeyDialog apiKey={KEY} onClose={vi.fn()} />, {
      client: stubClient(vi.fn()),
    });

    expect(screen.getByText(KEY)).toBeInTheDocument();
    // No claim link exists until the operator asks for one.
    expect(screen.queryByTestId('claim-link-qr')).not.toBeInTheDocument();
  });

  it('mints a claim link and renders its QR, absolute URL, and expiry', async () => {
    const user = userEvent.setup();
    const createClaimLink = vi.fn().mockResolvedValue(CLAIM);
    renderWithProviders(<MintedKeyDialog apiKey={KEY} onClose={vi.fn()} />, {
      client: stubClient(createClaimLink),
    });

    await user.click(screen.getByRole('button', { name: 'Create claim link (QR)' }));

    // The link is minted from the raw key held only in this dialog.
    await waitFor(() => {
      expect(createClaimLink).toHaveBeenCalledWith({ api_key: KEY });
    });
    const qr = await screen.findByTestId('claim-link-qr');
    expect(qr.querySelector('svg')).not.toBeNull();
    // The URL is composed from the origin + the fragment-carrier claim path.
    const expectedUrl = `${window.location.origin}/login#claim=tok-abc`;
    expect(screen.getByText(expectedUrl)).toBeInTheDocument();
    expect(screen.getByText(/Expires/)).toBeInTheDocument();
  });

  it('regenerates an independent link, replacing the previous token', async () => {
    const user = userEvent.setup();
    const second: ClaimLinkCreated = {
      claim_path: '/login#claim=tok-def',
      token: 'tok-def',
      expires_at: CLAIM.expires_at,
    };
    const createClaimLink = vi.fn().mockResolvedValueOnce(CLAIM).mockResolvedValueOnce(second);
    renderWithProviders(<MintedKeyDialog apiKey={KEY} onClose={vi.fn()} />, {
      client: stubClient(createClaimLink),
    });

    await user.click(screen.getByRole('button', { name: 'Create claim link (QR)' }));
    expect(
      await screen.findByText(`${window.location.origin}/login#claim=tok-abc`),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Generate new link' }));
    await waitFor(() => {
      expect(screen.getByText(`${window.location.origin}/login#claim=tok-def`)).toBeInTheDocument();
    });
    // The old one-time link is gone — each link is independent.
    expect(
      screen.queryByText(`${window.location.origin}/login#claim=tok-abc`),
    ).not.toBeInTheDocument();
    expect(createClaimLink).toHaveBeenCalledTimes(2);
  });

  it('surfaces a claim-link failure loudly and inline', async () => {
    const user = userEvent.setup();
    const createClaimLink = vi.fn().mockRejectedValue(new ApiError('claim link failed', 500));
    renderWithProviders(<MintedKeyDialog apiKey={KEY} onClose={vi.fn()} />, {
      client: stubClient(createClaimLink),
    });

    await user.click(screen.getByRole('button', { name: 'Create claim link (QR)' }));

    expect(await screen.findByText('claim link failed')).toBeInTheDocument();
  });

  it('never logs the claim token nor writes it to storage', async () => {
    const user = userEvent.setup();
    const consoleArgs: unknown[] = [];
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation((...args) => {
        consoleArgs.push(...args);
      }),
    );
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    try {
      const createClaimLink = vi.fn().mockResolvedValue(CLAIM);
      renderWithProviders(<MintedKeyDialog apiKey={KEY} onClose={vi.fn()} />, {
        client: stubClient(createClaimLink),
      });

      await user.click(screen.getByRole('button', { name: 'Create claim link (QR)' }));
      await screen.findByTestId('claim-link-qr');

      // The token reaches no console sink…
      expect(consoleArgs.map((arg) => String(arg)).join(' ')).not.toContain('tok-abc');
      // …and is never persisted to web storage.
      expect(setItem.mock.calls.some(([, value]) => value.includes('tok-abc'))).toBe(false);
    } finally {
      for (const spy of consoleSpies) spy.mockRestore();
      setItem.mockRestore();
    }
  });
});
