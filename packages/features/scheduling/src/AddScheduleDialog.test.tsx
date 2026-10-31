/**
 * Direct behavioural tests for the add-schedule dialog, driven on its own rather
 * than through the page. The dialog renders `open` and talks to exactly two api
 * seams: `listToolTags` (its `schedulable` rows feed the `ToolPicker`) and `addSchedule` (the
 * mutation).
 * These cover: the initial render, a valid crontab submit and a valid interval
 * submit asserting the EXACT skeleton body, the client-side kwargs validation
 * (malformed JSON and non-object payloads), the per-field required-input guards,
 * the in-flight disabled/spinner state, the loud error surface when the mutation
 * rejects, the tools-list error branch, and both close paths (Cancel + Escape).
 */
// These flows are typing-heavy; userEvent runs without its inter-key delay so a
// loaded runner cannot push a keystroke chain past the suite timeout, and no
// timer-scheduled keystroke can outlive its test to leak into the next. No
// assertion depends on typing cadence.
import { type ApiClient, ApiError } from '@tai42/api-client';
import { deferred, StaticToolDisplayNamesProvider } from '@tai42/studio-sdk/testing';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AddScheduleDialog } from './AddScheduleDialog';
import {
  accountSessionProjection,
  gateOffProjection,
  keySessionProjection,
  makeClient,
  renderWithProviders,
  schedulableTags,
} from './test-utils';

/**
 * Open the shared `ToolPicker` (a Radix combobox portalled to body). The trigger is
 * `disabled` until `listToolTags` resolves, so the open is gated on it being ENABLED —
 * the real ready signal — rather than on incidental timer slack, or a synchronous
 * click lands on the still-disabled trigger and nothing opens.
 */
async function openToolPicker(user: UserEvent, dialog: HTMLElement): Promise<void> {
  const combobox = within(dialog).getByRole('combobox', { name: 'Tool' });
  await waitFor(() => {
    expect(combobox).toBeEnabled();
  });
  await user.click(combobox);
}

/** Pick a tool by name via the shared `ToolPicker`. */
async function pickTool(user: UserEvent, dialog: HTMLElement, toolName: string): Promise<void> {
  await openToolPicker(user, dialog);
  await user.click(await screen.findByRole('option', { name: toolName }));
}

// The full dialog submit mounts the radix dialog, the tool picker and the typed
// fields in one pass — correct but heavy, so CI contention alone can exceed the
// default test budget. The ceiling bounds runner slowness, never the assertions.
const SUBMIT_FLOW_TIMEOUT_MS = 15_000;

describe('AddScheduleDialog — render', () => {
  it('renders the dialog open with its fields, defaulting to the crontab spec', async () => {
    const client = makeClient({ listToolTags: vi.fn().mockResolvedValue(schedulableTags()) });
    renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, { client });

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Add schedule')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Name')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Tool kwargs/)).toBeInTheDocument();
    // Crontab is the default mode, so the cron field is shown and the interval hidden.
    expect(within(dialog).getByLabelText('Cron expression')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Interval (seconds)')).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Create schedule' })).toBeEnabled();
  });
});

describe(
  'AddScheduleDialog — valid submit',
  () => {
    it('posts the exact crontab body, then closes on success', async () => {
      const user = userEvent.setup({ delay: null });
      const onClose = vi.fn();
      const addSchedule = vi.fn().mockResolvedValue({});
      const client = makeClient({
        listToolTags: vi.fn().mockResolvedValue(schedulableTags('run_report', 'sync')),
        addSchedule,
      });
      renderWithProviders(<AddScheduleDialog onClose={onClose} />, { client });

      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText('Name'), 'nightly-report');
      await pickTool(user, dialog, 'run_report');

      const kwargs = within(dialog).getByLabelText(/Tool kwargs/);
      await user.clear(kwargs);
      await user.type(kwargs, '{{"limit": 10}');

      await user.type(within(dialog).getByLabelText('Cron expression'), '0 2 * * *');
      await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));

      await waitFor(() => {
        expect(addSchedule).toHaveBeenCalledWith({
          tool_name: 'run_report',
          tool_kwargs: { limit: 10 },
          cadence: {
            kind: 'crontab',
            minute: '0',
            hour: '2',
            day_of_month: '*',
            month_of_year: '*',
            day_of_week: '*',
          },
          schedule_name: 'nightly-report',
        });
      });
      expect(addSchedule).toHaveBeenCalledTimes(1);
      await waitFor(() => {
        expect(onClose).toHaveBeenCalledTimes(1);
      });
    });

    it('carries an optional subject as the top-level door field', async () => {
      const user = userEvent.setup({ delay: null });
      const addSchedule = vi.fn().mockResolvedValue({});
      const client = makeClient({
        listToolTags: vi.fn().mockResolvedValue(schedulableTags('run_report')),
        listConversationRoutes: vi.fn().mockResolvedValue({
          items: [{ target_kind: 'agent', target_name: 'assistant' }],
          total: 1,
        }),
        addSchedule,
      });
      renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, { client });

      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText('Name'), 'nightly-report');
      await pickTool(user, dialog, 'run_report');
      await user.type(within(dialog).getByLabelText('Cron expression'), '0 2 * * *');

      await user.click(within(dialog).getByRole('button', { name: 'Subject (optional)' }));
      await user.click(await within(dialog).findByLabelText('Target'));
      await user.click(await screen.findByRole('option', { name: 'agent · assistant' }));
      await user.type(within(dialog).getByLabelText('Subject kind'), 'person');
      await user.type(within(dialog).getByLabelText('Subject key'), 'a-42');

      await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));
      await waitFor(() => {
        expect(addSchedule).toHaveBeenCalled();
      });
      const body = addSchedule.mock.calls[0]?.[0] as
        { tool_kwargs: Record<string, unknown>; subject?: unknown } | undefined;
      // The subject is the create door's top-level field (the fire's state context), never a
      // tool argument.
      expect(body?.subject).toEqual({
        target_kind: 'agent',
        target_name: 'assistant',
        kind: 'person',
        key: 'a-42',
      });
      expect(body?.tool_kwargs).toEqual({});
    });

    it(
      'posts an interval cadence and empty kwargs for the interval spec',
      async () => {
        const user = userEvent.setup({ delay: null });
        const onClose = vi.fn();
        const addSchedule = vi.fn().mockResolvedValue({});
        const client = makeClient({
          listToolTags: vi.fn().mockResolvedValue(schedulableTags('sync')),
          addSchedule,
        });
        renderWithProviders(<AddScheduleDialog onClose={onClose} />, { client });

        const dialog = await screen.findByRole('dialog');
        await user.type(within(dialog).getByLabelText('Name'), 'hourly-sync');
        await pickTool(user, dialog, 'sync');

        // Switch to the interval spec; the untouched default kwargs `{}` maps to `{}`.
        await user.click(within(dialog).getByRole('radio', { name: 'Interval' }));
        await user.type(within(dialog).getByRole('spinbutton'), '3600');

        await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));

        await waitFor(() => {
          expect(addSchedule).toHaveBeenCalledWith({
            tool_name: 'sync',
            tool_kwargs: {},
            cadence: { kind: 'interval', every: 3600 },
            schedule_name: 'hourly-sync',
          });
        });
        await waitFor(() => {
          expect(onClose).toHaveBeenCalledTimes(1);
        });
      },
      SUBMIT_FLOW_TIMEOUT_MS,
    );
  },
  SUBMIT_FLOW_TIMEOUT_MS,
);

describe('AddScheduleDialog — kwargs validation', () => {
  it('blocks malformed JSON kwargs with a message and never calls addSchedule', async () => {
    const user = userEvent.setup({ delay: null });
    const addSchedule = vi.fn();
    const client = makeClient({
      listToolTags: vi.fn().mockResolvedValue(schedulableTags('run_report')),
      addSchedule,
    });
    renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, { client });

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'nightly-report');
    await pickTool(user, dialog, 'run_report');
    await user.type(within(dialog).getByLabelText('Cron expression'), '0 2 * * *');

    const kwargs = within(dialog).getByLabelText(/Tool kwargs/);
    await user.clear(kwargs);
    await user.type(kwargs, '{{not json');

    await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));

    expect(within(dialog).getByText(/Kwargs must be valid JSON/)).toBeInTheDocument();
    expect(addSchedule).not.toHaveBeenCalled();
  });

  it('blocks a non-object (scalar) kwargs payload with a message', async () => {
    const user = userEvent.setup({ delay: null });
    const addSchedule = vi.fn();
    const client = makeClient({
      listToolTags: vi.fn().mockResolvedValue(schedulableTags('run_report')),
      addSchedule,
    });
    renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, { client });

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'nightly-report');
    await pickTool(user, dialog, 'run_report');
    await user.type(within(dialog).getByLabelText('Cron expression'), '0 2 * * *');

    const kwargs = within(dialog).getByLabelText(/Tool kwargs/);
    await user.clear(kwargs);
    // Valid JSON, but a scalar rather than an object — must be rejected, not coerced.
    await user.type(kwargs, '42');

    await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));

    expect(within(dialog).getByText('Kwargs must be a JSON object.')).toBeInTheDocument();
    expect(addSchedule).not.toHaveBeenCalled();
  });
});

describe('AddScheduleDialog — required-field guards', () => {
  it('shows every missing-field error and does not submit an empty form', async () => {
    const user = userEvent.setup({ delay: null });
    const addSchedule = vi.fn();
    const client = makeClient({
      listToolTags: vi.fn().mockResolvedValue(schedulableTags('run_report')),
      addSchedule,
    });
    renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, { client });

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));

    expect(within(dialog).getByText('A name is required.')).toBeInTheDocument();
    expect(within(dialog).getByText('A tool is required.')).toBeInTheDocument();
    expect(within(dialog).getByText('A cron expression is required.')).toBeInTheDocument();
    expect(addSchedule).not.toHaveBeenCalled();
  });

  it('rejects a cron expression of the wrong length with the field message', async () => {
    const user = userEvent.setup({ delay: null });
    const addSchedule = vi.fn();
    const client = makeClient({
      listToolTags: vi.fn().mockResolvedValue(schedulableTags('run_report')),
      addSchedule,
    });
    renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, { client });

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'nightly-report');
    await pickTool(user, dialog, 'run_report');
    await user.type(within(dialog).getByLabelText('Cron expression'), '0 2 * *');

    await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));

    expect(
      within(dialog).getByText(
        'Use 5 fields (minute hour day-of-month month day-of-week), or 6 with a leading seconds field.',
      ),
    ).toBeInTheDocument();
    expect(addSchedule).not.toHaveBeenCalled();
  });

  it('rejects a non-positive interval with a message', async () => {
    const user = userEvent.setup({ delay: null });
    const addSchedule = vi.fn();
    const client = makeClient({
      listToolTags: vi.fn().mockResolvedValue(schedulableTags('sync')),
      addSchedule,
    });
    renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, { client });

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'hourly-sync');
    await pickTool(user, dialog, 'sync');
    await user.click(within(dialog).getByRole('radio', { name: 'Interval' }));
    await user.type(within(dialog).getByRole('spinbutton'), '0');

    await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));

    expect(within(dialog).getByText('Enter a positive number of seconds.')).toBeInTheDocument();
    expect(addSchedule).not.toHaveBeenCalled();
  });
});

describe('AddScheduleDialog — mutation states', () => {
  it('disables the submit and shows a spinner while the mutation is in flight', async () => {
    const user = userEvent.setup({ delay: null });
    const onClose = vi.fn();
    const pending = deferred<unknown>();
    const client = makeClient({
      listToolTags: vi.fn().mockResolvedValue(schedulableTags('run_report')),
      addSchedule: vi.fn().mockReturnValue(pending.promise),
    });
    renderWithProviders(<AddScheduleDialog onClose={onClose} />, { client });

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'nightly-report');
    await pickTool(user, dialog, 'run_report');
    await user.type(within(dialog).getByLabelText('Cron expression'), '0 2 * * *');

    const submit = within(dialog).getByRole('button', { name: 'Create schedule' });
    await user.click(submit);

    await waitFor(() => {
      expect(submit).toBeDisabled();
    });
    expect(within(dialog).getByRole('status', { name: 'Creating schedule' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    // Settle the mutation so the dialog closes and no state update dangles.
    pending.resolve({});
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('surfaces a rejected mutation as a loud error and keeps the dialog open', async () => {
    const user = userEvent.setup({ delay: null });
    const onClose = vi.fn();
    const client = makeClient({
      listToolTags: vi.fn().mockResolvedValue(schedulableTags('run_report')),
      addSchedule: vi.fn().mockRejectedValue(new ApiError('schedule name already exists', 409)),
    });
    renderWithProviders(<AddScheduleDialog onClose={onClose} />, { client });

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'nightly-report');
    await pickTool(user, dialog, 'run_report');
    await user.type(within(dialog).getByLabelText('Cron expression'), '0 2 * * *');

    await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));

    expect(await within(dialog).findByText('schedule name already exists')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    // The submit re-enables so the operator can correct and retry.
    expect(within(dialog).getByRole('button', { name: 'Create schedule' })).toBeEnabled();
  });
});

describe('AddScheduleDialog — tools list error', () => {
  it('replaces the tool picker with a retryable error when the tool tags read fails', async () => {
    const user = userEvent.setup({ delay: null });
    const listToolTags = vi.fn().mockRejectedValue(new ApiError('tools unavailable', 500));
    const client = makeClient({ listToolTags });
    renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, { client });

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('tools unavailable')).toBeInTheDocument();
    expect(within(dialog).queryByRole('combobox', { name: 'Tool' })).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Retry' }));
    expect(listToolTags).toHaveBeenCalledTimes(2);
  });
});

describe('AddScheduleDialog — hidden-tool exclusion', () => {
  it('excludes an EFFECTIVE-hidden tool, keeping an overlay-`false` unhidden one', async () => {
    // `secret_task` is plugin-hidden with no overlay opinion → excluded. `open_task`
    // is plugin-hidden but the overlay forces it visible (`hidden: false`) → offered.
    // Each tool is served schedulable, so the exclusion is tested on tools the picker offers.
    const user = userEvent.setup({ delay: null });
    const client = makeClient({
      listToolTags: vi.fn().mockResolvedValue([
        { name: 'run_report', tags: [], hidden: false, badges: [], schedulable: true },
        { name: 'secret_task', tags: [], hidden: true, badges: [], schedulable: true },
        { name: 'open_task', tags: [], hidden: true, badges: [], schedulable: true },
      ]),
      listToolMeta: vi.fn().mockResolvedValue({
        folders: [],
        meta: [
          { tool_name: 'open_task', display_name: null, folder_id: null, tags: [], hidden: false },
        ],
      }),
      addSchedule: vi.fn(),
    });
    renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, { client });

    const dialog = await screen.findByRole('dialog');
    await openToolPicker(user, dialog);

    expect(await screen.findByRole('option', { name: 'run_report' })).toBeInTheDocument();
    // The overlay UNHIDES the plugin-hidden `open_task`, so it IS offered.
    expect(screen.getByRole('option', { name: 'open_task' })).toBeInTheDocument();
    // The effective-hidden `secret_task` is absent from the picker.
    expect(screen.queryByRole('option', { name: 'secret_task' })).toBeNull();
  });
});

describe('AddScheduleDialog — nothing schedulable', () => {
  it('states that no tool can be scheduled in place of the picker, with the schedulable explanation', async () => {
    const client = makeClient({
      listToolTags: vi
        .fn()
        .mockResolvedValue([
          { name: 'run_report', tags: [], hidden: false, badges: [], schedulable: false },
        ]),
    });
    renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, { client });

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('No tool can be scheduled.')).toHaveAttribute(
      'role',
      'status',
    );
    expect(within(dialog).queryByRole('combobox', { name: 'Tool' })).toBeNull();
    expect(
      within(dialog).getByText(
        "A tool can be scheduled when it carries the scheduling backend's schedule extension.",
      ),
    ).toBeInTheDocument();
  });
});

describe('AddScheduleDialog — display names', () => {
  it('labels a picker option "Display (raw)" from the tool-meta overlay', async () => {
    const user = userEvent.setup({ delay: null });
    const client = makeClient({
      listToolTags: vi.fn().mockResolvedValue(schedulableTags('sync')),
    });
    renderWithProviders(
      <StaticToolDisplayNamesProvider names={{ sync: 'Nightly Sync' }}>
        <AddScheduleDialog onClose={vi.fn()} />
      </StaticToolDisplayNamesProvider>,
      { client },
    );

    const dialog = await screen.findByRole('dialog');
    await openToolPicker(user, dialog);
    expect(await screen.findByRole('option', { name: 'Nightly Sync (sync)' })).toBeInTheDocument();
  });
});

describe('AddScheduleDialog — tool descriptions', () => {
  it('finds a tool by a word of its declared description', async () => {
    const user = userEvent.setup({ delay: null });
    const client = makeClient({
      listToolTags: vi.fn().mockResolvedValue([
        ...schedulableTags('run_report'),
        {
          name: 'sync',
          description: 'Mirrors the remote folder',
          tags: [],
          badges: [],
          hidden: false,
          schedulable: true,
        },
      ]),
    });
    renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, { client });

    const dialog = await screen.findByRole('dialog');
    await openToolPicker(user, dialog);
    await user.type(screen.getByRole('combobox', { name: 'Search tools' }), 'mirrors');

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(1);
    expect(options[0]).toHaveAccessibleName('sync');
    expect(options[0]).toHaveAccessibleDescription('Mirrors the remote folder');
  });
});

describe('AddScheduleDialog — declared badges', () => {
  it('shows the SELECTED tool declared badges (native ∪ overlay) as read-only chips', async () => {
    // `network` is plugin-declared; `audited` is an operator overlay badge. The picker
    // shows their merged, deduped, sorted union beneath the chosen tool.
    const user = userEvent.setup({ delay: null });
    const client = makeClient({
      listToolTags: vi
        .fn()
        .mockResolvedValue([
          { name: 'sync', tags: [], badges: ['network'], hidden: false, schedulable: true },
        ]),
      listToolMeta: vi.fn().mockResolvedValue({
        folders: [],
        meta: [
          {
            tool_name: 'sync',
            display_name: null,
            folder_id: null,
            tags: [],
            badges: ['audited'],
            hidden: null,
          },
        ],
      }),
    });
    renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, { client });

    const dialog = await screen.findByRole('dialog');
    // No selection yet → no chips.
    expect(within(dialog).queryByTestId('tool-picker-badges')).toBeNull();

    await pickTool(user, dialog, 'sync');

    const badges = await within(dialog).findByTestId('tool-picker-badges');
    expect(badges).toHaveTextContent('network');
    expect(badges).toHaveTextContent('audited');
  });
});

describe('AddScheduleDialog — close paths', () => {
  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup({ delay: null });
    const onClose = vi.fn();
    const client = makeClient({ listToolTags: vi.fn().mockResolvedValue(schedulableTags()) });
    renderWithProviders(<AddScheduleDialog onClose={onClose} />, { client });

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the dialog is dismissed with Escape', async () => {
    const user = userEvent.setup({ delay: null });
    const onClose = vi.fn();
    const client = makeClient({ listToolTags: vi.fn().mockResolvedValue(schedulableTags()) });
    renderWithProviders(<AddScheduleDialog onClose={onClose} />, { client });

    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});

describe('AddScheduleDialog — execution-key binding', () => {
  const KEY_REQUIRED =
    'A door-contract jq (start / cancel / resume / extras) needs an execution key.';
  const forbiddenKeys = (): Promise<never> => Promise.reject(new ApiError('forbidden', 403));

  async function fillSchedule(
    user: UserEvent,
    dialog: HTMLElement,
    { startJq = true }: { readonly startJq?: boolean } = {},
  ): Promise<void> {
    await user.type(within(dialog).getByLabelText('Name'), 'nightly-report');
    await pickTool(user, dialog, 'run_report');
    await user.type(within(dialog).getByLabelText('Cron expression'), '0 2 * * *');
    if (startJq) await user.type(within(dialog).getByRole('textbox', { name: 'Start' }), '.id');
  }

  function keyClient(listTokensPayload: ApiClient['listTokensPayload']) {
    const addSchedule = vi.fn().mockResolvedValue({});
    const client = makeClient({
      listToolTags: vi.fn().mockResolvedValue(schedulableTags('run_report')),
      listTokensPayload,
      addSchedule,
    });
    return { client, addSchedule };
  }

  it(
    'access control off: no key field; a door-contract create carries the fill identity',
    async () => {
      const user = userEvent.setup({ delay: null });
      const { client, addSchedule } = keyClient(vi.fn().mockResolvedValue([]));
      renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, {
        client,
        projection: gateOffProjection(),
      });

      const dialog = await screen.findByRole('dialog');
      await fillSchedule(user, dialog);
      expect(within(dialog).queryByText('Execution key')).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));

      await waitFor(() => {
        expect(addSchedule).toHaveBeenCalledOnce();
      });
      expect(addSchedule.mock.calls[0]?.[0]).toMatchObject({ execution_key: '__no_auth__' });
      expect(client.listTokensPayload).not.toHaveBeenCalled();
    },
    SUBMIT_FLOW_TIMEOUT_MS,
  );

  it(
    'access control off: a create with no door contract carries no execution key',
    async () => {
      const user = userEvent.setup({ delay: null });
      const { client, addSchedule } = keyClient(vi.fn().mockResolvedValue([]));
      renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, {
        client,
        projection: gateOffProjection(),
      });

      const dialog = await screen.findByRole('dialog');
      await fillSchedule(user, dialog, { startJq: false });
      await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));

      await waitFor(() => {
        expect(addSchedule).toHaveBeenCalledOnce();
      });
      expect(addSchedule.mock.calls[0]?.[0]).not.toHaveProperty('execution_key');
    },
    SUBMIT_FLOW_TIMEOUT_MS,
  );

  for (const [label, read] of [
    ['an empty key list', () => vi.fn().mockResolvedValue([])],
    ['a refused key list', () => vi.fn().mockImplementation(forbiddenKeys)],
  ] as const) {
    it(
      `a key session over ${label} creates as its own identity`,
      async () => {
        const user = userEvent.setup({ delay: null });
        const { client, addSchedule } = keyClient(read());
        renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, {
          client,
          projection: keySessionProjection(),
        });

        const dialog = await screen.findByRole('dialog');
        await fillSchedule(user, dialog);
        const picker = within(dialog).getByRole('combobox', { name: 'Execution key' });
        await waitFor(() => {
          expect(picker).toBeEnabled();
        });
        await user.click(picker);
        await user.click(
          await screen.findByRole('option', { name: "alice-key — this session's identity" }),
        );
        await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));

        await waitFor(() => {
          expect(addSchedule).toHaveBeenCalledOnce();
        });
        expect(addSchedule.mock.calls[0]?.[0]).toMatchObject({ execution_key: 'alice-key' });
      },
      SUBMIT_FLOW_TIMEOUT_MS,
    );

    it(
      `a key session over ${label} with the key left blank shows the field error`,
      async () => {
        const user = userEvent.setup({ delay: null });
        const { client, addSchedule } = keyClient(read());
        renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, {
          client,
          projection: keySessionProjection(),
        });

        const dialog = await screen.findByRole('dialog');
        await fillSchedule(user, dialog);
        await waitFor(() => {
          expect(within(dialog).getByRole('combobox', { name: 'Execution key' })).toBeEnabled();
        });
        await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));

        expect(await within(dialog).findByText(KEY_REQUIRED)).toBeInTheDocument();
        expect(addSchedule).not.toHaveBeenCalled();
      },
      SUBMIT_FLOW_TIMEOUT_MS,
    );
  }

  it('an account session over an empty key list reads the account note', async () => {
    const { client } = keyClient(vi.fn().mockResolvedValue([]));
    renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, {
      client,
      projection: accountSessionProjection(),
    });

    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText(
        'No api keys of yours are listed. You are signed in as an account, not an api key, so your own identity cannot be picked here. Mint a key on the settings API-keys tab first.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('combobox', { name: 'Execution key' })).toBeNull();
  });

  it('a refused key list shows the no-grant note with no Retry; an account session gets no option', async () => {
    const { client } = keyClient(vi.fn().mockImplementation(forbiddenKeys));
    renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, {
      client,
      projection: accountSessionProjection(),
    });

    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText(
        'This session cannot list api keys. Picking one needs read access to GET /api/auth/tokens-payload; ask an administrator to grant it.',
      ),
    ).toHaveAttribute('role', 'status');
    expect(within(dialog).queryByRole('button', { name: 'Retry' })).toBeNull();
    expect(within(dialog).queryByRole('combobox', { name: 'Execution key' })).toBeNull();
  });

  it('with no projection the key field is pending and the key list is not read', async () => {
    const { client } = keyClient(vi.fn().mockResolvedValue([]));
    renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, { client });

    const dialog = await screen.findByRole('dialog');
    const picker = within(dialog).getByRole('combobox', { name: 'Execution key' });
    expect(picker).toBeDisabled();
    expect(picker).toHaveTextContent('Loading keys…');
    expect(client.listTokensPayload).not.toHaveBeenCalled();
  });
});
