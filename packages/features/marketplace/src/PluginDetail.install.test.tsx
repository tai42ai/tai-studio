import {
  ApiError,
  type MarketplaceInstallPreview,
  type MarketplacePluginDetail,
} from '@tai42/api-client';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PluginDetail } from './PluginDetail';
import {
  connectorDetail,
  detailFixture,
  envPreview,
  installReceipt,
  mcpServerDetail,
  noop,
  reads,
  renderWithProviders,
  type StubApiClient,
} from './test-utils';

describe('PluginDetail — install env dialog', () => {
  it('collects the preview’s missing var; an mcp-server marker (secret:false) is NOT masked by default', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi
      .fn()
      .mockResolvedValue(installReceipt('tai42/postgres-mcp'));
    const client: StubApiClient = {
      ...reads(mcpServerDetail(), []),
      previewMarketplaceInstall: vi.fn().mockResolvedValue(envPreview(['DATABASE_URL'])),
      installMarketplacePlugin,
    };
    renderWithProviders(<PluginDetail refValue="tai42/postgres-mcp" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const field = await screen.findByLabelText('DATABASE_URL');
    const dialog = screen.getByRole('dialog');
    // A marker var is derived secret:false, so its toggle starts OFF.
    expect(within(dialog).getByRole('checkbox', { name: 'Store as secret' })).not.toBeChecked();

    await user.type(field, 'postgres://db');
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));

    await waitFor(() => {
      expect(installMarketplacePlugin).toHaveBeenCalledWith({
        ref: 'tai42/postgres-mcp',
        env: { DATABASE_URL: 'postgres://db' },
        secret_keys: [],
      });
    });
  });

  it('masks a marker var once its Store-as-secret toggle is turned ON', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi
      .fn()
      .mockResolvedValue(installReceipt('tai42/postgres-mcp'));
    const client: StubApiClient = {
      ...reads(mcpServerDetail(), []),
      previewMarketplaceInstall: vi.fn().mockResolvedValue(envPreview(['DATABASE_URL'])),
      installMarketplacePlugin,
    };
    renderWithProviders(<PluginDetail refValue="tai42/postgres-mcp" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const field = await screen.findByLabelText('DATABASE_URL');
    const dialog = screen.getByRole('dialog');
    await user.type(field, 'postgres://db');
    // Turn the (off-by-default) marker toggle ON: the operator opts the value into the
    // secret band; it must now ride in secret_keys.
    await user.click(within(dialog).getByRole('checkbox', { name: 'Store as secret' }));
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));

    await waitFor(() => {
      expect(installMarketplacePlugin).toHaveBeenCalledWith({
        ref: 'tai42/postgres-mcp',
        env: { DATABASE_URL: 'postgres://db' },
        secret_keys: ['DATABASE_URL'],
      });
    });
  });

  it('a connector: the client secret is locked ON, the client id is not force-masked', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi.fn().mockResolvedValue(installReceipt('iota/relay'));
    const client: StubApiClient = {
      ...reads(connectorDetail(), []),
      previewMarketplaceInstall: vi
        .fn()
        .mockResolvedValue(envPreview(['IOTA_CLIENT_ID', 'IOTA_CLIENT_SECRET'])),
      installMarketplacePlugin,
    };
    renderWithProviders(<PluginDetail refValue="iota/relay" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const idField = await screen.findByLabelText('IOTA_CLIENT_ID');
    const dialog = screen.getByRole('dialog');
    // Generic copy: no mcp-server-only wording.
    expect(within(dialog).getByText(/needs these values to install/)).toBeInTheDocument();
    const toggles = within(dialog).getAllByRole('checkbox', { name: 'Store as secret' });
    // The client id (secret:false) starts OFF and is free; the client secret
    // (secret:true) is ON and LOCKED — the server masks it regardless.
    expect(toggles[0]).not.toBeChecked();
    expect(toggles[0]).toBeEnabled();
    expect(toggles[1]).toBeChecked();
    expect(toggles[1]).toBeDisabled();

    await user.type(idField, 'client-id');
    await user.type(within(dialog).getByLabelText('IOTA_CLIENT_SECRET'), 'shh');
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));

    await waitFor(() => {
      expect(installMarketplacePlugin).toHaveBeenCalledWith({
        ref: 'iota/relay',
        env: { IOTA_CLIENT_ID: 'client-id', IOTA_CLIENT_SECRET: 'shh' },
        // The client id is NOT force-masked; only the derived-secret client secret is.
        secret_keys: ['IOTA_CLIENT_SECRET'],
      });
    });
  });

  it('names which item needs each var', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      ...reads(connectorDetail(), []),
      previewMarketplaceInstall: vi.fn().mockResolvedValue(envPreview(['IOTA_CLIENT_ID'])),
      installMarketplacePlugin: vi.fn(),
    };
    renderWithProviders(<PluginDetail refValue="iota/relay" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    await screen.findByLabelText('IOTA_CLIENT_ID');
    expect(screen.getByText('Required by relay')).toBeInTheDocument();
  });

  it('every var pre-satisfied (empty missing_env): a one-click install with no fields', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi.fn().mockResolvedValue(installReceipt('iota/relay'));
    const client: StubApiClient = {
      ...reads(connectorDetail(), []),
      previewMarketplaceInstall: vi.fn().mockResolvedValue(envPreview([])),
      installMarketplacePlugin,
    };
    renderWithProviders(<PluginDetail refValue="iota/relay" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const dialog = await screen.findByRole('dialog');
    // No field to fill — the deployment already provides every required var.
    await waitFor(() => {
      expect(within(dialog).queryByLabelText('IOTA_CLIENT_ID')).toBeNull();
    });
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));
    await waitFor(() => {
      expect(installMarketplacePlugin).toHaveBeenCalledWith({ ref: 'iota/relay' });
    });
  });
});

/**
 * A NON-route mcp-server whose registry DETAIL carries NO per-item `required_env`
 * (the true wire shape — the registry omits it). Any env the install needs is known
 * only from the install preview, so this fixture proves the dialog cannot be driven
 * off the detail.
 */
function mcpNoDetailEnv(): MarketplacePluginDetail {
  return detailFixture({
    namespace: 'tai42',
    name: 'llm-mcp',
    package: 'tai42-llm-mcp',
    latest: {
      version: '1.0.0',
      contract_range: '>=1.0',
      status: 'published',
      published_at: '2026-07-01T00:00:00Z',
      items: [
        {
          kind: 'mcp-server',
          name: 'llm',
          description: 'An LLM bridge.',
          tags: [],
          group: null,
          // No required_env: the registry detail never carries it.
        },
      ],
    },
  });
}

/** An install preview carrying the env picture the server computes: the required
 *  vars (with secret-ness) and the subset still missing from the deployment. */
function envPreviewWith(
  requiredEnv: { name: string; secret: boolean }[],
  missing: string[],
): MarketplaceInstallPreview {
  return {
    ref: 'tai42/llm-mcp',
    version: '1.0.0',
    items: [],
    collisions: [],
    public_routes: [],
    new_public_routes: [],
    requires_public_acceptance: false,
    required_env: requiredEnv,
    missing_env: missing,
    delivery: 'package',
  };
}

describe('PluginDetail — non-route env driven by the preview, not the detail', () => {
  it('routes a detail-envless plugin to the env dialog when the PREVIEW reports missing env, and locks a preview-secret var ON', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi.fn().mockResolvedValue(installReceipt('tai42/llm-mcp'));
    const client: StubApiClient = {
      ...reads(mcpNoDetailEnv(), []),
      // The detail declared NO env; the preview is the sole authority, and it marks
      // OPENAI_API_KEY secret.
      previewMarketplaceInstall: vi
        .fn()
        .mockResolvedValue(
          envPreviewWith([{ name: 'OPENAI_API_KEY', secret: true }], ['OPENAI_API_KEY']),
        ),
      installMarketplacePlugin,
    };
    renderWithProviders(<PluginDetail refValue="tai42/llm-mcp" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    // The env dialog opened solely because the preview reported missing env — the
    // detail carries none, so a detail-derived path would show a plain confirm and
    // install with an empty body.
    const field = await screen.findByLabelText('OPENAI_API_KEY');
    const dialog = screen.getByRole('dialog');
    const toggle = within(dialog).getByRole('checkbox', { name: 'Store as secret' });
    // The preview's `required_env[].secret` seeds the toggle: a secret var is checked
    // AND locked (the server masks it regardless).
    expect(toggle).toBeChecked();
    expect(toggle).toBeDisabled();

    await user.type(field, 'sk-live');
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));

    await waitFor(() => {
      expect(installMarketplacePlugin).toHaveBeenCalledWith({
        ref: 'tai42/llm-mcp',
        env: { OPENAI_API_KEY: 'sk-live' },
        secret_keys: ['OPENAI_API_KEY'],
      });
    });
  });

  it('a preview marker var (secret:false) collects but is NOT masked by default', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi.fn().mockResolvedValue(installReceipt('tai42/llm-mcp'));
    const client: StubApiClient = {
      ...reads(mcpNoDetailEnv(), []),
      previewMarketplaceInstall: vi
        .fn()
        .mockResolvedValue(
          envPreviewWith([{ name: 'LLM_ENDPOINT', secret: false }], ['LLM_ENDPOINT']),
        ),
      installMarketplacePlugin,
    };
    renderWithProviders(<PluginDetail refValue="tai42/llm-mcp" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const field = await screen.findByLabelText('LLM_ENDPOINT');
    const dialog = screen.getByRole('dialog');
    const toggle = within(dialog).getByRole('checkbox', { name: 'Store as secret' });
    // A non-secret marker starts OFF and stays free.
    expect(toggle).not.toBeChecked();
    expect(toggle).toBeEnabled();

    await user.type(field, 'https://llm.local');
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));

    await waitFor(() => {
      expect(installMarketplacePlugin).toHaveBeenCalledWith({
        ref: 'tai42/llm-mcp',
        env: { LLM_ENDPOINT: 'https://llm.local' },
        secret_keys: [],
      });
    });
  });

  it('keeps a detail-envless plugin on the PLAIN confirm when the preview reports no env', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi.fn().mockResolvedValue(installReceipt('tai42/llm-mcp'));
    const client: StubApiClient = {
      ...reads(mcpNoDetailEnv(), []),
      // A clean preview: nothing required, nothing missing → the plain one-click confirm.
      previewMarketplaceInstall: vi.fn().mockResolvedValue(envPreviewWith([], [])),
      installMarketplacePlugin,
    };
    renderWithProviders(<PluginDetail refValue="tai42/llm-mcp" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const dialog = await screen.findByRole('dialog');
    // The plain confirm: the packaged-delivery copy, and NO env field.
    await waitFor(() => {
      expect(dialog).toHaveTextContent('The app will pip-install the package and reload.');
    });
    expect(within(dialog).queryByLabelText('OPENAI_API_KEY')).toBeNull();
    expect(within(dialog).queryByRole('checkbox', { name: 'Store as secret' })).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Install' }));
    await waitFor(() => {
      expect(installMarketplacePlugin).toHaveBeenCalledWith({ ref: 'tai42/llm-mcp' });
    });
  });

  it('blocks the plain-confirm Install while the preview is unresolved, then enables it on a clean preview', async () => {
    const user = userEvent.setup();
    // A deferred dry-run: the confirm must not be able to fire an empty-body install
    // in the beat before the preview lands (an env-requiring plugin's preview could
    // still report missing env), so it stays disabled until the dry-run resolves.
    let resolvePreview!: (preview: MarketplaceInstallPreview) => void;
    const previewMarketplaceInstall = vi.fn(
      () =>
        new Promise<MarketplaceInstallPreview>((resolve) => {
          resolvePreview = resolve;
        }),
    );
    const installMarketplacePlugin = vi.fn().mockResolvedValue(installReceipt('tai42/llm-mcp'));
    const client: StubApiClient = {
      ...reads(mcpNoDetailEnv(), []),
      previewMarketplaceInstall,
      installMarketplacePlugin,
    };
    renderWithProviders(<PluginDetail refValue="tai42/llm-mcp" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const dialog = await screen.findByRole('dialog');
    // Preview still pending → the confirm is disabled (no empty-body install slips out).
    expect(within(dialog).getByRole('button', { name: 'Install' })).toBeDisabled();
    expect(installMarketplacePlugin).not.toHaveBeenCalled();

    // A clean no-env preview lands → the plain confirm enables.
    resolvePreview(envPreviewWith([], []));
    await waitFor(() => {
      expect(within(dialog).getByRole('button', { name: 'Install' })).toBeEnabled();
    });

    await user.click(within(dialog).getByRole('button', { name: 'Install' }));
    await waitFor(() => {
      expect(installMarketplacePlugin).toHaveBeenCalledWith({ ref: 'tai42/llm-mcp' });
    });
  });
});

describe('PluginDetail — env dialog var selection and store-off state', () => {
  it('omits a required var left blank from the install body', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi.fn().mockResolvedValue(installReceipt('iota/relay'));
    const client: StubApiClient = {
      ...reads(connectorDetail(), []),
      previewMarketplaceInstall: vi
        .fn()
        .mockResolvedValue(envPreview(['IOTA_CLIENT_ID', 'IOTA_CLIENT_SECRET'])),
      installMarketplacePlugin,
    };
    renderWithProviders(<PluginDetail refValue="iota/relay" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));
    const idField = await screen.findByLabelText('IOTA_CLIENT_ID');
    const dialog = screen.getByRole('dialog');
    // Fill one required var, leave the other blank: the blank one is omitted entirely
    // (not sent as an empty string, not marked secret) — the deployment may provide it.
    await user.type(idField, 'client-id');
    await user.click(within(dialog).getByRole('button', { name: 'Install' }));

    await waitFor(() => {
      expect(installMarketplacePlugin).toHaveBeenCalledWith({
        ref: 'iota/relay',
        env: { IOTA_CLIENT_ID: 'client-id' },
        secret_keys: [],
      });
    });
  });

  it('shows the muted OFF note in the plain install confirm when the install store is not configured', async () => {
    const user = userEvent.setup();
    // Preview is the install's dry-run and refuses with the same reason when the
    // store is off; a rejected preview reports no env, so the non-route plugin stays
    // on the PLAIN confirm, which surfaces THAT refusal as the muted note.
    const previewMarketplaceInstall = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          'the marketplace install store is not configured: set TAI_DATABASE_DEFAULT_PG_PASSWORD',
          501,
          'marketplace-not-configured',
        ),
      );
    const client: StubApiClient = {
      ...reads(connectorDetail(), []),
      previewMarketplaceInstall,
      installMarketplacePlugin: vi.fn(),
    };
    renderWithProviders(<PluginDetail refValue="iota/relay" onBack={noop} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Install' }));

    // The 501 is a state, not an error: the muted note replaces any red alert in the
    // plain install confirm, and the confirm is blocked (a rejected dry-run leaves the
    // env picture unverified). The note appears once the failed dry-run resolves, so it
    // is awaited at the screen level and the dialog is read back from it.
    const note = await screen.findByTestId('feature-disabled');
    expect(note).toHaveTextContent(
      'the marketplace install store is not configured: set TAI_DATABASE_DEFAULT_PG_PASSWORD',
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('alert')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Install' })).toBeDisabled();
  });
});
