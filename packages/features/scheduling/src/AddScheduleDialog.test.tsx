/**
 * Direct behavioural tests for the add-schedule dialog, driven on its own rather
 * than through the page. The dialog renders `open` and talks to exactly two api
 * seams: `listTools` (feeds the `ToolPicker`) and `addSchedule` (the mutation).
 * These cover: the initial render, a valid crontab submit and a valid interval
 * submit asserting the EXACT skeleton body, the client-side kwargs validation
 * (malformed JSON and non-object payloads), the per-field required-input guards,
 * the in-flight disabled/spinner state, the loud error surface when the mutation
 * rejects, the tools-list error branch, and both close paths (Cancel + Escape).
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '@tai42/api-client';
import { deferred, StaticToolDisplayNamesProvider } from '@tai42/studio-sdk/testing';

import { AddScheduleDialog } from './AddScheduleDialog';
import { makeClient, renderWithProviders } from './test-utils';

/** Pick a tool by name via the shared `ToolPicker` (a Radix combobox portalled to body). */
async function pickTool(user: UserEvent, dialog: HTMLElement, toolName: string): Promise<void> {
  await user.click(within(dialog).getByRole('combobox'));
  await user.click(await screen.findByRole('option', { name: toolName }));
}

describe('AddScheduleDialog — render', () => {
  it('renders the dialog open with its fields, defaulting to the crontab spec', async () => {
    const client = makeClient({ listTools: vi.fn().mockResolvedValue([]) });
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

describe('AddScheduleDialog — valid submit', () => {
  it('posts the exact crontab body, then closes on success', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const addSchedule = vi.fn().mockResolvedValue({});
    const client = makeClient({
      listTools: vi.fn().mockResolvedValue(['run_report_schedule_task', 'sync_schedule_task']),
      addSchedule,
    });
    renderWithProviders(<AddScheduleDialog onClose={onClose} />, { client });

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'nightly-report');
    await pickTool(user, dialog, 'run_report_schedule_task');

    const kwargs = within(dialog).getByLabelText(/Tool kwargs/);
    await user.clear(kwargs);
    await user.type(kwargs, '{{"limit": 10}');

    await user.type(within(dialog).getByLabelText('Cron expression'), '0 2 * * *');
    await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));

    await waitFor(() => {
      expect(addSchedule).toHaveBeenCalledWith({
        tool_name: 'run_report_schedule_task',
        tool_kwargs: { limit: 10 },
        schedule_kwargs: {
          backend_schedule: '0 2 * * *',
          backend_schedule_name: 'nightly-report',
        },
      });
    });
    expect(addSchedule).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('posts a numeric backend_schedule and empty kwargs for the interval spec', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const addSchedule = vi.fn().mockResolvedValue({});
    const client = makeClient({
      listTools: vi.fn().mockResolvedValue(['sync_schedule_task']),
      addSchedule,
    });
    renderWithProviders(<AddScheduleDialog onClose={onClose} />, { client });

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'hourly-sync');
    await pickTool(user, dialog, 'sync_schedule_task');

    // Switch to the interval spec; the untouched default kwargs `{}` maps to `{}`.
    await user.click(within(dialog).getByRole('radio', { name: 'Interval' }));
    await user.type(within(dialog).getByRole('spinbutton'), '3600');

    await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));

    await waitFor(() => {
      expect(addSchedule).toHaveBeenCalledWith({
        tool_name: 'sync_schedule_task',
        tool_kwargs: {},
        schedule_kwargs: {
          backend_schedule: 3600,
          backend_schedule_name: 'hourly-sync',
        },
      });
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});

describe('AddScheduleDialog — kwargs validation', () => {
  it('blocks malformed JSON kwargs with a message and never calls addSchedule', async () => {
    const user = userEvent.setup();
    const addSchedule = vi.fn();
    const client = makeClient({
      listTools: vi.fn().mockResolvedValue(['run_report_schedule_task']),
      addSchedule,
    });
    renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, { client });

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'nightly-report');
    await pickTool(user, dialog, 'run_report_schedule_task');
    await user.type(within(dialog).getByLabelText('Cron expression'), '0 2 * * *');

    const kwargs = within(dialog).getByLabelText(/Tool kwargs/);
    await user.clear(kwargs);
    await user.type(kwargs, '{{not json');

    await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));

    expect(within(dialog).getByText(/Kwargs must be valid JSON/)).toBeInTheDocument();
    expect(addSchedule).not.toHaveBeenCalled();
  });

  it('blocks a non-object (scalar) kwargs payload with a message', async () => {
    const user = userEvent.setup();
    const addSchedule = vi.fn();
    const client = makeClient({
      listTools: vi.fn().mockResolvedValue(['run_report_schedule_task']),
      addSchedule,
    });
    renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, { client });

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'nightly-report');
    await pickTool(user, dialog, 'run_report_schedule_task');
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
    const user = userEvent.setup();
    const addSchedule = vi.fn();
    const client = makeClient({
      listTools: vi.fn().mockResolvedValue(['run_report_schedule_task']),
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

  it('rejects a non-positive interval with a message', async () => {
    const user = userEvent.setup();
    const addSchedule = vi.fn();
    const client = makeClient({
      listTools: vi.fn().mockResolvedValue(['sync_schedule_task']),
      addSchedule,
    });
    renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, { client });

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'hourly-sync');
    await pickTool(user, dialog, 'sync_schedule_task');
    await user.click(within(dialog).getByRole('radio', { name: 'Interval' }));
    await user.type(within(dialog).getByRole('spinbutton'), '0');

    await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));

    expect(within(dialog).getByText('Enter a positive number of seconds.')).toBeInTheDocument();
    expect(addSchedule).not.toHaveBeenCalled();
  });
});

describe('AddScheduleDialog — mutation states', () => {
  it('disables the submit and shows a spinner while the mutation is in flight', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const pending = deferred<unknown>();
    const client = makeClient({
      listTools: vi.fn().mockResolvedValue(['run_report_schedule_task']),
      addSchedule: vi.fn().mockReturnValue(pending.promise),
    });
    renderWithProviders(<AddScheduleDialog onClose={onClose} />, { client });

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'nightly-report');
    await pickTool(user, dialog, 'run_report_schedule_task');
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
    const user = userEvent.setup();
    const onClose = vi.fn();
    const client = makeClient({
      listTools: vi.fn().mockResolvedValue(['run_report_schedule_task']),
      addSchedule: vi.fn().mockRejectedValue(new ApiError('schedule name already exists', 409)),
    });
    renderWithProviders(<AddScheduleDialog onClose={onClose} />, { client });

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'nightly-report');
    await pickTool(user, dialog, 'run_report_schedule_task');
    await user.type(within(dialog).getByLabelText('Cron expression'), '0 2 * * *');

    await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));

    expect(await within(dialog).findByText('schedule name already exists')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    // The submit re-enables so the operator can correct and retry.
    expect(within(dialog).getByRole('button', { name: 'Create schedule' })).toBeEnabled();
  });
});

describe('AddScheduleDialog — tools list error', () => {
  it('replaces the tool picker with a retryable error when listTools fails', async () => {
    const user = userEvent.setup();
    const listTools = vi.fn().mockRejectedValue(new ApiError('tools unavailable', 500));
    const client = makeClient({ listTools });
    renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, { client });

    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByText('tools unavailable')).toBeInTheDocument();
    expect(within(dialog).queryByRole('combobox')).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: 'Retry' }));
    expect(listTools).toHaveBeenCalledTimes(2);
  });
});

describe('AddScheduleDialog — hidden-tool exclusion', () => {
  it('excludes an EFFECTIVE-hidden tool, keeping an overlay-`false` unhidden one', async () => {
    // `secret_task` is plugin-hidden with no overlay opinion → excluded. `open_task`
    // is plugin-hidden but the overlay forces it visible (`hidden: false`) → offered.
    const user = userEvent.setup();
    const client = makeClient({
      listTools: vi
        .fn()
        .mockResolvedValue(['run_report_schedule_task', 'secret_task', 'open_task']),
      listToolTags: vi.fn().mockResolvedValue([
        { name: 'run_report_schedule_task', tags: [], hidden: false },
        { name: 'secret_task', tags: [], hidden: true },
        { name: 'open_task', tags: [], hidden: true },
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
    await user.click(within(dialog).getByRole('combobox'));

    expect(
      await screen.findByRole('option', { name: 'run_report_schedule_task' }),
    ).toBeInTheDocument();
    // The overlay UNHIDES the plugin-hidden `open_task`, so it IS offered.
    expect(screen.getByRole('option', { name: 'open_task' })).toBeInTheDocument();
    // The effective-hidden `secret_task` is absent from the picker.
    expect(screen.queryByRole('option', { name: 'secret_task' })).toBeNull();
  });
});

describe('AddScheduleDialog — display names', () => {
  it('labels a picker option "Display (raw)" from the tool-meta overlay', async () => {
    const user = userEvent.setup();
    const client = makeClient({ listTools: vi.fn().mockResolvedValue(['sync_schedule_task']) });
    renderWithProviders(
      <StaticToolDisplayNamesProvider names={{ sync_schedule_task: 'Nightly Sync' }}>
        <AddScheduleDialog onClose={vi.fn()} />
      </StaticToolDisplayNamesProvider>,
      { client },
    );

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('combobox'));
    expect(
      await screen.findByRole('option', { name: 'Nightly Sync (sync_schedule_task)' }),
    ).toBeInTheDocument();
  });
});

describe('AddScheduleDialog — declared badges', () => {
  it('shows the SELECTED tool declared badges (native ∪ overlay) as read-only chips', async () => {
    // `network` is plugin-declared; `audited` is an operator overlay badge. The picker
    // shows their merged, deduped, sorted union beneath the chosen tool.
    const user = userEvent.setup();
    const client = makeClient({
      listTools: vi.fn().mockResolvedValue(['sync_schedule_task']),
      listToolTags: vi
        .fn()
        .mockResolvedValue([
          { name: 'sync_schedule_task', tags: [], badges: ['network'], hidden: false },
        ]),
      listToolMeta: vi.fn().mockResolvedValue({
        folders: [],
        meta: [
          {
            tool_name: 'sync_schedule_task',
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

    await pickTool(user, dialog, 'sync_schedule_task');

    const badges = await within(dialog).findByTestId('tool-picker-badges');
    expect(badges).toHaveTextContent('network');
    expect(badges).toHaveTextContent('audited');
  });
});

describe('AddScheduleDialog — close paths', () => {
  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const client = makeClient({ listTools: vi.fn().mockResolvedValue([]) });
    renderWithProviders(<AddScheduleDialog onClose={onClose} />, { client });

    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the dialog is dismissed with Escape', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const client = makeClient({ listTools: vi.fn().mockResolvedValue([]) });
    renderWithProviders(<AddScheduleDialog onClose={onClose} />, { client });

    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
