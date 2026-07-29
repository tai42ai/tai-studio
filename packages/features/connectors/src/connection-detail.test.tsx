/**
 * Tests for the CONNECTION DETAIL view: sub-service save, reconnect (re-entering
 * the popup flow), and the confirm-gated disconnect that navigates back.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConnectionDetail } from './connection-detail';
import { OAUTH_MESSAGE_TYPE } from './oauth';
import {
  connection,
  makeClient,
  makeFakePopup,
  postMessageFrom,
  provider,
  renderWithProviders,
} from './test-utils';

const goodMessage = { type: OAUTH_MESSAGE_TYPE, code: 'the-code', state: 'the-state', error: null };

afterEach(() => {
  vi.restoreAllMocks();
});

function baseClient(overrides = {}) {
  return makeClient({
    getConnection: vi.fn().mockResolvedValue(connection()),
    listProviders: vi.fn().mockResolvedValue([provider()]),
    ...overrides,
  });
}

describe('ConnectionDetail', () => {
  it('shows the connection record', async () => {
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, { client: baseClient() });

    await waitFor(() => {
      expect(screen.getByText('work')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 1, name: 'work' })).toBeInTheDocument();
    expect(screen.getByText('octocat')).toBeInTheDocument();
    // `←`/`→` are in NO shipped font subset, so a literal arrow paints in a
    // platform fallback face beside Inter. The icon set carries the mark instead.
    expect(document.body.textContent).not.toMatch(/[\u2190\u2192]/u);
  });

  it('saves sub-services via patchSubServices', async () => {
    const patchSubServices = vi.fn().mockResolvedValue({
      connection_id: 'conn-1',
      enabled_sub_services: ['repo'],
      consent_required: false,
      flow_id: null,
      authorize_url: null,
      added_manifest_entries: [],
      removed_manifest_entries: [],
    });
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({ patchSubServices }),
    });

    await waitFor(() => {
      expect(screen.getByText('Save sub-services')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save sub-services'));

    await waitFor(() => {
      expect(patchSubServices).toHaveBeenCalledWith('conn-1', ['repo']);
    });
  });

  it('re-opens the OAuth popup when a sub-service save requires consent', async () => {
    const popup = makeFakePopup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const patchSubServices = vi.fn().mockResolvedValue({
      connection_id: 'conn-1',
      enabled_sub_services: ['repo'],
      consent_required: true,
      flow_id: 'f7',
      authorize_url: 'https://provider/auth',
      added_manifest_entries: [],
      removed_manifest_entries: [],
    });
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({ patchSubServices }),
    });

    await waitFor(() => {
      expect(screen.getByText('Save sub-services')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save sub-services'));

    await waitFor(() => {
      expect(patchSubServices).toHaveBeenCalledWith('conn-1', ['repo']);
    });
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        'https://provider/auth',
        'tai-oauth',
        expect.stringContaining('popup'),
      );
    });
  });

  it('re-enters the popup flow on reconnect', async () => {
    const popup = makeFakePopup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const reconnect = vi
      .fn()
      .mockResolvedValue({ flow_id: 'f9', authorize_url: 'https://provider/reauth' });
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({ reconnect }),
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Reconnect/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Reconnect/ }));

    await waitFor(() => {
      expect(reconnect).toHaveBeenCalledWith('conn-1', ['repo']);
    });
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        'https://provider/reauth',
        'tai-oauth',
        expect.stringContaining('popup'),
      );
    });
  });

  it('reports the stranded fleet when a reconnect completion does not converge', async () => {
    const popup = makeFakePopup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const reconnect = vi
      .fn()
      .mockResolvedValue({ flow_id: 'f9', authorize_url: 'https://provider/reauth' });
    const completeOAuth = vi.fn().mockResolvedValue({
      kind: 'success',
      connection_id: 'conn-1',
      return_url: '/x',
      fanout: {
        mode: 'fleet',
        op: 'reload_config',
        reachable: true,
        local_only: false,
        results: [
          { origin: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null },
          {
            origin: 'serve-b',
            outcome: 'timed_out',
            payload: null,
            error: null,
            detail: 'no ack within the window',
          },
        ],
        error: null,
      },
    });
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({ reconnect, completeOAuth }),
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Reconnect/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Reconnect/ }));
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalled();
    });
    postMessageFrom(popup, goodMessage);

    await waitFor(() => {
      expect(completeOAuth).toHaveBeenCalled();
    });
    // The reconnect completion's stranded sibling is surfaced loudly.
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/did not converge/)).toBeInTheDocument();
    expect(within(alert).getByText('serve-b')).toBeInTheDocument();
  });

  it('disconnects behind a confirm dialog and navigates back on a converged reload', async () => {
    const disconnect = vi.fn().mockResolvedValue({
      connection_id: 'conn-1',
      upstream_revoke_outcome: 'success',
      upstream_revoke_status: 200,
      removed_manifest_entries: [],
      fanout: null,
    });
    const { nav } = renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({ disconnect }),
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
    });
    // Open the confirm dialog, then confirm inside it.
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => {
      expect(disconnect).toHaveBeenCalledWith('conn-1');
    });
    await waitFor(() => {
      expect(nav.navigate).toHaveBeenCalledWith('connectors', {});
    });
  });

  it('keeps the view mounted and reports the stranded fleet when a disconnect does not converge', async () => {
    const disconnect = vi.fn().mockResolvedValue({
      connection_id: 'conn-1',
      upstream_revoke_outcome: 'success',
      upstream_revoke_status: 200,
      removed_manifest_entries: ['mcp:github'],
      fanout: {
        mode: 'fleet',
        op: 'reload_config',
        reachable: true,
        local_only: false,
        results: [
          { origin: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null },
          {
            origin: 'serve-b',
            outcome: 'timed_out',
            payload: null,
            error: null,
            detail: 'no ack within the window',
          },
        ],
        error: null,
      },
    });
    const { nav } = renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({ disconnect }),
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));

    await waitFor(() => {
      expect(disconnect).toHaveBeenCalledWith('conn-1');
    });
    // The stranded sibling is surfaced loudly and the view is NOT abandoned.
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/did not converge/)).toBeInTheDocument();
    expect(within(alert).getByText('serve-b')).toBeInTheDocument();
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('shows a loud error when the connection fails to load', async () => {
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({
        getConnection: vi.fn().mockRejectedValue(new Error('detail boom')),
      }),
    });

    await waitFor(() => {
      expect(screen.getByText('detail boom')).toBeInTheDocument();
    });
  });
});
