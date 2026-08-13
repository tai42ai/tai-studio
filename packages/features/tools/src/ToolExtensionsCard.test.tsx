/**
 * Behavioural tests for the tool-extensions card: it renders a manifest tool's
 * current combos, seeds the shared combo builder in a dialog, saves the FULL
 * combo list (and `[]` behind a clear confirm), surfaces server 400/409 messages
 * VERBATIM, invalidates the three affected caches on success, and swaps the editor
 * for a presets-page hint when the selected tool is a preset.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type Extension, type PresetRecord } from '@tai42/api-client';

import { ToolExtensionsCard } from './ToolExtensionsCard';
import { renderWithProviders, type StubApiClient } from './test-utils';

const available: Extension[] = [
  { name: 'marka', kind: 'wrapper' },
  { name: 'markb', kind: 'wrapper' },
  { name: 'chain', kind: 'transformer' },
];

function baseClient(overrides: StubApiClient = {}): StubApiClient {
  return {
    getToolExtensions: vi.fn().mockResolvedValue({ combos: [['marka'], ['markb']], available }),
    listPresets: vi.fn().mockResolvedValue([]),
    setToolExtensions: vi.fn().mockResolvedValue({
      status: 'ok',
      env_keys: 0,
      fanout: { mode: 'local-only', note: 'no worker bus configured; only this worker reloaded' },
    }),
    ...overrides,
  };
}

describe('ToolExtensionsCard', () => {
  it('renders the current combos as badge rows', async () => {
    renderWithProviders(<ToolExtensionsCard tool="shout" />, { client: baseClient() });

    expect(await screen.findByText('marka')).toBeInTheDocument();
    expect(screen.getByText('markb')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit combos' })).toBeInTheDocument();
  });

  it('seeds the builder with the current combos when the dialog opens', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ToolExtensionsCard tool="shout" />, { client: baseClient() });

    await user.click(await screen.findByRole('button', { name: 'Edit combos' }));
    const dialog = await screen.findByRole('dialog');
    // The builder seeds one removable row per current combo.
    expect(within(dialog).getByRole('button', { name: 'Remove combo marka' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Remove combo markb' })).toBeInTheDocument();
  });

  it('does not flag an unknown extension name while the catalog is still loading', () => {
    // A never-resolving load keeps the card in its skeleton — the builder never
    // mounts pre-resolve, so no unknown-name note can flash.
    renderWithProviders(<ToolExtensionsCard tool="shout" />, {
      client: baseClient({
        getToolExtensions: vi.fn().mockReturnValue(new Promise<never>(() => undefined)),
      }),
    });

    expect(screen.queryByText(/unknown extension/i)).toBeNull();
  });

  it('flags a stale combo (name absent from the resolved catalog) once the editor opens', async () => {
    const user = userEvent.setup();
    // `gone` was authored earlier but its plugin has since been removed.
    renderWithProviders(<ToolExtensionsCard tool="shout" />, {
      client: baseClient({
        getToolExtensions: vi.fn().mockResolvedValue({ combos: [['gone']], available }),
      }),
    });

    await user.click(await screen.findByRole('button', { name: 'Edit combos' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Unknown extension: gone.')).toBeInTheDocument();
  });

  it('saves the full combos array', async () => {
    const user = userEvent.setup();
    const setToolExtensions = vi.fn().mockResolvedValue({ status: 'ok', env_keys: 0 });
    renderWithProviders(<ToolExtensionsCard tool="shout" />, {
      client: baseClient({ setToolExtensions }),
    });

    await user.click(await screen.findByRole('button', { name: 'Edit combos' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(setToolExtensions).toHaveBeenCalledWith('shout', [['marka'], ['markb']]);
    });
  });

  it('round-trips a config-bearing combo element unchanged on save', async () => {
    const user = userEvent.setup();
    const configElement = {
      name: 'output_schema',
      config: { schema: { type: 'object', title: 'Weather' } },
    };
    const setToolExtensions = vi.fn().mockResolvedValue({ status: 'ok', env_keys: 0 });
    renderWithProviders(<ToolExtensionsCard tool="shout" />, {
      client: baseClient({
        getToolExtensions: vi.fn().mockResolvedValue({ combos: [[configElement]], available }),
        setToolExtensions,
      }),
    });

    // The read-only row shows the element NAME; opening the dialog seeds the builder.
    expect(await screen.findByText('output_schema')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit combos' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    // The stored `{ name, config }` element is written back verbatim (config preserved).
    await waitFor(() => {
      expect(setToolExtensions).toHaveBeenCalledWith('shout', [[configElement]]);
    });
  });

  it('clears with an empty array only after the clear confirm', async () => {
    const user = userEvent.setup();
    const setToolExtensions = vi.fn().mockResolvedValue({ status: 'ok', env_keys: 0 });
    renderWithProviders(<ToolExtensionsCard tool="shout" />, {
      client: baseClient({ setToolExtensions }),
    });

    await user.click(await screen.findByRole('button', { name: 'Edit combos' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove combo marka' }));
    await user.click(within(dialog).getByRole('button', { name: 'Remove combo markb' }));

    // First Save asks to confirm the clear; it does NOT post yet.
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(setToolExtensions).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/drops all of shout/i);

    // Confirming posts the empty list.
    await user.click(within(dialog).getByRole('button', { name: 'Confirm clear' }));
    await waitFor(() => {
      expect(setToolExtensions).toHaveBeenCalledWith('shout', []);
    });
  });

  it('renders a 409 consolidation error verbatim in the dialog', async () => {
    const user = userEvent.setup();
    const message =
      "tool 'shout' extensions are also mapped by other config(s) (mcp:remote); consolidate the mapping into the providing config first";
    const setToolExtensions = vi.fn().mockRejectedValue(new ApiError(message, 409));
    renderWithProviders(<ToolExtensionsCard tool="shout" />, {
      client: baseClient({ setToolExtensions }),
    });

    await user.click(await screen.findByRole('button', { name: 'Edit combos' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText(message)).toBeInTheDocument();
  });

  it('renders a 400 unknown-extension error verbatim in the dialog', async () => {
    const user = userEvent.setup();
    const message = "unknown extension 'nope'";
    const setToolExtensions = vi.fn().mockRejectedValue(new ApiError(message, 400));
    renderWithProviders(<ToolExtensionsCard tool="shout" />, {
      client: baseClient({ setToolExtensions }),
    });

    await user.click(await screen.findByRole('button', { name: 'Edit combos' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    expect(await within(dialog).findByText(message)).toBeInTheDocument();
  });

  it('invalidates the three affected caches on a successful save', async () => {
    const user = userEvent.setup();
    const { queryClient } = renderWithProviders(<ToolExtensionsCard tool="shout" />, {
      client: baseClient(),
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await user.click(await screen.findByRole('button', { name: 'Edit combos' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tools', 'extensions', 'shout'] });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['extensions'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['tools'] });
  });

  it('renders the honest per-worker report from the apply result when the fleet does not converge', async () => {
    const user = userEvent.setup();
    // The save landed but a sibling failed to reload — the shared fleet-report handler
    // must surface it loudly, never fake a clean success.
    const setToolExtensions = vi.fn().mockResolvedValue({
      status: 'ok',
      env_keys: 1,
      fanout: {
        mode: 'fleet',
        op: 'reload_config',
        reachable: true,
        local_only: false,
        results: [
          { name: 'serve-a', outcome: 'applied', payload: null, error: null, detail: null },
          {
            name: 'serve-b',
            outcome: 'failed',
            payload: null,
            error: 'reload raised',
            detail: null,
          },
        ],
        error: null,
      },
    });
    renderWithProviders(<ToolExtensionsCard tool="shout" />, {
      client: baseClient({ setToolExtensions }),
    });

    await user.click(await screen.findByRole('button', { name: 'Edit combos' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    // The success line still shows, alongside the loud fleet-failure report.
    expect(await screen.findByText('Extensions applied.')).toBeInTheDocument();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(/did not converge/)).toBeInTheDocument();
    expect(within(alert).getByText('serve-b')).toBeInTheDocument();
  });

  it('shows the presets-page hint instead of the editor for a preset tool', async () => {
    const presets: PresetRecord[] = [
      {
        name: 'shout',
        base_tool: 'echo',
        description: '',
        active_version: 1,
        extensions: [],
        output_schema: null,
        conflicted: false,
        conflicted_reason: null,
        uses: [],
        used_by: [],
      },
    ];
    renderWithProviders(<ToolExtensionsCard tool="shout" />, {
      client: baseClient({ listPresets: vi.fn().mockResolvedValue(presets) }),
    });

    expect(await screen.findByText(/manage shout on the presets page/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit combos' })).not.toBeInTheDocument();
    const link = screen.getByRole('link', { name: /manage shout on the presets page/i });
    expect(link).toBeInTheDocument();
    // WCAG 2.5.3 (Label in Name): a voice-control user says what they can read, so
    // no control here may carry an `aria-label` that omits its own visible text.
    const mismatched = [...document.querySelectorAll<HTMLElement>('[aria-label]')].filter(
      (node) => {
        const visible = node.textContent.trim().toLowerCase();
        return (
          visible !== '' && !(node.getAttribute('aria-label') ?? '').toLowerCase().includes(visible)
        );
      },
    );
    expect(mismatched.map((node) => node.getAttribute('aria-label'))).toEqual([]);
  });

  it('shows a loud error state when the extensions load fails (a listed tool 404 is real)', async () => {
    renderWithProviders(<ToolExtensionsCard tool="shout" />, {
      client: baseClient({
        getToolExtensions: vi
          .fn()
          .mockRejectedValue(new ApiError("tool 'shout' is not a registered tool", 404)),
      }),
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('is not a registered tool');
  });

  it('states a failed presets read while still falling through to the manifest editor', async () => {
    // A scoped tools-caller reaching /api/tools but not /api/presets gets a 403 on the
    // presets read; that read only tags preset tools, so the card keeps the manifest
    // editor working rather than walling. It does NOT pass silently: with no preset
    // info a preset tool is indistinguishable from a manifest tool, so the card would
    // otherwise offer an editor whose save the manifest route rejects.
    const listPresets = vi.fn().mockRejectedValue(new ApiError('forbidden', 403));
    renderWithProviders(<ToolExtensionsCard tool="shout" />, {
      client: baseClient({ listPresets }),
    });

    // The editor path renders — current combos plus the Edit button — and no hint.
    expect(await screen.findByRole('button', { name: 'Edit combos' })).toBeInTheDocument();
    expect(screen.getByText('marka')).toBeInTheDocument();
    expect(screen.queryByText(/manage shout on the presets page/i)).not.toBeInTheDocument();

    // …under a LOUD notice carrying the server's own message verbatim, with a retry.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Preset tools cannot be identified');
    expect(alert).toHaveTextContent('forbidden');
    listPresets.mockResolvedValueOnce([]);
    await userEvent.click(within(alert).getByRole('button', { name: /retry/i }));
    await waitFor(() => {
      expect(listPresets).toHaveBeenCalledTimes(2);
    });
  });

  it('renders the flat apply-result success line after a single-process save', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ToolExtensionsCard tool="shout" />, { client: baseClient() });

    await user.click(await screen.findByRole('button', { name: 'Edit combos' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    // A converged (lone-worker local-only) save shows the plain success line and no
    // loud fleet-failure report.
    expect(await screen.findByText('Extensions applied.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the editor (not the hint) for a CONFLICTED preset row — it is authored via the manifest path', async () => {
    const presets: PresetRecord[] = [
      {
        name: 'shout',
        base_tool: 'echo',
        description: '',
        active_version: 1,
        extensions: [],
        output_schema: null,
        conflicted: true,
        conflicted_reason: 'name collided with an existing tool at startup',
        uses: [],
        used_by: [],
      },
    ];
    renderWithProviders(<ToolExtensionsCard tool="shout" />, {
      client: baseClient({ listPresets: vi.fn().mockResolvedValue(presets) }),
    });

    // A conflicted (quarantined) preset name is a foreign live tool authored through the
    // manifest route, so the card must NOT show the presets hint — it shows the editor.
    expect(await screen.findByRole('button', { name: 'Edit combos' })).toBeInTheDocument();
    expect(screen.queryByText(/manage shout on the presets page/i)).not.toBeInTheDocument();
  });

  it('clears a pending clear-confirm when a combo is added back in the builder', async () => {
    const user = userEvent.setup();
    const setToolExtensions = vi.fn().mockResolvedValue({ status: 'ok', env_keys: 0 });
    renderWithProviders(<ToolExtensionsCard tool="shout" />, {
      client: baseClient({ setToolExtensions }),
    });

    await user.click(await screen.findByRole('button', { name: 'Edit combos' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Remove combo marka' }));
    await user.click(within(dialog).getByRole('button', { name: 'Remove combo markb' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    // The clear-confirm is pending.
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/drops all of shout/i);

    // Compose and add a combo back → the confirm resets, the button reverts to Save, and
    // nothing is posted (the empty-clear is no longer what would be saved).
    await user.click(within(dialog).getByRole('checkbox', { name: 'chain' }));
    await user.click(within(dialog).getByRole('button', { name: 'Add combo' }));

    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(setToolExtensions).not.toHaveBeenCalled();
  });
});
