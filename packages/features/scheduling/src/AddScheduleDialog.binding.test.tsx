/**
 * State-binding behaviour of the add-schedule dialog: resolving the scheduled
 * tool's schema into the binding field pickers, the preset override advisory, and
 * serializing a SET binding into the schedule body. Driven on the dialog directly.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AddScheduleDialog } from './AddScheduleDialog';
import { makeClient, renderWithProviders } from './test-utils';

/**
 * Open the shared `ToolPicker` (a Radix combobox portalled to body). The trigger is
 * `disabled` until `listTools` resolves, so the open is gated on it being ENABLED —
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

describe('AddScheduleDialog — state binding source resolution', () => {
  it("resolves the scheduled tool's schema into the binding field pickers", async () => {
    const user = userEvent.setup();
    const getToolSchema = vi.fn().mockResolvedValue({
      input: { type: 'object', properties: { memo: { type: 'string' } } },
      output: { type: 'object', properties: { total: { type: 'number' } } },
      description: null,
    });
    const client = makeClient({
      listTools: vi.fn().mockResolvedValue(['run_report', 'run_report_schedule_task']),
      listStates: vi.fn().mockResolvedValue([]),
      listStateTemplates: vi.fn().mockResolvedValue([]),
      getToolSchema,
    });
    renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, { client });
    const dialog = await screen.findByRole('dialog');
    await pickTool(user, dialog, 'run_report');
    await waitFor(() => {
      expect(getToolSchema.mock.calls.some((call) => call[0] === 'run_report')).toBe(true);
    });
  });
});

describe('AddScheduleDialog — state binding advisory + serialization', () => {
  const presetVersions = [
    {
      version: 1,
      is_current: true,
      tags: [],
      created_at: '',
      body: {
        base_tool: 'echo',
        description: '',
        fixed_kwargs: {},
        extensions: [],
        output_schema: null,
        input_schema: null,
        state_binding: {
          states: [
            {
              state: 'counters',
              templates: [],
              subject_expr: { content: '.preset_key' },
              scope_expr: null,
              input_injections: [],
              updates: [],
            },
          ],
        },
      },
    },
  ];

  it(
    'shows the override advisory and serializes a SET binding into the schedule body',
    async () => {
      const user = userEvent.setup({ delay: null });
      const addSchedule = vi.fn().mockResolvedValue({});
      const client = makeClient({
        listTools: vi.fn().mockResolvedValue(['tally-preset', 'tally-preset_schedule_task']),
        listStates: vi.fn().mockResolvedValue([{ name: 'counters' }]),
        listStateTemplates: vi.fn().mockResolvedValue([]),
        listPresets: vi.fn().mockResolvedValue([{ name: 'tally-preset' }]),
        listPresetVersions: vi.fn().mockResolvedValue(presetVersions),
        getToolSchema: vi.fn().mockResolvedValue({ input: {}, output: null, description: null }),
        addSchedule,
      });
      renderWithProviders(<AddScheduleDialog onClose={vi.fn()} />, { client });

      const dialog = await screen.findByRole('dialog');
      await user.type(within(dialog).getByLabelText('Name'), 'tally-schedule');
      await pickTool(user, dialog, 'tally-preset');
      await user.type(within(dialog).getByLabelText('Cron expression'), '0 2 * * *');

      await user.click(within(dialog).getByRole('button', { name: 'Bind state (optional)' }));
      await user.click(within(dialog).getByRole('button', { name: 'Attach a state' }));
      await user.click(within(dialog).getByRole('combobox', { name: 'State' }));
      await user.click(await screen.findByRole('option', { name: 'counters' }));

      expect(await screen.findByText('Overrides the preset’s subject')).toBeInTheDocument();

      await user.click(within(dialog).getByRole('button', { name: 'Create schedule' }));
      await waitFor(() => {
        expect(addSchedule).toHaveBeenCalled();
      });
      const body = addSchedule.mock.calls[0]?.[0] as { state_binding?: unknown };
      expect(body.state_binding).toEqual({
        states: [
          {
            state: 'counters',
            templates: [],
            subject_expr: { content: '' },
            scope_expr: null,
            input_injections: [],
            updates: [],
          },
        ],
      });
    },
    SUBMIT_FLOW_TIMEOUT_MS,
  );
});
