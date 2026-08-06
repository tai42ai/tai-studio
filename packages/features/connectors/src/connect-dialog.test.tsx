/**
 * Tests for the CONNECT form: OAuth providers hand off to the popup flow; no-auth
 * providers complete immediately; the alias is required before submit.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@tai42/api-client';

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

  it('shows the muted OFF note and disables Connect when the token store is not configured', async () => {
    // Providers are installed (the dialog opens), but the connector token store is
    // unconfigured: the START refuses with a 501 `connectors-not-configured`. OFF is a
    // state, not an error — the muted note replaces the red alert and the affordance is
    // withdrawn so the certain-to-refuse connect cannot re-fire.
    const user = userEvent.setup();
    const startConnect = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          'the connectors store is not configured: set TAI_DATABASE_DEFAULT_PG_PASSWORD',
          501,
          'connectors-not-configured',
        ),
      );
    renderWithProviders(<ConnectDialog provider={provider()} onClose={vi.fn()} />, {
      client: makeClient({ startConnect }),
    });

    await user.type(screen.getByLabelText('Alias'), 'work-account');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(startConnect).toHaveBeenCalled();
    });

    // The 501 renders the muted OFF note showing the server's message — and NO loud
    // red alert.
    const note = await screen.findByTestId('feature-disabled');
    expect(note).toHaveTextContent(
      'the connectors store is not configured: set TAI_DATABASE_DEFAULT_PG_PASSWORD',
    );
    expect(screen.queryByRole('alert')).toBeNull();

    // The Connect button can no longer re-fire the certain-to-refuse connect.
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
  });

  it('shows the named provider-not-configured note and disables Connect on a provider 501', async () => {
    // A registered provider whose OAuth client credentials env var is unset refuses the
    // START with a named 501 whose message names the env var. It is a state, not an
    // error — the muted, actionable note replaces the red alert and Connect is withdrawn.
    const user = userEvent.setup();
    const startConnect = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          'set GITHUB_OAUTH_CLIENT_SECRET to enable GitHub',
          501,
          'connector-provider-not-configured',
        ),
      );
    renderWithProviders(<ConnectDialog provider={provider()} onClose={vi.fn()} />, {
      client: makeClient({ startConnect }),
    });

    await user.type(screen.getByLabelText('Alias'), 'work-account');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(startConnect).toHaveBeenCalled();
    });

    const note = await screen.findByTestId('connector-provider-off');
    expect(note).toHaveTextContent('GITHUB_OAUTH_CLIENT_SECRET');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
  });

  it('shows each sub-service description AND its scopes together (consent surface)', () => {
    const consentProvider = provider({
      sub_services: [
        {
          id: 'repo',
          display_name: 'Repositories',
          description: 'Read and write your repositories',
          scopes: ['repo', 'read:org'],
        },
      ],
    });
    renderWithProviders(<ConnectDialog provider={consentProvider} onClose={vi.fn()} />, {
      client: makeClient({ startConnect: vi.fn() }),
    });

    // Neither hides the other — the description and the scopes are both visible.
    expect(screen.getByText('Read and write your repositories')).toBeInTheDocument();
    expect(screen.getByText('repo, read:org')).toBeInTheDocument();
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
