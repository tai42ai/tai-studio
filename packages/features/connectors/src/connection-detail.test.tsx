/**
 * Tests for the CONNECTION DETAIL view: sub-service save, reconnect (re-entering
 * the popup flow), and the confirm-gated disconnect that navigates back.
 */
import { ApiError } from '@tai42/api-client';
import {
  failureWithRoll,
  reportHeading,
  ROLL_FAILURE_HEADING,
  ROLL_FAILURE_MESSAGE,
} from '@tai42/test-support';
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
  providerCatalog,
  renderWithProviders,
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

function baseClient(overrides = {}) {
  return makeClient({
    getConnection: vi.fn().mockResolvedValue(connection()),
    listProviders: vi.fn().mockResolvedValue(providerCatalog([provider()])),
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
      fanout: null,
      span_release_error: null,
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
      span_release_error: null,
      fanout: {
        mode: 'fleet',
        op: 'reload_config',
        reachable: true,
        local_only: false,
        results: [
          { name: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null },
          {
            name: 'serve-b',
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
      span_release_error: null,
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
      span_release_error: null,
      fanout: {
        mode: 'fleet',
        op: 'reload_config',
        reachable: true,
        local_only: false,
        results: [
          { name: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null },
          {
            name: 'serve-b',
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

  it('hides Reconnect for a no-auth (kind: "none") connection', async () => {
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({
        getConnection: vi.fn().mockResolvedValue(connection({ kind: 'none' })),
      }),
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Disconnect' })).toBeInTheDocument();
    });
    // A no-auth connection has no grant to renew — the action is not offered.
    expect(screen.queryByRole('button', { name: /Reconnect/ })).toBeNull();
  });

  it('surfaces a loud consent-required alert when a save needs consent but returns no URL', async () => {
    const openSpy = vi.spyOn(window, 'open');
    const patchSubServices = vi.fn().mockResolvedValue({
      connection_id: 'conn-1',
      enabled_sub_services: ['repo'],
      consent_required: true,
      flow_id: null,
      authorize_url: null,
      added_manifest_entries: [],
      removed_manifest_entries: [],
      fanout: null,
      span_release_error: null,
    });
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({ patchSubServices }),
    });

    await waitFor(() => {
      expect(screen.getByText('Save sub-services')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save sub-services'));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Consent required')).toBeInTheDocument();
    // No authorize URL means no popup can open — the change is surfaced, not silent.
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('warns that upstream access may still be live on a failed revoke', async () => {
    const disconnect = vi.fn().mockResolvedValue({
      connection_id: 'conn-1',
      upstream_revoke_outcome: 'failed',
      upstream_revoke_status: 401,
      removed_manifest_entries: [],
      span_release_error: null,
      fanout: null,
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

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Upstream access may still be live')).toBeInTheDocument();
    expect(alert).toHaveTextContent('401');
    // A failed revoke keeps the view — it does not navigate away and hide the warning.
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('shows a neutral note (not a warning) on a skipped revoke', async () => {
    const disconnect = vi.fn().mockResolvedValue({
      connection_id: 'conn-1',
      upstream_revoke_outcome: 'skipped',
      upstream_revoke_status: null,
      removed_manifest_entries: [],
      span_release_error: null,
      fanout: null,
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
      expect(screen.getByText(/No upstream revocation applied/)).toBeInTheDocument();
    });
    // A neutral note is not an alert — the disconnect succeeded.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('renders unreachable sub-services with their labels', async () => {
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({
        getConnection: vi
          .fn()
          .mockResolvedValue(connection({ unreachable_sub_services: ['repo'] })),
      }),
    });

    await waitFor(() => {
      expect(screen.getByText('Some sub-services did not respond')).toBeInTheDocument();
    });
    // The id is mapped to the provider's display label inside the unreachable note.
    expect(
      screen.getByText(/did not answer a reachability check: Repositories/),
    ).toBeInTheDocument();
  });

  it('surfaces a named provider-not-configured refusal as a muted note, not a red alert', async () => {
    const reconnect = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          'set GITHUB_OAUTH_CLIENT_SECRET to enable GitHub',
          501,
          'connector-provider-not-configured',
        ),
      );
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({ reconnect }),
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Reconnect/ })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole('button', { name: /Reconnect/ }));

    const note = await screen.findByTestId('connector-provider-off');
    expect(note).toHaveTextContent('GITHUB_OAUTH_CLIENT_SECRET');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('ConnectionDetail — a failed write that carries a recycle roll', () => {
  it('shows the roll beside the error of a failed disconnect, named', async () => {
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({ disconnect: vi.fn().mockRejectedValue(failureWithRoll()) }),
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));

    expect(
      await screen.findByText(reportHeading(`${ROLL_FAILURE_HEADING} — disconnect`)),
    ).toBeInTheDocument();
    expect(screen.getByText(ROLL_FAILURE_MESSAGE)).toBeInTheDocument();
  });

  it('names a failed sub-service save', async () => {
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({ patchSubServices: vi.fn().mockRejectedValue(failureWithRoll()) }),
    });

    fireEvent.click(await screen.findByText('Save sub-services'));

    expect(
      await screen.findByText(reportHeading(`${ROLL_FAILURE_HEADING} — sub-services`)),
    ).toBeInTheDocument();
  });

  it('names a failed reconnect', async () => {
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({ reconnect: vi.fn().mockRejectedValue(failureWithRoll()) }),
    });

    fireEvent.click(await screen.findByRole('button', { name: /Reconnect/ }));

    expect(
      await screen.findByText(reportHeading(`${ROLL_FAILURE_HEADING} — reconnect`)),
    ).toBeInTheDocument();
  });
});

describe('ConnectionDetail — the reports of several writes', () => {
  /** One worker left awaiting a restart, on a reply that ran no fleet broadcast. */
  const leftAwaiting = {
    fanout: null,
    span_release_error: null,
    awaiting_respawn: [{ name: 'serve-b', keys: ['K'] }],
  };
  const AWAITING_HEADING = '1 worker has settings it has not applied';

  it('names the sub-service save and the consent it re-enters, whose reports show together', async () => {
    const popup = makeFakePopup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({
        patchSubServices: vi.fn().mockResolvedValue({
          connection_id: 'conn-1',
          enabled_sub_services: ['repo'],
          consent_required: false,
          flow_id: null,
          authorize_url: 'https://provider/reauth',
          added_manifest_entries: [],
          removed_manifest_entries: [],
          ...leftAwaiting,
        }),
        completeOAuth: vi.fn().mockResolvedValue({
          kind: 'success',
          connection_id: 'conn-1',
          return_url: '/x',
          span_release_error: null,
          awaiting_respawn: [{ name: 'serve-c', keys: ['K'] }],
          fanout: {
            mode: 'fleet',
            op: 'reload_config',
            reachable: true,
            local_only: false,
            results: [
              {
                name: 'serve-b',
                outcome: 'timed_out',
                payload: null,
                error: null,
                detail: 'no ack within the window',
              },
            ],
            error: null,
          },
        }),
      }),
    });

    fireEvent.click(await screen.findByText('Save sub-services'));
    await screen.findByText(reportHeading(`${AWAITING_HEADING} — sub-services`));
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalled();
    });
    postMessageFrom(popup, goodMessage);

    expect(
      await screen.findByText(reportHeading(`${AWAITING_HEADING} — OAuth consent`)),
    ).toBeVisible();
    expect(screen.getByText(reportHeading(`${AWAITING_HEADING} — sub-services`))).toBeVisible();
  });

  it('names the roll of an OAuth completion that failed', async () => {
    const popup = makeFakePopup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({
        reconnect: vi
          .fn()
          .mockResolvedValue({ flow_id: 'f9', authorize_url: 'https://provider/reauth' }),
        completeOAuth: vi.fn().mockRejectedValue(failureWithRoll()),
      }),
    });

    fireEvent.click(await screen.findByRole('button', { name: /Reconnect/ }));
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalled();
    });
    postMessageFrom(popup, goodMessage);

    expect(
      await screen.findByText(reportHeading(`${ROLL_FAILURE_HEADING} — OAuth consent`)),
    ).toBeVisible();
  });

  it('names the report a disconnect leaves on the view', async () => {
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({
        disconnect: vi.fn().mockResolvedValue({
          connection_id: 'conn-1',
          upstream_revoke_outcome: 'skipped',
          upstream_revoke_status: null,
          removed_manifest_entries: [],
          ...leftAwaiting,
        }),
      }),
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));

    expect(
      await screen.findByText(reportHeading(`${AWAITING_HEADING} — disconnect`)),
    ).toBeVisible();
  });

  const savedLeavingAwaiting = {
    connection_id: 'conn-1',
    enabled_sub_services: ['repo'],
    consent_required: false,
    flow_id: null,
    authorize_url: null,
    added_manifest_entries: [],
    removed_manifest_entries: [],
    ...leftAwaiting,
  };
  const clickSave = async (): Promise<void> => {
    fireEvent.click(await screen.findByText('Save sub-services'));
  };
  const clickReconnect = async (): Promise<void> => {
    fireEvent.click(await screen.findByRole('button', { name: /Reconnect/ }));
  };

  it('shows a later failed write in place of the earlier failure', async () => {
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({
        patchSubServices: vi.fn().mockRejectedValue(new Error('the save was rejected')),
        reconnect: vi.fn().mockRejectedValue(failureWithRoll()),
      }),
    });

    await clickSave();
    await screen.findByText('the save was rejected');
    await clickReconnect();

    expect(
      await screen.findByText(reportHeading(`${ROLL_FAILURE_HEADING} — reconnect`)),
    ).toBeVisible();
    expect(screen.getByText(ROLL_FAILURE_MESSAGE)).toBeVisible();
    expect(screen.queryByText('the save was rejected')).toBeNull();
  });

  it('shows a later failed write in place of an earlier refusal', async () => {
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({
        patchSubServices: vi
          .fn()
          .mockRejectedValue(
            new ApiError(
              'set the client secret to enable this',
              501,
              'connector-provider-not-configured',
            ),
          ),
        reconnect: vi.fn().mockRejectedValue(failureWithRoll()),
      }),
    });

    await clickSave();
    await screen.findByTestId('connector-provider-off');
    await clickReconnect();

    expect(
      await screen.findByText(reportHeading(`${ROLL_FAILURE_HEADING} — reconnect`)),
    ).toBeVisible();
    expect(screen.queryByTestId('connector-provider-off')).toBeNull();
  });

  it('shows a later refusal in place of an earlier failure', async () => {
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({
        patchSubServices: vi.fn().mockRejectedValue(new Error('the save was rejected')),
        reconnect: vi
          .fn()
          .mockRejectedValue(
            new ApiError(
              'set the client secret to enable this',
              501,
              'connector-provider-not-configured',
            ),
          ),
      }),
    });

    await clickSave();
    await screen.findByText('the save was rejected');
    await clickReconnect();

    expect(await screen.findByTestId('connector-provider-off')).toBeVisible();
    expect(screen.queryByText('the save was rejected')).toBeNull();
  });

  it('leaves no failure of an earlier write beside a newer success', async () => {
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({
        reconnect: vi.fn().mockRejectedValue(failureWithRoll()),
        patchSubServices: vi.fn().mockResolvedValue(savedLeavingAwaiting),
      }),
    });

    await clickReconnect();
    await screen.findByText(reportHeading(`${ROLL_FAILURE_HEADING} — reconnect`));
    await clickSave();

    expect(
      await screen.findByText(reportHeading(`${AWAITING_HEADING} — sub-services`)),
    ).toBeVisible();
    expect(screen.queryByText(reportHeading(`${ROLL_FAILURE_HEADING} — reconnect`))).toBeNull();
    expect(screen.queryByText(ROLL_FAILURE_MESSAGE)).toBeNull();
  });

  it('leaves no report of an earlier write beside a later failure', async () => {
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({
        patchSubServices: vi.fn().mockResolvedValue(savedLeavingAwaiting),
        reconnect: vi.fn().mockRejectedValue(failureWithRoll()),
      }),
    });

    await clickSave();
    await screen.findByText(reportHeading(`${AWAITING_HEADING} — sub-services`));
    await clickReconnect();

    expect(
      await screen.findByText(reportHeading(`${ROLL_FAILURE_HEADING} — reconnect`)),
    ).toBeVisible();
    expect(screen.queryByText(reportHeading(`${AWAITING_HEADING} — sub-services`))).toBeNull();
  });

  const confirmDisconnect = async (): Promise<void> => {
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));
  };

  it('shows a failed disconnect in place of an earlier failed reconnect', async () => {
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({
        reconnect: vi.fn().mockRejectedValue(failureWithRoll()),
        disconnect: vi.fn().mockRejectedValue(failureWithRoll()),
      }),
    });

    await clickReconnect();
    await screen.findByText(reportHeading(`${ROLL_FAILURE_HEADING} — reconnect`));
    await confirmDisconnect();

    expect(
      await screen.findByText(reportHeading(`${ROLL_FAILURE_HEADING} — disconnect`)),
    ).toBeVisible();
    expect(screen.queryByText(reportHeading(`${ROLL_FAILURE_HEADING} — reconnect`))).toBeNull();
  });

  it('leaves no failed disconnect beside a newer save', async () => {
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({
        disconnect: vi.fn().mockRejectedValue(failureWithRoll()),
        patchSubServices: vi.fn().mockResolvedValue(savedLeavingAwaiting),
      }),
    });

    await confirmDisconnect();
    await screen.findByText(reportHeading(`${ROLL_FAILURE_HEADING} — disconnect`));
    await clickSave();

    await screen.findByText(reportHeading(`${AWAITING_HEADING} — sub-services`));
    expect(screen.queryByText(reportHeading(`${ROLL_FAILURE_HEADING} — disconnect`))).toBeNull();
  });

  it('leaves no consent notice beside a later write', async () => {
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({
        patchSubServices: vi.fn().mockResolvedValue({
          ...savedLeavingAwaiting,
          consent_required: true,
        }),
        reconnect: vi.fn().mockRejectedValue(failureWithRoll()),
      }),
    });

    await clickSave();
    await screen.findByText('Consent required');
    await clickReconnect();

    await screen.findByText(reportHeading(`${ROLL_FAILURE_HEADING} — reconnect`));
    expect(screen.queryByText('Consent required')).toBeNull();
  });

  it('leaves no report of a landed OAuth completion beside a later write', async () => {
    const popup = makeFakePopup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({
        reconnect: vi
          .fn()
          .mockResolvedValue({ flow_id: 'f9', authorize_url: 'https://provider/reauth' }),
        completeOAuth: vi.fn().mockResolvedValue({
          kind: 'success',
          connection_id: 'conn-1',
          return_url: '/x',
          fanout: null,
          span_release_error: 'the store held the span',
        }),
        patchSubServices: vi.fn().mockResolvedValue(savedLeavingAwaiting),
      }),
    });

    await clickReconnect();
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalled();
    });
    postMessageFrom(popup, goodMessage);
    const completionReport = reportHeading(
      'The config store did not release its write lock — OAuth consent',
    );
    await screen.findByText(completionReport);
    await clickSave();

    await screen.findByText(reportHeading(`${AWAITING_HEADING} — sub-services`));
    expect(screen.queryByText(completionReport)).toBeNull();
  });

  it('leaves no disconnect report beside a newer save', async () => {
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({
        disconnect: vi.fn().mockResolvedValue({
          connection_id: 'conn-1',
          upstream_revoke_outcome: 'skipped',
          upstream_revoke_status: null,
          removed_manifest_entries: [],
          ...leftAwaiting,
        }),
        patchSubServices: vi.fn().mockResolvedValue(savedLeavingAwaiting),
      }),
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Disconnect' }));
    await screen.findByText(reportHeading(`${AWAITING_HEADING} — disconnect`));
    await clickSave();

    await screen.findByText(reportHeading(`${AWAITING_HEADING} — sub-services`));
    expect(screen.queryByText(reportHeading(`${AWAITING_HEADING} — disconnect`))).toBeNull();
  });

  it('leaves no OAuth completion report beside a newer save', async () => {
    const popup = makeFakePopup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);
    renderWithProviders(<ConnectionDetail connectionId="conn-1" />, {
      client: baseClient({
        reconnect: vi
          .fn()
          .mockResolvedValue({ flow_id: 'f9', authorize_url: 'https://provider/reauth' }),
        completeOAuth: vi.fn().mockRejectedValue(failureWithRoll()),
        patchSubServices: vi.fn().mockResolvedValue(savedLeavingAwaiting),
      }),
    });

    await clickReconnect();
    await waitFor(() => {
      expect(openSpy).toHaveBeenCalled();
    });
    postMessageFrom(popup, goodMessage);
    await screen.findByText(reportHeading(`${ROLL_FAILURE_HEADING} — OAuth consent`));
    await clickSave();

    await screen.findByText(reportHeading(`${AWAITING_HEADING} — sub-services`));
    expect(screen.queryByText(reportHeading(`${ROLL_FAILURE_HEADING} — OAuth consent`))).toBeNull();
  });
});
