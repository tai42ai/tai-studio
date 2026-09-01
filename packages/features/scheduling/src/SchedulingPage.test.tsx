/**
 * Behavioural tests for the scheduling feature: the table render, the untrusted-
 * content escaping pin, add-dialog client-side validation + submit body, the
 * delete-confirm flow, the dedicated 501 "needs a backend" empty state, and the
 * loud error surface for any other failure. The client is stubbed via `makeClient`.
 */
// The add-dialog flows here are typing-heavy; userEvent runs without its inter-key
// delay so a loaded runner cannot push a keystroke chain past the suite timeout, and
// no timer-scheduled keystroke can outlive its test to leak into the next. No
// assertion depends on typing cadence.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ApiError, ApiSchemaError } from '@tai42/api-client';

import { SchedulingPage } from './SchedulingPage';
import { makeClient, renderWithProviders, schedule } from './test-utils';

/** The datetime tool is unavailable in most tests; a 501 keeps its note out of the way. */
function serverTime501(): () => Promise<never> {
  return vi.fn().mockRejectedValue(new ApiError('no server time', 501));
}

/**
 * Open the shared `ToolPicker` (a Radix combobox). Its trigger is `disabled` until
 * `listTools` resolves, so the open is gated on it being ENABLED — the real ready
 * signal — rather than on incidental timer slack.
 */
async function openToolPicker(user: UserEvent, dialog: HTMLElement): Promise<void> {
  const combobox = within(dialog).getByRole('combobox');
  await waitFor(() => {
    expect(combobox).toBeEnabled();
  });
  await user.click(combobox);
}

describe('SchedulingPage — table', () => {
  it('renders schedules from the list', async () => {
    const client = makeClient({
      listSchedules: vi.fn().mockResolvedValue([
        schedule({ name: 'nightly-report', enabled: true }),
        schedule({
          name: 'hourly-sync',
          enabled: false,
          schedule: { __type: 'interval', every: 3600 },
          kwargs: { backend_tool_name: 'sync_schedule_task' },
        }),
      ]),
      getServerDateTime: serverTime501(),
    });
    renderWithProviders(<SchedulingPage search={{}} />, { client });

    await waitFor(() => {
      expect(screen.getByText('nightly-report')).toBeInTheDocument();
    });
    // The page header is the SDK PageHeader; its h1 name stays verbatim.
    expect(screen.getByRole('heading', { level: 1, name: 'Scheduling' })).toBeInTheDocument();
    expect(screen.getByText('run_report_schedule_task')).toBeInTheDocument();
    // Every table is inside a `ScrollRegion`: a bare table on a 320 px page
    // widens the document instead of scrolling inside its own box.
    for (const table of document.querySelectorAll('table')) {
      expect(table.closest('.tai-scroll-region')).not.toBeNull();
    }
    expect(screen.getByText('Cron: 0 2 * * *')).toBeInTheDocument();
    expect(screen.getByText('Every 3600s')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });

  it('escapes untrusted name/tool/kwargs content (no script element)', async () => {
    const xss = "<script>window.__xss='pwned'</script>";
    const client = makeClient({
      listSchedules: vi
        .fn()
        .mockResolvedValue([
          schedule({ name: xss, kwargs: { backend_tool_name: xss, note: xss } }),
        ]),
      getServerDateTime: serverTime501(),
    });
    const { container } = renderWithProviders(<SchedulingPage search={{}} />, { client });

    await waitFor(() => {
      expect(screen.getAllByText(xss).length).toBeGreaterThan(0);
    });
    expect(container.querySelector('script')).toBeNull();
    // The name and the tool (a kwargs value) both surface as literal text.
    expect(screen.getAllByText(xss).length).toBeGreaterThanOrEqual(2);
  });

  it('shows the server clock when the datetime tool is available', async () => {
    const client = makeClient({
      listSchedules: vi.fn().mockResolvedValue([]),
      getServerDateTime: vi
        .fn()
        .mockResolvedValue({ utc: { date: '2026-07-05', time: '12:00:00' } }),
    });
    renderWithProviders(<SchedulingPage search={{}} />, { client });

    await waitFor(() => {
      expect(screen.getByText('2026-07-05 12:00:00')).toBeInTheDocument();
    });
  });

  it('shows a "server time unavailable" note when the datetime tool 501s', async () => {
    const client = makeClient({
      listSchedules: vi.fn().mockResolvedValue([]),
      getServerDateTime: serverTime501(),
    });
    renderWithProviders(<SchedulingPage search={{}} />, { client });

    await waitFor(() => {
      expect(screen.getByText('Server time unavailable.')).toBeInTheDocument();
    });
  });
});

describe('SchedulingPage — no-backend + error states', () => {
  it('renders the dedicated empty state (not an error) on a 501 list', async () => {
    const client = makeClient({
      listSchedules: vi.fn().mockRejectedValue(new ApiError('no backend', 501)),
      getServerDateTime: serverTime501(),
    });
    renderWithProviders(<SchedulingPage search={{}} />, { client });

    await waitFor(() => {
      expect(screen.getByText('Scheduling needs a backend plugin')).toBeInTheDocument();
    });
    expect(screen.queryByText('Retry')).toBeNull();
    expect(screen.queryByText('no backend')).toBeNull();
  });

  it('renders a loud error state on a zod schema mismatch (contract drift)', async () => {
    const client = makeClient({
      listSchedules: vi.fn().mockRejectedValue(new ApiSchemaError('/api/schedules', [])),
      getServerDateTime: serverTime501(),
    });
    renderWithProviders(<SchedulingPage search={{}} />, { client });

    await waitFor(() => {
      expect(screen.getByText(/did not match its expected schema/i)).toBeInTheDocument();
    });
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });
});

describe('SchedulingPage — add dialog', () => {
  it('blocks a submit with invalid kwargs JSON and never calls addSchedule', async () => {
    const user = userEvent.setup({ delay: null });
    const addSchedule = vi.fn();
    const client = makeClient({
      listSchedules: vi.fn().mockResolvedValue([]),
      getServerDateTime: serverTime501(),
      listTools: vi.fn().mockResolvedValue(['run_report_schedule_task']),
      addSchedule,
    });
    renderWithProviders(<SchedulingPage search={{}} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Add schedule' }));
    const dialog = await screen.findByRole('dialog');

    const kwargs = within(dialog).getByLabelText(/Tool kwargs/);
    await user.clear(kwargs);
    await user.type(kwargs, '{{not json');

    await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));

    expect(within(dialog).getByText(/Kwargs must be valid JSON/)).toBeInTheDocument();
    expect(addSchedule).not.toHaveBeenCalled();
  });

  it('submits a valid schedule with the expected body', async () => {
    const user = userEvent.setup({ delay: null });
    const addSchedule = vi.fn().mockResolvedValue({});
    const client = makeClient({
      listSchedules: vi.fn().mockResolvedValue([]),
      getServerDateTime: serverTime501(),
      listTools: vi.fn().mockResolvedValue(['run_report_schedule_task', 'sync_schedule_task']),
      addSchedule,
    });
    renderWithProviders(<SchedulingPage search={{}} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Add schedule' }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText('Name'), 'nightly-report');

    // Pick a tool via the shared ToolPicker (Radix combobox).
    await openToolPicker(user, dialog);
    await user.click(await screen.findByRole('option', { name: 'run_report_schedule_task' }));

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
  });

  it('submits an interval schedule with a numeric backend_schedule', async () => {
    const user = userEvent.setup({ delay: null });
    const addSchedule = vi.fn().mockResolvedValue({});
    const client = makeClient({
      listSchedules: vi.fn().mockResolvedValue([]),
      getServerDateTime: serverTime501(),
      listTools: vi.fn().mockResolvedValue(['sync_schedule_task']),
      addSchedule,
    });
    renderWithProviders(<SchedulingPage search={{}} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Add schedule' }));
    const dialog = await screen.findByRole('dialog');

    await user.type(within(dialog).getByLabelText('Name'), 'hourly-sync');
    await openToolPicker(user, dialog);
    await user.click(await screen.findByRole('option', { name: 'sync_schedule_task' }));

    // Switch to the interval spec.
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
  });
});

describe('SchedulingPage — delete', () => {
  it('deletes a schedule after confirming', async () => {
    const user = userEvent.setup({ delay: null });
    const deleteSchedule = vi.fn().mockResolvedValue({});
    const client = makeClient({
      listSchedules: vi.fn().mockResolvedValue([schedule({ name: 'nightly-report' })]),
      getServerDateTime: serverTime501(),
      deleteSchedule,
    });
    renderWithProviders(<SchedulingPage search={{}} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Delete schedule nightly-report' }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Delete schedule')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(deleteSchedule).toHaveBeenCalledWith('nightly-report');
    });
  });
});
