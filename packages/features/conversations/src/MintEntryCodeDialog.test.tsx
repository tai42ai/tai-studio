/**
 * Behavioural tests for the mint-entry-code dialog: the happy path ends in a
 * SHOWN-ONCE reveal of the raw code + the composed chat URL (no re-reveal
 * affordance), the optional label rides the body trimmed (blank → null), the
 * optional expiry is sent as an ISO instant and a past value is blocked locally,
 * and every server status renders verbatim.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError } from '@tai42/api-client';

import { MintEntryCodeDialog } from './MintEntryCodeDialog';
import { renderWithProviders, type StubApiClient } from './test-utils';

const MINTED = {
  code: 'ent-raw-token',
  code_id: 'abc123',
  expires_at: null,
};

function baseClient(
  mintWebEntryCode: ReturnType<typeof vi.fn>,
  overrides: StubApiClient = {},
): StubApiClient {
  return { baseUrl: '', mintWebEntryCode, ...overrides };
}

describe('MintEntryCodeDialog — mint + reveal', () => {
  it('mints a never-expiring code and reveals it once with the chat URL (no reopen)', async () => {
    const user = userEvent.setup();
    const mintWebEntryCode = vi.fn().mockResolvedValue(MINTED);
    renderWithProviders(<MintEntryCodeDialog identity="web-1" onClose={vi.fn()} />, {
      client: baseClient(mintWebEntryCode),
    });

    await user.click(screen.getByRole('button', { name: 'Mint code' }));

    await waitFor(() => {
      expect(mintWebEntryCode).toHaveBeenCalledWith('web-1', { label: null, expires_at: null });
    });

    // The raw code and the chat URL are both revealed, once.
    expect(screen.getByText('ent-raw-token')).toBeInTheDocument();
    expect(
      screen.getByText(
        `${window.location.origin}/api/channels/web/chat/web-1?tai_entry=ent-raw-token`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/shown once/)).toBeInTheDocument();
    expect(screen.getByText('Never expires.')).toBeInTheDocument();
    // No way to mint again from the reveal — only Done.
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mint code' })).not.toBeInTheDocument();
  });

  it('trims a label and sends a future expiry as an ISO instant', async () => {
    const user = userEvent.setup();
    const mintWebEntryCode = vi
      .fn()
      .mockResolvedValue({ ...MINTED, expires_at: '2099-01-01T10:00:00Z' });
    renderWithProviders(<MintEntryCodeDialog identity="web-1" onClose={vi.fn()} />, {
      client: baseClient(mintWebEntryCode),
    });

    await user.type(screen.getByLabelText('Label'), '  newsletter  ');
    fireEvent.change(screen.getByLabelText('Expiry'), { target: { value: '2099-01-01T10:00' } });
    await user.click(screen.getByRole('button', { name: 'Mint code' }));

    await waitFor(() => {
      expect(mintWebEntryCode).toHaveBeenCalledWith('web-1', {
        label: 'newsletter',
        expires_at: new Date('2099-01-01T10:00').toISOString(),
      });
    });
    // The reveal shows the returned expiry, not "never".
    expect(screen.getByText(/^Expires /)).toBeInTheDocument();
  });

  it('blocks a PAST expiry locally with a loud error and never calls the API', async () => {
    const user = userEvent.setup();
    const mintWebEntryCode = vi.fn();
    renderWithProviders(<MintEntryCodeDialog identity="web-1" onClose={vi.fn()} />, {
      client: baseClient(mintWebEntryCode),
    });

    fireEvent.change(screen.getByLabelText('Expiry'), { target: { value: '2000-01-01T10:00' } });
    await user.click(screen.getByRole('button', { name: 'Mint code' }));

    expect(await screen.findByText('Expiry must be in the future.')).toBeInTheDocument();
    expect(mintWebEntryCode).not.toHaveBeenCalled();
  });

  it('clears a stale expiry error once a future value is supplied', async () => {
    const user = userEvent.setup();
    const mintWebEntryCode = vi.fn().mockResolvedValue(MINTED);
    renderWithProviders(<MintEntryCodeDialog identity="web-1" onClose={vi.fn()} />, {
      client: baseClient(mintWebEntryCode),
    });

    fireEvent.change(screen.getByLabelText('Expiry'), { target: { value: '2000-01-01T10:00' } });
    await user.click(screen.getByRole('button', { name: 'Mint code' }));
    expect(await screen.findByText('Expiry must be in the future.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Expiry'), { target: { value: '2099-01-01T10:00' } });
    await user.click(screen.getByRole('button', { name: 'Mint code' }));

    await waitFor(() => {
      expect(mintWebEntryCode).toHaveBeenCalledOnce();
    });
    expect(screen.queryByText('Expiry must be in the future.')).not.toBeInTheDocument();
  });

  it('disables the mint while it is IN FLIGHT so a double click cannot mint twice', async () => {
    const user = userEvent.setup();
    const mintWebEntryCode = vi.fn().mockReturnValue(new Promise(() => undefined));
    renderWithProviders(<MintEntryCodeDialog identity="web-1" onClose={vi.fn()} />, {
      client: baseClient(mintWebEntryCode),
    });

    const submit = screen.getByRole('button', { name: 'Mint code' });
    await user.click(submit);
    await waitFor(() => expect(submit).toBeDisabled());
    await user.click(submit);
    expect(mintWebEntryCode).toHaveBeenCalledTimes(1);
  });

  it("surfaces the server's refusal VERBATIM", async () => {
    const user = userEvent.setup();
    const message = 'gate management is not yours on this route';
    const mintWebEntryCode = vi.fn().mockRejectedValue(new ApiError(message, 403));
    renderWithProviders(<MintEntryCodeDialog identity="web-1" onClose={vi.fn()} />, {
      client: baseClient(mintWebEntryCode),
    });

    await user.click(screen.getByRole('button', { name: 'Mint code' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('closes on Cancel without minting', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const mintWebEntryCode = vi.fn();
    renderWithProviders(<MintEntryCodeDialog identity="web-1" onClose={onClose} />, {
      client: baseClient(mintWebEntryCode),
    });

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(mintWebEntryCode).not.toHaveBeenCalled();
  });

  it('closes on Escape without minting', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const mintWebEntryCode = vi.fn();
    renderWithProviders(<MintEntryCodeDialog identity="web-1" onClose={onClose} />, {
      client: baseClient(mintWebEntryCode),
    });

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
    expect(mintWebEntryCode).not.toHaveBeenCalled();
  });

  it('composes the chat URL against an ABSOLUTE api base when configured', async () => {
    const user = userEvent.setup();
    const mintWebEntryCode = vi.fn().mockResolvedValue(MINTED);
    renderWithProviders(<MintEntryCodeDialog identity="web-1" onClose={vi.fn()} />, {
      client: baseClient(mintWebEntryCode, { baseUrl: 'https://api.example' }),
    });

    await user.click(screen.getByRole('button', { name: 'Mint code' }));
    expect(
      await screen.findByText(
        'https://api.example/api/channels/web/chat/web-1?tai_entry=ent-raw-token',
      ),
    ).toBeInTheDocument();
  });
});
