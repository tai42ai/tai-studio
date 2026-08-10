/**
 * Tests for the Entry gate section: the CLASSIFICATION that shows it only for a
 * web-channel route carrying an identity, and the panel's state machine —
 * loading, the loud gate-read failure, the codes table (with the "Never" expiry),
 * the empty note, the toggle (immediate vs the zero-code confirm), the mint entry
 * point, and the revoke confirm. The api client is stubbed; the gate is reached
 * through the shared route catalogue, exactly as the running screen reaches it.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiError } from '@tai42/api-client';

import { EntryGate } from './EntryGate';
import { conversationRoutesKey } from './keys';
import { makeRoute, renderWithProviders, type StubApiClient } from './test-utils';

function webRoute(overrides = {}) {
  return makeRoute({
    route_name: 'web-chat',
    door: 'channel',
    channel: 'web',
    our_identity: 'web-ident',
    ...overrides,
  });
}

function makeCode(overrides = {}) {
  return {
    code_id: 'c1',
    label: 'newsletter',
    created_at: '2026-08-01T09:00:00Z',
    expires_at: null as string | null,
    ...overrides,
  };
}

/** A client whose route catalogue lists the given routes; gate methods overlaid. */
function clientWith(routes: unknown[], overrides: StubApiClient = {}): StubApiClient {
  return {
    baseUrl: '',
    listConversationRoutes: vi.fn().mockResolvedValue({ items: routes, total: routes.length }),
    ...overrides,
  };
}

function renderGate(client: StubApiClient, route = 'web-chat') {
  return renderWithProviders(<EntryGate route={route} />, { client });
}

describe('EntryGate — classification', () => {
  const nonWebCases: { name: string; route: ReturnType<typeof makeRoute> }[] = [
    { name: 'an api-door route', route: makeRoute({ route_name: 'web-chat', door: 'api' }) },
    {
      name: 'a non-web channel route',
      route: webRoute({ channel: 'whatsapp' }),
    },
    {
      name: 'a web route with no identity',
      route: webRoute({ our_identity: null }),
    },
  ];

  for (const { name, route } of nonWebCases) {
    it(`shows nothing for ${name}`, async () => {
      const getWebEntryGate = vi.fn();
      const { queryClient } = renderGate(clientWith([route], { getWebEntryGate }));
      await waitFor(() => {
        expect(queryClient.getQueryData(conversationRoutesKey)).toBeDefined();
      });
      expect(screen.queryByRole('heading', { name: 'Entry gate' })).not.toBeInTheDocument();
      expect(getWebEntryGate).not.toHaveBeenCalled();
    });
  }

  it('shows nothing when the drilled route is absent from the catalogue', async () => {
    const getWebEntryGate = vi.fn();
    const { queryClient } = renderGate(
      clientWith([webRoute({ route_name: 'other' })], { getWebEntryGate }),
    );
    await waitFor(() => {
      expect(queryClient.getQueryData(conversationRoutesKey)).toBeDefined();
    });
    expect(screen.queryByRole('heading', { name: 'Entry gate' })).not.toBeInTheDocument();
    expect(getWebEntryGate).not.toHaveBeenCalled();
  });

  it('mounts the panel for a web route, keyed by its identity', async () => {
    const getWebEntryGate = vi.fn().mockResolvedValue({ enabled: false, codes: [] });
    renderGate(clientWith([webRoute()], { getWebEntryGate }));
    expect(await screen.findByRole('heading', { name: 'Entry gate' })).toBeInTheDocument();
    await waitFor(() => {
      expect(getWebEntryGate).toHaveBeenCalledWith('web-ident', expect.anything());
    });
  });

  it('renders nothing while the catalogue read is still pending', async () => {
    const getWebEntryGate = vi.fn();
    const client: StubApiClient = {
      baseUrl: '',
      listConversationRoutes: vi.fn().mockReturnValue(new Promise(() => undefined)),
      getWebEntryGate,
    };
    renderGate(client);

    // A pending classification shows nothing new — no panel, no error.
    expect(screen.queryByRole('heading', { name: 'Entry gate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(getWebEntryGate).not.toHaveBeenCalled();
  });
});

describe('EntryGate — catalogue read failure', () => {
  it('surfaces the classifying read failure loudly with a retry, rather than nothing', async () => {
    const user = userEvent.setup();
    const getWebEntryGate = vi.fn().mockResolvedValue({ enabled: false, codes: [] });
    const listConversationRoutes = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('catalogue read boom', 500))
      .mockResolvedValue({ items: [webRoute()], total: 1 });
    renderGate({ baseUrl: '', listConversationRoutes, getWebEntryGate });

    // The failure is shown, not swallowed into an empty section.
    expect(await screen.findByRole('alert')).toHaveTextContent('catalogue read boom');
    expect(getWebEntryGate).not.toHaveBeenCalled();

    // Retry refetches the catalogue; the resolved web route then mounts the panel.
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Entry gate' })).toBeInTheDocument();
  });
});

describe('EntryGate — panel states', () => {
  it('shows a skeleton while the gate loads', async () => {
    const getWebEntryGate = vi.fn().mockReturnValue(new Promise(() => undefined));
    renderGate(clientWith([webRoute()], { getWebEntryGate }));
    await screen.findByRole('heading', { name: 'Entry gate' });
    expect(document.querySelector('.tai-skeleton')).not.toBeNull();
  });

  it('raises a gate-read failure loudly and retries', async () => {
    const user = userEvent.setup();
    const getWebEntryGate = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('gate read boom', 500))
      .mockResolvedValue({ enabled: false, codes: [] });
    renderGate(clientWith([webRoute()], { getWebEntryGate }));

    expect(await screen.findByRole('alert')).toHaveTextContent('gate read boom');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No entry codes')).toBeInTheDocument();
  });

  it('explains an empty code list rather than an empty table', async () => {
    const getWebEntryGate = vi.fn().mockResolvedValue({ enabled: false, codes: [] });
    renderGate(clientWith([webRoute()], { getWebEntryGate }));
    expect(await screen.findByText('No entry codes')).toBeInTheDocument();
  });

  it('renders a code row: label, created, and a "Never" expiry', async () => {
    const getWebEntryGate = vi.fn().mockResolvedValue({
      enabled: true,
      codes: [makeCode()],
    });
    renderGate(clientWith([webRoute()], { getWebEntryGate }));

    const row = (await screen.findByText('newsletter')).closest('tr');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('Never')).toBeInTheDocument();
    expect(
      within(row as HTMLElement).getByText(new Date('2026-08-01T09:00:00Z').toLocaleString()),
    ).toBeInTheDocument();
  });

  it('renders a placeholder label and a formatted expiry for a labelless, timed code', async () => {
    const getWebEntryGate = vi.fn().mockResolvedValue({
      enabled: true,
      codes: [makeCode({ label: null, expires_at: '2099-09-01T09:00:00Z' })],
    });
    renderGate(clientWith([webRoute()], { getWebEntryGate }));

    expect(
      await screen.findByText(new Date('2099-09-01T09:00:00Z').toLocaleString()),
    ).toBeInTheDocument();
    // The labelless code's revoke names it by its code id.
    expect(screen.getByRole('button', { name: 'Revoke entry code c1' })).toBeInTheDocument();
  });
});

describe('EntryGate — toggle', () => {
  it('flips the gate ON immediately when a live code already exists', async () => {
    const user = userEvent.setup();
    const setWebEntryGate = vi.fn().mockResolvedValue({ enabled: true });
    const getWebEntryGate = vi.fn().mockResolvedValue({ enabled: false, codes: [makeCode()] });
    renderGate(clientWith([webRoute()], { getWebEntryGate, setWebEntryGate }));

    await user.click(await screen.findByRole('checkbox', { name: 'Require an entry code' }));
    await waitFor(() => {
      expect(setWebEntryGate).toHaveBeenCalledWith('web-ident', true);
    });
  });

  it('flips the gate OFF immediately', async () => {
    const user = userEvent.setup();
    const setWebEntryGate = vi.fn().mockResolvedValue({ enabled: false });
    const getWebEntryGate = vi.fn().mockResolvedValue({ enabled: true, codes: [makeCode()] });
    renderGate(clientWith([webRoute()], { getWebEntryGate, setWebEntryGate }));

    await user.click(await screen.findByRole('checkbox', { name: 'Require an entry code' }));
    await waitFor(() => {
      expect(setWebEntryGate).toHaveBeenCalledWith('web-ident', false);
    });
  });

  it('CONFIRMS turning ON while zero codes exist, then flips on confirm', async () => {
    const user = userEvent.setup();
    const setWebEntryGate = vi.fn().mockResolvedValue({ enabled: true });
    const getWebEntryGate = vi.fn().mockResolvedValue({ enabled: false, codes: [] });
    renderGate(clientWith([webRoute()], { getWebEntryGate, setWebEntryGate }));

    await screen.findByText('No entry codes');
    await user.click(screen.getByRole('checkbox', { name: 'Require an entry code' }));

    // The flip is deferred behind a confirm; nothing is written yet.
    expect(await screen.findByText(/nobody can enter/)).toBeInTheDocument();
    expect(setWebEntryGate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Turn on anyway' }));
    await waitFor(() => {
      expect(setWebEntryGate).toHaveBeenCalledWith('web-ident', true);
    });
  });

  it('cancels the zero-code confirm without flipping', async () => {
    const user = userEvent.setup();
    const setWebEntryGate = vi.fn();
    const getWebEntryGate = vi.fn().mockResolvedValue({ enabled: false, codes: [] });
    renderGate(clientWith([webRoute()], { getWebEntryGate, setWebEntryGate }));

    await screen.findByText('No entry codes');
    await user.click(screen.getByRole('checkbox', { name: 'Require an entry code' }));
    await screen.findByText(/nobody can enter/);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByText(/nobody can enter/)).not.toBeInTheDocument());
    expect(setWebEntryGate).not.toHaveBeenCalled();
  });

  it('surfaces a toggle failure loudly in the panel', async () => {
    const user = userEvent.setup();
    const setWebEntryGate = vi.fn().mockRejectedValue(new ApiError('flip denied', 403));
    const getWebEntryGate = vi.fn().mockResolvedValue({ enabled: false, codes: [makeCode()] });
    renderGate(clientWith([webRoute()], { getWebEntryGate, setWebEntryGate }));

    await user.click(await screen.findByRole('checkbox', { name: 'Require an entry code' }));
    expect(await screen.findByText('flip denied')).toBeInTheDocument();
  });
});

describe('EntryGate — mint + revoke', () => {
  it('opens the mint dialog from the section header', async () => {
    const user = userEvent.setup();
    const getWebEntryGate = vi.fn().mockResolvedValue({ enabled: false, codes: [] });
    renderGate(clientWith([webRoute()], { getWebEntryGate }));

    await screen.findByRole('heading', { name: 'Entry gate' });
    await user.click(screen.getByRole('button', { name: 'Mint entry code' }));
    expect(await screen.findByRole('button', { name: 'Mint code' })).toBeInTheDocument();
    expect(screen.getByLabelText('Label')).toBeInTheDocument();

    // Closing the dialog dismisses it from the section.
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Mint code' })).not.toBeInTheDocument(),
    );
  });

  it('revokes a code by its id through the confirm dialog', async () => {
    const user = userEvent.setup();
    const revokeWebEntryCode = vi.fn().mockResolvedValue({ status: 'revoked' });
    const getWebEntryGate = vi.fn().mockResolvedValue({ enabled: true, codes: [makeCode()] });
    renderGate(clientWith([webRoute()], { getWebEntryGate, revokeWebEntryCode }));

    await user.click(await screen.findByRole('button', { name: 'Revoke entry code newsletter' }));
    await user.click(await screen.findByRole('button', { name: 'Revoke code' }));
    await waitFor(() => {
      expect(revokeWebEntryCode).toHaveBeenCalledWith('web-ident', 'c1');
    });
  });

  it('keeps the code and shows the failure when a revoke is refused', async () => {
    const user = userEvent.setup();
    const revokeWebEntryCode = vi.fn().mockRejectedValue(new ApiError('revoke denied', 403));
    const getWebEntryGate = vi.fn().mockResolvedValue({ enabled: true, codes: [makeCode()] });
    renderGate(clientWith([webRoute()], { getWebEntryGate, revokeWebEntryCode }));

    await user.click(await screen.findByRole('button', { name: 'Revoke entry code newsletter' }));
    await user.click(await screen.findByRole('button', { name: 'Revoke code' }));
    expect(await screen.findByText('revoke denied')).toBeInTheDocument();
  });

  it('cancels a pending revoke without calling the door', async () => {
    const user = userEvent.setup();
    const revokeWebEntryCode = vi.fn();
    const getWebEntryGate = vi.fn().mockResolvedValue({ enabled: true, codes: [makeCode()] });
    renderGate(clientWith([webRoute()], { getWebEntryGate, revokeWebEntryCode }));

    await user.click(await screen.findByRole('button', { name: 'Revoke entry code newsletter' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Revoke code' })).not.toBeInTheDocument(),
    );
    expect(revokeWebEntryCode).not.toHaveBeenCalled();
  });

  it('dismisses the revoke confirm on Escape', async () => {
    const user = userEvent.setup();
    const revokeWebEntryCode = vi.fn();
    const getWebEntryGate = vi.fn().mockResolvedValue({ enabled: true, codes: [makeCode()] });
    renderGate(clientWith([webRoute()], { getWebEntryGate, revokeWebEntryCode }));

    await user.click(await screen.findByRole('button', { name: 'Revoke entry code newsletter' }));
    await screen.findByRole('button', { name: 'Revoke code' });
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Revoke code' })).not.toBeInTheDocument(),
    );
    expect(revokeWebEntryCode).not.toHaveBeenCalled();
  });
});
