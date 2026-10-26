/**
 * The connect flow dialog: its steps follow the session's pick grants, the server
 * Connect step reads the live status, a connection's Pick tools opens on that
 * connection's titles alone, and a marketplace listing installs in place and waits
 * until this Studio sees what it added.
 */
import {
  type ApiClient,
  apiRoutes,
  type MarketplaceInstallPreview,
  type MeProjection,
} from '@tai42/api-client';
import { StaticToolDisplayNamesProvider } from '@tai42/studio-sdk/testing';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConnectFlowDialog, type FlowTarget } from './connect-flow-dialog';
import { INSTALL_SETTLE_TIMEOUT_MS } from './listing-connect-step';
import {
  fullProjection,
  installReceipt,
  listing,
  listingDetail,
  makeClient,
  NON_CONVERGED_FANOUT,
  provider,
  renderWithProviders,
  scopedProjection,
} from './test-utils';
import type { DirectoryReads, McpStatusView, ServerEntry } from './use-directory';

const ADVERTISED = apiRoutes.post_api_mcp_status_title_advertised_tools.path;
const TOOL_FILTER = apiRoutes.put_api_mcp_config_entries_title_tool_filter.path;
const RELOAD = apiRoutes.post_api_mcp_status_title_reload.path;

const editorProjection = (): MeProjection =>
  scopedProjection({
    routes: [
      { path: ADVERTISED, methods: ['POST'] },
      { path: TOOL_FILTER, methods: ['PUT'] },
    ],
  });

function ready<T>(data: T) {
  return { status: 'ready' as const, data };
}

function entry(title: string, connectionId: string | null = null): ServerEntry {
  return { title, include: [], exclude: [], connectionId };
}

function reads({
  manifest = [],
  status = { bound: {}, failed: [] },
}: { manifest?: ServerEntry[]; status?: McpStatusView } = {}): DirectoryReads {
  return {
    providers: ready([]),
    connections: ready([]),
    manifest: ready(manifest),
    status: ready(status),
    installed: ready(new Set<string>()),
    marketplace: {
      state: ready([]),
      hasNextPage: false,
      fetchingNext: false,
      nextPageError: null,
      fetchNext: vi.fn(),
    },
  };
}

function advertised(title: string, toolNames: string[] = [`${title}_send`]) {
  return {
    title,
    include: [],
    exclude: [],
    tools: toolNames.map((name) => ({
      name,
      selected: true,
      bound: true,
      title: null,
      description: null,
      unbound_reason: null,
    })),
    unadvertised: [],
  };
}

function baseClient(overrides: Partial<ApiClient> = {}): ApiClient {
  return makeClient({
    listMcpAdvertisedTools: vi.fn((title: string) => Promise.resolve(advertised(title))),
    ...overrides,
  });
}

function renderFlow(
  target: FlowTarget,
  {
    client = baseClient(),
    projection = fullProjection(),
    directory = reads(),
    names = {},
  }: {
    client?: ApiClient;
    projection?: MeProjection;
    directory?: DirectoryReads;
    names?: Record<string, string>;
  } = {},
) {
  const onClose = vi.fn();
  const onSetClientCredentials = vi.fn();
  const utils = renderWithProviders(
    <StaticToolDisplayNamesProvider names={names}>
      <ConnectFlowDialog
        target={target}
        reads={directory}
        onClose={onClose}
        onSetClientCredentials={onSetClientCredentials}
      />
    </StaticToolDisplayNamesProvider>,
    { client, projection },
  );
  return { ...utils, onClose, onSetClientCredentials };
}

function stepLabels(): string[] {
  const nav = screen.getByRole('navigation', { name: 'Connection steps' });
  return within(nav)
    .getAllByRole('listitem')
    .map((item) => item.textContent);
}

async function currentStep(): Promise<string> {
  const nav = await screen.findByRole('navigation', { name: 'Connection steps' });
  const current = within(nav)
    .getAllByRole('listitem')
    .find((item) => item.getAttribute('aria-current') === 'step');
  return current?.textContent ?? '';
}

const BOUND: McpStatusView = { bound: { acme: ['acme_send'] }, failed: [] };

describe('ConnectFlowDialog — the steps follow the pick grants', () => {
  it('draws three steps for a session that may list and write a pick', async () => {
    const user = userEvent.setup();
    const client = baseClient();
    renderFlow(
      { kind: 'server', title: 'acme' },
      { client, projection: editorProjection(), directory: reads({ status: BOUND }) },
    );
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(stepLabels()).toHaveLength(3);
    expect(await currentStep()).toContain('Pick tools');
    await waitFor(() => {
      expect(client.listMcpAdvertisedTools).toHaveBeenCalledWith('acme', expect.anything());
    });
  });

  it.each<[string, () => MeProjection, string]>([
    [
      'a viewer',
      () => scopedProjection(),
      'POST /api/mcp-status/{title}/advertised-tools and PUT /api/mcp-config/entries/{title}/tool-filter',
    ],
    [
      'a session reaching only the advertised route',
      () => scopedProjection({ routes: [{ path: ADVERTISED, methods: ['POST'] }] }),
      'PUT /api/mcp-config/entries/{title}/tool-filter;',
    ],
    [
      'a session holding the tool-filter route with POST only',
      () =>
        scopedProjection({
          routes: [
            { path: ADVERTISED, methods: ['POST'] },
            { path: TOOL_FILTER, methods: ['POST'] },
          ],
        }),
      'PUT /api/mcp-config/entries/{title}/tool-filter;',
    ],
  ])('skips Pick tools for %s and names the missing route', async (_name, projection, routes) => {
    const user = userEvent.setup();
    const client = baseClient();
    renderFlow(
      { kind: 'server', title: 'acme' },
      {
        client,
        projection: projection(),
        directory: reads({ manifest: [entry('acme')], status: BOUND }),
      },
    );
    await user.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(stepLabels()).toHaveLength(2);
    expect(await screen.findByRole('heading', { name: 'acme is connected.' })).toBeInTheDocument();
    const line = screen.getByText(/Choosing which ones mount needs write access to/);
    expect(line.textContent).toBe(
      `Every tool this server offers is mounted. Choosing which ones mount needs write access to ${routes.replace(/;$/, '')}; ask an administrator to grant it.`,
    );
    expect(client.listMcpAdvertisedTools).not.toHaveBeenCalled();
  });
});

describe('ConnectFlowDialog — the server Connect step', () => {
  it('shows a bound server as Connected with Continue', async () => {
    renderFlow({ kind: 'server', title: 'acme' }, { directory: reads({ status: BOUND }) });
    expect(await screen.findByText('Connected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('shows a failed server with its failure and reloads it on Try again', async () => {
    const user = userEvent.setup();
    const reloadMcp = vi.fn().mockResolvedValue({
      op: 'reload_mcp',
      reachable: true,
      local_only: true,
      results: [],
      error: null,
    });
    renderFlow(
      { kind: 'server', title: 'acme' },
      {
        client: baseClient({ reloadMcp }),
        projection: scopedProjection({ routes: [{ path: RELOAD, methods: ['POST'] }] }),
        directory: reads({
          status: { bound: {}, failed: [{ title: 'acme', category: 'auth', message: 'denied' }] },
        }),
      },
    );
    expect(await screen.findByText('Failed: auth')).toBeInTheDocument();
    expect(screen.getByText('denied')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => {
      expect(reloadMcp).toHaveBeenCalledWith('acme');
    });
  });

  it('says a configured server is not loaded and offers Load now', async () => {
    renderFlow(
      { kind: 'server', title: 'acme' },
      { directory: reads({ manifest: [entry('acme')] }) },
    );
    expect(
      await screen.findByText(
        'acme is configured, but the worker that answered has not loaded it.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Load now' })).toBeInTheDocument();
  });

  it('names the reload route instead of a button for a session without it', async () => {
    renderFlow(
      { kind: 'server', title: 'acme' },
      { projection: scopedProjection(), directory: reads({ manifest: [entry('acme')] }) },
    );
    expect(
      await screen.findByText(
        'This session cannot reload acme. Reloading needs write access to POST /api/mcp-status/{title}/reload; ask an administrator to grant it.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load now' })).toBeNull();
  });
});

describe('ConnectFlowDialog — Pick tools for a connection', () => {
  it("opens on the connection's own titles with no way back to Connect", async () => {
    const client = baseClient();
    renderFlow(
      { kind: 'pick', name: 'Acme (personal)', titles: [], connectionId: 'conn-2' },
      {
        client,
        directory: reads({
          manifest: [entry('acme_mail_work', 'conn-1'), entry('acme_mail_personal', 'conn-2')],
        }),
      },
    );
    expect(
      await screen.findByRole('dialog', { name: 'Pick tools: Acme (personal)' }),
    ).toBeVisible();
    expect(await currentStep()).toContain('Pick tools');
    const nav = screen.getByRole('navigation', { name: 'Connection steps' });
    expect(within(nav).queryByRole('button')).toBeNull();
    await waitFor(() => {
      expect(client.listMcpAdvertisedTools).toHaveBeenCalledTimes(1);
    });
    expect(client.listMcpAdvertisedTools).toHaveBeenCalledWith(
      'acme_mail_personal',
      expect.anything(),
    );
  });
});

describe('ConnectFlowDialog — the Pick tools rows', () => {
  it('labels a mapped tool with its display name and the filter matches either name', async () => {
    const user = userEvent.setup();
    const client = baseClient({
      listMcpAdvertisedTools: vi.fn((title: string) =>
        Promise.resolve(advertised(title, ['acme_send', 'acme_read'])),
      ),
    });
    renderFlow(
      { kind: 'pick', name: 'acme', titles: ['acme'], connectionId: null },
      {
        client,
        directory: reads({ manifest: [entry('acme')] }),
        names: { acme_send: 'Send mail' },
      },
    );
    await user.click(
      await screen.findByRole('checkbox', {
        name: 'Mount every tool, including tools the server adds later',
      }),
    );
    expect(await screen.findByRole('checkbox', { name: 'Send mail (acme_send)' })).toBeVisible();
    expect(screen.getByRole('checkbox', { name: 'acme_read' })).toBeVisible();
    const filter = screen.getByRole('textbox', { name: 'Filter tools' });
    await user.type(filter, 'send mail');
    expect(screen.getByRole('checkbox', { name: 'Send mail (acme_send)' })).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: 'acme_read' })).toBeNull();
    await user.clear(filter);
    await user.type(filter, 'acme_send');
    expect(screen.getByRole('checkbox', { name: 'Send mail (acme_send)' })).toBeVisible();
    expect(screen.queryByRole('checkbox', { name: 'acme_read' })).toBeNull();
  });
});

const PREVIEW: MarketplaceInstallPreview = {
  ref: 'acme/mail',
  version: '1.0.0',
  items: [],
  collisions: [],
  public_routes: [],
  new_public_routes: [],
  requires_public_acceptance: false,
  required_env: [],
  missing_env: [],
  delivery: 'package',
};

const CONNECTOR_DETAIL = listingDetail([{ kind: 'connector', name: 'acme_mail' }]);
const SERVER_DETAIL = listingDetail([{ kind: 'mcp-server', name: 'acme_mail' }]);
const ACME_MAIL = provider({ id: 'acme_mail', display_name: 'Acme Mail' });

function listingClient(overrides: Partial<ApiClient>): ApiClient {
  return baseClient({
    getMarketplacePlugin: vi.fn().mockResolvedValue(CONNECTOR_DETAIL),
    previewMarketplaceInstall: vi.fn().mockResolvedValue(PREVIEW),
    installMarketplacePlugin: vi.fn().mockResolvedValue(installReceipt(NON_CONVERGED_FANOUT)),
    listProviders: vi.fn().mockResolvedValue({ providers: [] }),
    ...overrides,
  });
}

async function install(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  const form = await screen.findByRole('form', { name: 'Install plugin' });
  const button = within(form).getByRole('button', { name: 'Install' });
  await waitFor(() => {
    expect(button).toBeEnabled();
  });
  await user.click(button);
}

const LISTING: FlowTarget = { kind: 'listing', listing: listing() };
const MISSING_PROVIDER = 'Acme Mail was installed, but this server does not list acme_mail yet.';

describe('ConnectFlowDialog — a marketplace listing', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('installs, waits for the provider and shows its connect form once a check finds it', async () => {
    const user = userEvent.setup();
    const listProviders = vi
      .fn()
      .mockResolvedValueOnce({ providers: [] })
      .mockResolvedValue({ providers: [ACME_MAIL] });
    renderFlow(LISTING, { client: listingClient({ listProviders }) });
    expect(await screen.findByRole('dialog', { name: 'Connect Acme Mail' })).toBeVisible();
    await install(user);
    expect(
      await screen.findByRole('status', { name: 'Waiting for the workers to load Acme Mail…' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('button', { name: 'Connect' })).toBeInTheDocument();
    expect(screen.queryByText(MISSING_PROVIDER)).toBeNull();
  });

  it('waits for an mcp-server title in the status read, then opens Pick tools', async () => {
    const user = userEvent.setup();
    const getMcpStatus = vi
      .fn()
      .mockResolvedValueOnce({ bound: {}, failed: [] })
      .mockResolvedValue({ bound: { acme_mail: ['acme_mail_send'] }, failed: [] });
    const client = listingClient({
      getMarketplacePlugin: vi.fn().mockResolvedValue(SERVER_DETAIL),
      getMcpStatus,
    });
    renderFlow(LISTING, { client });
    await install(user);
    expect(
      await screen.findByRole('status', { name: 'Waiting for the workers to load Acme Mail…' }),
    ).toBeInTheDocument();
    expect(client.listMcpAdvertisedTools).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    await waitFor(async () => {
      expect(await currentStep()).toContain('Pick tools');
    });
    await waitFor(() => {
      expect(client.listMcpAdvertisedTools).toHaveBeenCalledWith('acme_mail', expect.anything());
    });
  });

  it('gives up at once when the reload converged and a check still misses the provider', async () => {
    const user = userEvent.setup();
    renderFlow(LISTING, {
      client: listingClient({
        installMarketplacePlugin: vi.fn().mockResolvedValue(installReceipt()),
      }),
    });
    await install(user);
    expect(await screen.findByText(MISSING_PROVIDER)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('gives up after the settle timeout when the reload did not converge', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    renderFlow(LISTING, { client: listingClient({}) });
    await install(user);
    expect(
      await screen.findByRole('status', { name: 'Waiting for the workers to load Acme Mail…' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(MISSING_PROVIDER)).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INSTALL_SETTLE_TIMEOUT_MS);
    });
    expect(await screen.findByText(MISSING_PROVIDER)).toBeInTheDocument();
  });

  it('stops checking for the provider once it gave up', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const listProviders = vi.fn().mockResolvedValue({ providers: [] });
    renderFlow(LISTING, { client: listingClient({ listProviders }) });
    await install(user);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INSTALL_SETTLE_TIMEOUT_MS);
    });
    expect(await screen.findByText(MISSING_PROVIDER)).toBeInTheDocument();
    const checks = listProviders.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(listProviders).toHaveBeenCalledTimes(checks);
  });

  it('stops checking the status read once it gave up', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) });
    const getMcpStatus = vi.fn().mockResolvedValue({ bound: {}, failed: [] });
    renderFlow(LISTING, {
      client: listingClient({
        getMarketplacePlugin: vi.fn().mockResolvedValue(SERVER_DETAIL),
        installMarketplacePlugin: vi.fn().mockResolvedValue(installReceipt()),
        getMcpStatus,
      }),
    });
    await install(user);
    expect(await screen.findByText(MISSING_PROVIDER)).toBeInTheDocument();
    const checks = getMcpStatus.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(getMcpStatus).toHaveBeenCalledTimes(checks);
  });

  it('starts the wait again on Check again after it gave up', async () => {
    const user = userEvent.setup();
    const listProviders = vi.fn().mockResolvedValue({ providers: [] });
    renderFlow(LISTING, {
      client: listingClient({
        installMarketplacePlugin: vi.fn().mockResolvedValue(installReceipt()),
        listProviders,
      }),
    });
    await install(user);
    expect(await screen.findByText(MISSING_PROVIDER)).toBeInTheDocument();
    listProviders.mockResolvedValue({ providers: [ACME_MAIL] });
    await user.click(screen.getByRole('button', { name: 'Check again' }));
    expect(await screen.findByRole('button', { name: 'Connect' })).toBeInTheDocument();
    expect(screen.queryByText(MISSING_PROVIDER)).toBeNull();
  });

  it('keeps the install form when the install fails', async () => {
    const user = userEvent.setup();
    const installMarketplacePlugin = vi.fn().mockRejectedValue(new Error('index unreachable'));
    renderFlow(LISTING, { client: listingClient({ installMarketplacePlugin }) });
    await install(user);
    expect(await screen.findByText(/index unreachable/)).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Install plugin' })).toBeInTheDocument();
    expect(screen.queryByRole('status', { name: /Waiting for the workers/ })).toBeNull();
  });

  it('shows a failed detail read with Retry, which reads it again', async () => {
    const user = userEvent.setup();
    const getMarketplacePlugin = vi
      .fn()
      .mockRejectedValueOnce(new Error('registry down'))
      .mockResolvedValue(CONNECTOR_DETAIL);
    renderFlow(LISTING, { client: listingClient({ getMarketplacePlugin }) });
    expect(await screen.findByText(/registry down/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('form', { name: 'Install plugin' })).toBeInTheDocument();
    expect(getMarketplacePlugin).toHaveBeenCalledTimes(2);
  });
});
