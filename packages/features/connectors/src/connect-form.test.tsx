/**
 * Tests for the CONNECT form: OAuth providers hand off to the popup flow; no-auth
 * providers complete immediately; either way the landed connection's id and the
 * fleet summary of its manifest write go to `onConnected`. The alias is required
 * before submit.
 */
import { ApiError } from '@tai42/api-client';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConnectForm } from './connect-form';
import { OAUTH_MESSAGE_TYPE } from './oauth';
import {
  fullProjection,
  makeClient,
  makeFakePopup,
  NON_CONVERGED_FANOUT,
  postMessageFrom,
  provider,
  renderWithProviders,
  scopedProjection,
} from './test-utils';

const goodMessage = {
  type: OAUTH_MESSAGE_TYPE,
  code: 'the-code',
  state: 'the-state',
  error: null,
  iss: null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ConnectForm', () => {
  it('starts the OAuth popup flow when startConnect returns an authorize_url', async () => {
    const user = userEvent.setup();
    const popup = makeFakePopup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const startConnect = vi
      .fn()
      .mockResolvedValue({ flow_id: 'f1', authorize_url: 'https://provider/auth' });
    renderWithProviders(
      <ConnectForm provider={provider()} onConnected={vi.fn()} onCancel={vi.fn()} />,
      { client: makeClient({ startConnect }) },
    );

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

  it('completes immediately for a no-auth provider', async () => {
    const user = userEvent.setup();
    const onConnected = vi.fn();
    const startConnect = vi.fn().mockResolvedValue({
      connection_id: 'c1',
      added_manifest_entries: ['x'],
      fanout: null,
      span_release_error: null,
    });
    const noAuthProvider = provider({
      kind: 'none',
      sub_services: [],
      config_fields: [
        { key: 'api_key', label: 'API key', target: 'header', required: true, secret: true },
      ],
    });
    renderWithProviders(
      <ConnectForm provider={noAuthProvider} onConnected={onConnected} onCancel={vi.fn()} />,
      { client: makeClient({ startConnect }) },
    );

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
      expect(onConnected).toHaveBeenCalledWith('c1', null);
    });
  });

  it('hands the stranded fleet on with the connection on a non-converged OAuth completion', async () => {
    const user = userEvent.setup();
    const onConnected = vi.fn();
    const popup = makeFakePopup();
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const startConnect = vi
      .fn()
      .mockResolvedValue({ flow_id: 'f1', authorize_url: 'https://provider/auth' });
    const completeOAuth = vi.fn().mockResolvedValue({
      kind: 'success',
      connection_id: 'c1',
      return_url: '/x',
      span_release_error: null,
      fanout: NON_CONVERGED_FANOUT,
    });
    renderWithProviders(
      <ConnectForm provider={provider()} onConnected={onConnected} onCancel={vi.fn()} />,
      { client: makeClient({ startConnect, completeOAuth }) },
    );

    await user.type(screen.getByLabelText('Alias'), 'work-account');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(startConnect).toHaveBeenCalled();
    });
    postMessageFrom(popup, goodMessage);

    await waitFor(() => {
      expect(onConnected).toHaveBeenCalledWith(
        'c1',
        expect.objectContaining({
          failures: [expect.objectContaining({ name: 'serve-b', outcome: 'departed' })],
        }),
      );
    });
  });

  it('hands on the connection with no fleet report on a converged OAuth completion', async () => {
    const user = userEvent.setup();
    const onConnected = vi.fn();
    const popup = makeFakePopup();
    vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    const startConnect = vi
      .fn()
      .mockResolvedValue({ flow_id: 'f1', authorize_url: 'https://provider/auth' });
    const completeOAuth = vi.fn().mockResolvedValue({
      kind: 'success',
      connection_id: 'c1',
      return_url: '/x',
      span_release_error: null,
      fanout: null,
    });
    renderWithProviders(
      <ConnectForm provider={provider()} onConnected={onConnected} onCancel={vi.fn()} />,
      { client: makeClient({ startConnect, completeOAuth }) },
    );

    await user.type(screen.getByLabelText('Alias'), 'work-account');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => {
      expect(startConnect).toHaveBeenCalled();
    });
    postMessageFrom(popup, goodMessage);

    await waitFor(() => {
      expect(onConnected).toHaveBeenCalledWith('c1', null);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders a secret config field as a password input', () => {
    const secretProvider = provider({
      config_fields: [
        { key: 'token', label: 'Token', target: 'env', required: false, secret: true },
      ],
    });
    renderWithProviders(
      <ConnectForm provider={secretProvider} onConnected={vi.fn()} onCancel={vi.fn()} />,
      { client: makeClient({ startConnect: vi.fn() }) },
    );

    const input = screen.getByLabelText('Token');
    expect(input).toHaveAttribute('type', 'password');
  });

  it('shows the muted OFF note and disables Connect when the token store is not configured', async () => {
    // Providers are installed (the form opens), but the connector token store is
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
    renderWithProviders(
      <ConnectForm provider={provider()} onConnected={vi.fn()} onCancel={vi.fn()} />,
      { client: makeClient({ startConnect }) },
    );

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
    renderWithProviders(
      <ConnectForm provider={provider()} onConnected={vi.fn()} onCancel={vi.fn()} />,
      { client: makeClient({ startConnect }) },
    );

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

  it('says a server needs client credentials and offers to set them to an administrator', async () => {
    const user = userEvent.setup();
    const onSetClientCredentials = vi.fn();
    const startConnect = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          "provider 'remote_files' has no client credentials for its sign-in service",
          501,
          'connector-client-credentials-required',
        ),
      );
    const target = provider({ id: 'remote_files', display_name: 'Remote files' });
    renderWithProviders(
      <ConnectForm
        provider={target}
        onConnected={vi.fn()}
        onCancel={vi.fn()}
        onSetClientCredentials={onSetClientCredentials}
      />,
      { client: makeClient({ startConnect }), projection: fullProjection() },
    );

    await user.type(screen.getByLabelText('Alias'), 'work-account');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(await screen.findByText('This server needs client credentials')).toBeInTheDocument();
    expect(
      screen.getByText("provider 'remote_files' has no client credentials for its sign-in service"),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
    await user.click(await screen.findByRole('button', { name: 'Set client credentials' }));
    expect(onSetClientCredentials).toHaveBeenCalledWith(target);
  });

  it('says a server needs client credentials without the action to a caller who cannot set them', async () => {
    const user = userEvent.setup();
    const startConnect = vi
      .fn()
      .mockRejectedValue(
        new ApiError('no client credentials', 501, 'connector-client-credentials-required'),
      );
    renderWithProviders(
      <ConnectForm
        provider={provider()}
        onConnected={vi.fn()}
        onCancel={vi.fn()}
        onSetClientCredentials={vi.fn()}
      />,
      { client: makeClient({ startConnect }), projection: scopedProjection() },
    );

    await user.type(screen.getByLabelText('Alias'), 'work-account');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(await screen.findByText('This server needs client credentials')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set client credentials' })).toBeNull();
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
    renderWithProviders(
      <ConnectForm provider={consentProvider} onConnected={vi.fn()} onCancel={vi.fn()} />,
      { client: makeClient({ startConnect: vi.fn() }) },
    );

    // Neither hides the other — the description and the scopes are both visible.
    expect(screen.getByText('Read and write your repositories')).toBeInTheDocument();
    expect(screen.getByText('repo, read:org')).toBeInTheDocument();
  });

  it('requires an alias before submitting', () => {
    const startConnect = vi.fn();
    renderWithProviders(
      <ConnectForm provider={provider()} onConnected={vi.fn()} onCancel={vi.fn()} />,
      { client: makeClient({ startConnect }) },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    expect(startConnect).not.toHaveBeenCalled();
    expect(screen.getByText('An alias is required.')).toBeInTheDocument();
  });

  it('calls onCancel from Cancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderWithProviders(
      <ConnectForm provider={provider()} onConnected={vi.fn()} onCancel={onCancel} />,
      { client: makeClient({ startConnect: vi.fn() }) },
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
