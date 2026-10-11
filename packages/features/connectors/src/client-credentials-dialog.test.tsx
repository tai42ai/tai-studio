/**
 * The "Client credentials" dialog: it looks the provider's server up first so the
 * reader sees where the secret will go before typing it, then stores the ID and
 * secret for the chosen sign-in service. The secret is never read back and never
 * kept in the query or mutation cache.
 */
import { ApiError } from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ClientCredentialsDialog } from './client-credentials-dialog';
import { discovered, discoveredProvider, makeClient, renderWithProviders } from './test-utils';

const SECRET = 'typed-client-secret-value';
const TWO_SERVICES = ['https://auth-a.example.net', 'https://auth-b.example.net'];

afterEach(() => {
  vi.restoreAllMocks();
});

function renderDialog(overrides: Parameters<typeof makeClient>[0] = {}) {
  const onClose = vi.fn();
  const onSaved = vi.fn();
  const provider = discoveredProvider({ client_source: 'unset' });
  const client = makeClient({
    discoverServer: vi.fn().mockResolvedValue(discovered()),
    setProviderClient: vi
      .fn()
      .mockResolvedValue({ provider: { ...provider, client_source: 'manual' }, fanout: null }),
    listProviders: vi.fn().mockResolvedValue({ providers: [provider], categories: [] }),
    ...overrides,
  });
  const utils = renderWithProviders(
    <ClientCredentialsDialog provider={provider} onClose={onClose} onSaved={onSaved} />,
    { client },
  );
  return { ...utils, onClose, onSaved, client, provider };
}

describe('ClientCredentialsDialog — the look-up', () => {
  it("looks the provider's server up on open, fields disabled meanwhile", async () => {
    let answer: (value: unknown) => void = () => undefined;
    const { client } = renderDialog({
      discoverServer: vi.fn().mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        }),
      ),
    });
    expect(
      screen.getByRole('dialog', { name: 'Client credentials for Remote files' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The ID and secret of the app you registered with this server's sign-in service.",
      ),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(client.discoverServer).toHaveBeenCalledWith({ providerId: 'remote_files' });
    });
    expect(screen.getByRole('status', { name: 'Looking up' })).toBeInTheDocument();
    expect(screen.getByLabelText('Client ID')).toBeDisabled();
    expect(screen.getByLabelText('Client secret')).toBeDisabled();
    answer(discovered());
    await waitFor(() => {
      expect(screen.getByLabelText('Client ID')).toBeEnabled();
    });
  });

  it("shows the server's message and withholds Save when the look-up fails", async () => {
    renderDialog({
      discoverServer: vi
        .fn()
        .mockRejectedValue(
          new ApiError('The sign-in service could not be reached: timed out', 400),
        ),
    });
    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText('The sign-in service could not be reached: timed out'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('shows the redirect URI to allow, with a copy button', async () => {
    renderDialog();
    expect(
      await screen.findByText('https://studio.example.com/api/connectors/oauth/callback'),
    ).toBeInTheDocument();
    expect(screen.getByText('Redirect URI')).toBeInTheDocument();
    expect(
      screen.getByText("Allow this address in the app's redirect settings."),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });

  it('says sign-in cannot start here when the look-up gives no redirect URI', async () => {
    renderDialog({ discoverServer: vi.fn().mockResolvedValue(discovered({ redirect_uri: null })) });
    expect(
      await screen.findByText(
        'Sign-in cannot start from this address. Ask your operator to add it to the redirect allow-list.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull();
  });
});

describe('ClientCredentialsDialog — where the secret goes', () => {
  it('names the one listed sign-in service in full', async () => {
    renderDialog();
    expect(await screen.findByText('https://login.example.com')).toBeInTheDocument();
    expect(screen.getByText('The client secret is sent only to this service.')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Sign-in service' })).toBeNull();
  });

  it('asks which of several services, preselecting the stored credentials’ one', async () => {
    renderDialog({
      discoverServer: vi.fn().mockResolvedValue(
        discovered({
          authorization_servers: TWO_SERVICES,
          client_issuer: 'https://auth-b.example.net',
        }),
      ),
    });
    const select = await screen.findByRole('combobox', { name: 'Sign-in service' });
    expect(select).toHaveTextContent('https://auth-b.example.net');
  });

  it('preselects nothing among several when no credentials are set, and Save waits for a choice', async () => {
    const user = userEvent.setup();
    renderDialog({
      discoverServer: vi
        .fn()
        .mockResolvedValue(discovered({ authorization_servers: TWO_SERVICES })),
    });
    const select = await screen.findByRole('combobox', { name: 'Sign-in service' });
    expect(select).toHaveTextContent('Choose a sign-in service');
    await user.type(screen.getByLabelText('Client ID'), 'app-1');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText('Choose the sign-in service this app belongs to.')).toBeInTheDocument();
  });

  it('says when the service the credentials were set for is no longer listed', async () => {
    renderDialog({
      discoverServer: vi.fn().mockResolvedValue(
        discovered({
          authorization_servers: TWO_SERVICES,
          client_issuer: 'https://auth-old.example.net',
        }),
      ),
    });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'The sign-in service these credentials were set for is no longer listed by this server.',
    );
    expect(alert).toHaveTextContent('https://auth-old.example.net');
    expect(screen.getByRole('combobox', { name: 'Sign-in service' })).toHaveTextContent(
      'Choose a sign-in service',
    );
  });
});

describe('ClientCredentialsDialog — saving', () => {
  it('requires a client ID', async () => {
    const user = userEvent.setup();
    renderDialog();
    const id = await screen.findByLabelText('Client ID');
    await waitFor(() => {
      expect(id).toBeEnabled();
    });
    await user.click(id);
    await user.tab();
    expect(screen.getByText('A client ID is required.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('stores the ID and secret for the chosen service and hands the page its notice', async () => {
    const user = userEvent.setup();
    const { client, onSaved } = renderDialog();
    const id = await screen.findByLabelText('Client ID');
    await waitFor(() => {
      expect(id).toBeEnabled();
    });
    expect(id).toHaveValue('');
    const secret = screen.getByLabelText('Client secret');
    expect(secret).toHaveValue('');
    expect(secret).toHaveAttribute('type', 'password');
    expect(secret).toHaveAttribute('autocomplete', 'new-password');
    await user.type(id, 'app-1');
    await user.type(secret, SECRET);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(client.setProviderClient).toHaveBeenCalledWith('remote_files', {
        client_id: 'app-1',
        client_secret: SECRET,
        issuer: 'https://login.example.com',
      });
    });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
  });

  it('sends no secret for an app without one', async () => {
    const user = userEvent.setup();
    const { client } = renderDialog();
    const id = await screen.findByLabelText('Client ID');
    await waitFor(() => {
      expect(id).toBeEnabled();
    });
    await user.type(id, 'public-app');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(client.setProviderClient).toHaveBeenCalledWith('remote_files', {
        client_id: 'public-app',
        client_secret: null,
        issuer: 'https://login.example.com',
      });
    });
  });

  it("keeps the dialog and the typed values on a refusal, showing the server's message", async () => {
    const user = userEvent.setup();
    const { onSaved, onClose } = renderDialog({
      setProviderClient: vi
        .fn()
        .mockRejectedValue(new ApiError("the sign-in service does not accept 'none'", 400)),
    });
    const id = await screen.findByLabelText('Client ID');
    await waitFor(() => {
      expect(id).toBeEnabled();
    });
    await user.type(id, 'app-1');
    await user.type(screen.getByLabelText('Client secret'), SECRET);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("the sign-in service does not accept 'none'");
    expect(screen.getByLabelText('Client ID')).toHaveValue('app-1');
    expect(screen.getByLabelText('Client secret')).toHaveValue(SECRET);
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('disables the sign-in service, Client ID and Client secret while the save is in flight', async () => {
    const user = userEvent.setup();
    let answer: (value: unknown) => void = () => undefined;
    const lookup = discovered({
      authorization_servers: TWO_SERVICES,
      client_issuer: 'https://auth-b.example.net',
    });
    const { onSaved } = renderDialog({
      discoverServer: vi.fn().mockResolvedValue(lookup),
      setProviderClient: vi.fn().mockReturnValue(
        new Promise((resolve) => {
          answer = resolve;
        }),
      ),
    });
    await screen.findByRole('combobox', { name: 'Sign-in service' });
    const id = screen.getByLabelText('Client ID');
    await waitFor(() => {
      expect(id).toBeEnabled();
    });
    await user.type(id, 'app-1');
    await user.type(screen.getByLabelText('Client secret'), SECRET);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(screen.getByLabelText('Client ID')).toBeDisabled();
    });
    expect(screen.getByLabelText('Client secret')).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Sign-in service' })).toBeDisabled();
    answer({ provider: discoveredProvider({ client_source: 'manual' }), fanout: null });
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalledOnce();
    });
  });

  it('keeps the secret out of every query and mutation in the cache', async () => {
    const user = userEvent.setup();
    const { queryClient, onSaved } = renderDialog();
    const id = await screen.findByLabelText('Client ID');
    await waitFor(() => {
      expect(id).toBeEnabled();
    });
    await user.type(id, 'app-1');
    await user.type(screen.getByLabelText('Client secret'), SECRET);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(onSaved).toHaveBeenCalled();
    });
    const cached = JSON.stringify([
      queryClient
        .getQueryCache()
        .getAll()
        .map((query) => [query.queryKey, query.state.data]),
      queryClient
        .getMutationCache()
        .getAll()
        .map((mutation) => [
          mutation.options.mutationKey,
          mutation.state.variables,
          mutation.state.data,
        ]),
    ]);
    expect(cached).not.toContain(SECRET);
  });

  it('starts empty again after a close', async () => {
    const user = userEvent.setup();
    const provider = discoveredProvider({ client_source: 'unset' });
    const discoverServer = vi.fn().mockResolvedValue(discovered());
    function Reopen(): ReactNode {
      const [open, setOpen] = useState(true);
      return open ? (
        <ClientCredentialsDialog
          provider={provider}
          onClose={() => {
            setOpen(false);
          }}
          onSaved={vi.fn()}
        />
      ) : (
        <button
          onClick={() => {
            setOpen(true);
          }}
        >
          reopen
        </button>
      );
    }
    renderWithProviders(<Reopen />, { client: makeClient({ discoverServer }) });
    const id = await screen.findByLabelText('Client ID');
    await waitFor(() => {
      expect(id).toBeEnabled();
    });
    await user.type(screen.getByLabelText('Client secret'), SECRET);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(await screen.findByRole('button', { name: 'reopen' }));
    await waitFor(() => {
      expect(discoverServer).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByLabelText('Client secret')).toHaveValue('');
  });
});
