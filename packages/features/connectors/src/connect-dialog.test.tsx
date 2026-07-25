/**
 * Tests for the CONNECT form: OAuth providers hand off to the popup flow; no-auth
 * providers complete immediately; the alias is required before submit.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConnectDialog } from './connect-dialog';
import { OAUTH_MESSAGE_TYPE } from './oauth';
import {
  makeClient,
  makeFakePopup,
  postMessageFrom,
  provider,
  renderWithProviders,
} from './test-utils';

const goodMessage = { type: OAUTH_MESSAGE_TYPE, code: 'the-code', state: 'the-state', error: null };

/** A `fleet` fan-out with one applied and one stranded (`departed`) origin. */
const nonConvergedFanout = {
  mode: 'fleet',
  op: 'reload_config',
  reachable: true,
  local_only: false,
  results: [
    { origin: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null },
    {
      origin: 'serve-b',
      outcome: 'departed',
      payload: null,
      error: null,
      detail: 'left mid-broadcast',
    },
  ],
  error: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ConnectDialog', () => {
  it('starts the OAuth popup flow when startConnect returns an authorize_url', async () => {
    const user = userEvent.setup();
    const popup = makeFakePopup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const startConnect = vi
      .fn()
      .mockResolvedValue({ flow_id: 'f1', authorize_url: 'https://provider/auth' });
    renderWithProviders(<ConnectDialog provider={provider()} onClose={vi.fn()} />, {
      client: makeClient({ startConnect }),
    });

    await user.type(screen.getByLabelText('Alias'), 'work-account');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(startConnect).toHaveBeenCalledWith(
        expect.objectContaining({ provider_id: 'github', alias: 'work-account' }),
      );
    });
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(
        'https://provider/auth',
        'tai-oauth',
        expect.stringContaining('popup'),
      );
    });
  });

  it('completes immediately and closes for a no-auth provider', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const startConnect = vi
      .fn()
      .mockResolvedValue({ connection_id: 'c1', added_manifest_entries: ['x'] });
    const noAuthProvider = provider({
      kind: 'none',
      sub_services: [],
      config_fields: [
        { key: 'api_key', label: 'API key', target: 'header', required: true, secret: true },
      ],
    });
    renderWithProviders(<ConnectDialog provider={noAuthProvider} onClose={onClose} />, {
      client: makeClient({ startConnect }),
    });

    await user.type(screen.getByLabelText('Alias'), 'manual');
    await user.type(screen.getByLabelText('API key *'), 'sk-secret');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(startConnect).toHaveBeenCalledWith(
        expect.objectContaining({
          alias: 'manual',
          config_values: { api_key: 'sk-secret' },
        }),
      );
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('keeps the dialog open and reports the stranded fleet on a non-converged OAuth completion', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const popup = makeFakePopup();
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const startConnect = vi
      .fn()
      .mockResolvedValue({ flow_id: 'f1', authorize_url: 'https://provider/auth' });
    const completeOAuth = vi.fn().mockResolvedValue({
      kind: 'success',
      connection_id: 'c1',
      return_url: '/x',
      fanout: nonConvergedFanout,
    });
    renderWithProviders(<ConnectDialog provider={provider()} onClose={onClose} />, {
      client: makeClient({ startConnect, completeOAuth }),
    });

    await user.type(screen.getByLabelText('Alias'), 'work-account');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(startConnect).toHaveBeenCalled();
    });
    postMessageFrom(popup, goodMessage);

    await waitFor(() => {
      expect(completeOAuth).toHaveBeenCalled();
    });
    // The stranded sibling is surfaced loudly and the dialog is NOT closed.
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/did not converge/)).toBeInTheDocument();
    expect(within(alert).getByText('serve-b')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes the dialog on a converged OAuth completion', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const popup = makeFakePopup();
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const startConnect = vi
      .fn()
      .mockResolvedValue({ flow_id: 'f1', authorize_url: 'https://provider/auth' });
    const completeOAuth = vi
      .fn()
      .mockResolvedValue({ kind: 'success', connection_id: 'c1', return_url: '/x', fanout: null });
    renderWithProviders(<ConnectDialog provider={provider()} onClose={onClose} />, {
      client: makeClient({ startConnect, completeOAuth }),
    });

    await user.type(screen.getByLabelText('Alias'), 'work-account');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(startConnect).toHaveBeenCalled();
    });
    postMessageFrom(popup, goodMessage);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders a secret config field as a password input', () => {
    const secretProvider = provider({
      config_fields: [
        { key: 'token', label: 'Token', target: 'env', required: false, secret: true },
      ],
    });
    renderWithProviders(<ConnectDialog provider={secretProvider} onClose={vi.fn()} />, {
      client: makeClient({ startConnect: vi.fn() }),
    });

    const input = screen.getByLabelText('Token');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('requires an alias before submitting', () => {
    const startConnect = vi.fn();
    renderWithProviders(<ConnectDialog provider={provider()} onClose={vi.fn()} />, {
      client: makeClient({ startConnect }),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(startConnect).not.toHaveBeenCalled();
    expect(screen.getByText('An alias is required.')).toBeInTheDocument();
  });
});
