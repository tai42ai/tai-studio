/**
 * The "Add MCP server" dialog: step 1 checks the address and looks the server up;
 * step 2 reviews what the look-up found, takes the name, identifier and scopes, and
 * adds the server. Every server refusal is shown with the server's message.
 */
import { ApiError } from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AddServerDialog } from './add-server-dialog';
import {
  discovered,
  discoveredProvider,
  makeClient,
  NON_CONVERGED_FANOUT,
  renderWithProviders,
} from './test-utils';

afterEach(() => {
  vi.restoreAllMocks();
});

function renderDialog(overrides: Parameters<typeof makeClient>[0] = {}) {
  const onClose = vi.fn();
  const onAdded = vi.fn();
  const discoverServer = vi.fn().mockResolvedValue(discovered());
  const addServer = vi.fn().mockResolvedValue({ provider: discoveredProvider(), fanout: null });
  const listProviders = vi.fn().mockResolvedValue({ providers: [], categories: [] });
  const client = makeClient({ discoverServer, addServer, listProviders, ...overrides });
  const utils = renderWithProviders(<AddServerDialog onClose={onClose} onAdded={onAdded} />, {
    client,
  });
  return { ...utils, onClose, onAdded, client };
}

async function lookUp(address = 'https://mcp.example.com/mcp') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Server address'), address);
  await user.click(screen.getByRole('button', { name: 'Look up' }));
  return user;
}

describe('AddServerDialog — step 1, the address', () => {
  it('focuses the address field and describes it', () => {
    renderDialog();
    const field = screen.getByLabelText('Server address');
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute('placeholder', 'https://mcp.example.com/mcp');
    expect(
      screen.getByText('The URL of an MCP server that signs in with OAuth.'),
    ).toBeInTheDocument();
  });

  it('refuses an address that is not https before any request', async () => {
    const { client } = renderDialog();
    await lookUp('http://mcp.example.com/mcp');
    expect(screen.getByText('Enter an https address.')).toBeInTheDocument();
    expect(client.discoverServer).not.toHaveBeenCalled();
  });

  it('accepts http on localhost and looks it up', async () => {
    const { client } = renderDialog();
    await lookUp('http://localhost:8080/mcp');
    await waitFor(() => {
      expect(client.discoverServer).toHaveBeenCalledWith({ url: 'http://localhost:8080/mcp' });
    });
  });

  it('submits on Enter', async () => {
    const { client } = renderDialog();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Server address'), 'https://mcp.example.com/mcp{Enter}');
    await waitFor(() => {
      expect(client.discoverServer).toHaveBeenCalledWith({ url: 'https://mcp.example.com/mcp' });
    });
  });

  it("keeps the address and shows the server's message when the look-up fails", async () => {
    const message =
      'The server publishes no sign-in information (resource metadata): 404. A server without sign-in can be added as a plain MCP server.';
    renderDialog({
      discoverServer: vi
        .fn()
        .mockRejectedValue(new ApiError(message, 400, 'connector-discovery-failed')),
    });
    const user = await lookUp();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('The server could not be added')).toBeInTheDocument();
    expect(within(alert).getByText(message)).toBeInTheDocument();
    const field = screen.getByLabelText('Server address');
    expect(field).toHaveValue('https://mcp.example.com/mcp');
    expect(field).toBeEnabled();
    await user.type(field, '2');
    expect(field).toHaveValue('https://mcp.example.com/mcp2');
    expect(screen.queryByText('Signs in at')).toBeNull();
  });

  it('shows the feature-off note inside the dialog when the store is not configured', async () => {
    renderDialog({
      discoverServer: vi
        .fn()
        .mockRejectedValue(
          new ApiError('the connectors store is not configured', 501, 'connectors-not-configured'),
        ),
    });
    await lookUp();
    const note = await screen.findByTestId('feature-disabled');
    expect(note).toHaveTextContent('the connectors store is not configured');
    expect(within(screen.getByRole('dialog')).getByTestId('feature-disabled')).toBe(note);
  });
});

describe('AddServerDialog — step 2, the review', () => {
  it('summarises a server that registers apps by itself and moves focus to Name', async () => {
    renderDialog();
    await lookUp();
    expect(await screen.findByText('Signs in at')).toBeInTheDocument();
    expect(screen.getByText('login.example.com')).toBeInTheDocument();
    expect(screen.getByText('https://mcp.example.com/mcp')).toBeInTheDocument();
    expect(screen.getByText('Automatic')).toBeInTheDocument();
    expect(screen.queryByText('Needs client credentials')).toBeNull();
    const name = screen.getByLabelText('Name');
    expect(name).toHaveValue('Remote files');
    expect(name).toHaveFocus();
    expect(screen.getByLabelText('Identifier')).toHaveValue('remote_files');
    expect(
      screen.getByText(
        'Used in tool names. Lowercase letters, digits and underscores, starting with a letter.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('files.read, files.write')).toBeInTheDocument();
  });

  it('says a server that does not register apps needs client credentials', async () => {
    renderDialog({
      discoverServer: vi.fn().mockResolvedValue(
        discovered({
          registration_supported: false,
          automatic_client: false,
          scopes_supported: [],
        }),
      ),
    });
    await lookUp();
    expect(await screen.findByText('Needs client credentials')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This server does not register apps by itself. After you add it, set its client ID and secret.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Automatic')).toBeNull();
    expect(screen.getByText('Leave empty to request what the server lists.')).toBeInTheDocument();
    expect(screen.queryByText(/The server lists:/)).toBeNull();
  });

  it('Change returns to the address with it kept', async () => {
    renderDialog();
    const user = await lookUp();
    await user.click(await screen.findByRole('button', { name: 'Change' }));
    const field = screen.getByLabelText('Server address');
    expect(field).toHaveValue('https://mcp.example.com/mcp');
    expect(field).toHaveFocus();
  });

  it('holds the identifier to the slug rule before any request', async () => {
    const { client } = renderDialog();
    const user = await lookUp();
    const identifier = await screen.findByLabelText('Identifier');
    await user.clear(identifier);
    await user.type(identifier, '2-files');
    await user.click(screen.getByRole('button', { name: 'Add server' }));
    expect(
      screen.getByText('Use lowercase letters, digits and underscores, starting with a letter.'),
    ).toBeInTheDocument();
    expect(client.addServer).not.toHaveBeenCalled();
  });

  it('requires a name before any request', async () => {
    const { client } = renderDialog();
    const user = await lookUp();
    await user.clear(await screen.findByLabelText('Name'));
    await user.click(screen.getByRole('button', { name: 'Add server' }));
    expect(screen.getByText('A name is required.')).toBeInTheDocument();
    expect(client.addServer).not.toHaveBeenCalled();
  });

  it('shows a taken identifier on the field', async () => {
    const { onAdded } = renderDialog({
      addServer: vi
        .fn()
        .mockRejectedValue(
          new ApiError("'remote_files': a provider with this id is in the manifest", 409),
        ),
    });
    const user = await lookUp();
    await user.click(await screen.findByRole('button', { name: 'Add server' }));
    expect(await screen.findByText('This identifier is already in use.')).toBeInTheDocument();
    expect(screen.getByLabelText('Identifier')).toHaveAttribute('aria-invalid', 'true');
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("shows any other refusal with the server's message", async () => {
    renderDialog({
      addServer: vi.fn().mockRejectedValue(new ApiError('unknown category: other', 400)),
    });
    const user = await lookUp();
    await user.click(await screen.findByRole('button', { name: 'Add server' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('The server could not be added')).toBeInTheDocument();
    expect(within(alert).getByText('unknown category: other')).toBeInTheDocument();
  });

  it('sends the parsed scopes, the name and the identifier', async () => {
    const { client, onAdded } = renderDialog();
    const user = await lookUp();
    await user.type(await screen.findByLabelText('Scopes'), ' files.read   files.write ');
    await user.click(screen.getByRole('button', { name: 'Add server' }));
    await waitFor(() => {
      expect(client.addServer).toHaveBeenCalledWith({
        url: 'https://mcp.example.com/mcp',
        id: 'remote_files',
        display_name: 'Remote files',
        scopes: ['files.read', 'files.write'],
      });
    });
    await waitFor(() => {
      expect(onAdded).toHaveBeenCalledWith(discoveredProvider(), true);
    });
    // The catalog is read again so the new provider is listed.
    await waitFor(() => {
      expect(client.listProviders).toHaveBeenCalled();
    });
  });

  it('hands the page a server that needs client credentials as such', async () => {
    const { onAdded } = renderDialog({
      discoverServer: vi
        .fn()
        .mockResolvedValue(discovered({ registration_supported: false, automatic_client: false })),
    });
    const user = await lookUp();
    await user.click(await screen.findByRole('button', { name: 'Add server' }));
    await waitFor(() => {
      expect(onAdded).toHaveBeenCalledWith(discoveredProvider(), false);
    });
  });

  it('stays open with the fleet report when the reload did not reach every worker', async () => {
    const { onAdded } = renderDialog({
      addServer: vi
        .fn()
        .mockResolvedValue({ provider: discoveredProvider(), fanout: NON_CONVERGED_FANOUT }),
    });
    const user = await lookUp();
    await user.click(await screen.findByRole('button', { name: 'Add server' }));
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/did not converge/)).toBeInTheDocument();
    expect(within(alert).getByText('serve-b')).toBeInTheDocument();
    expect(onAdded).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Back returns to the address', async () => {
    renderDialog();
    const user = await lookUp();
    await user.click(await screen.findByRole('button', { name: 'Back' }));
    expect(screen.getByLabelText('Server address')).toHaveValue('https://mcp.example.com/mcp');
  });
});
