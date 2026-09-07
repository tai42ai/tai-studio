/**
 * The Consumers tab: bound rows render with their kind badge, name, detail and an Open
 * control that routes a token link in-shell and a plugin link to the plugin's screen; a
 * consumer family that cannot be listed (no scheduling backend) shows the muted line; an
 * empty union shows the empty state; a 501 shows FeatureDisabled.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type StateDetail } from '@tai42/api-client';

import { ConsumersTab } from './ConsumersTab';
import { renderWithProviders } from './test-utils';

const state = {
  name: 'profile',
  description: '',
  schema: {},
  subject_kinds: ['person'],
  default_subject_kind: 'person',
  retention_days: null,
  mounts: [],
} as unknown as StateDetail;

function row(over: Record<string, unknown>) {
  return { kind: 'flow', name: null, detail: null, link: null, unavailable: null, ...over };
}

describe('ConsumersTab', () => {
  it('renders bound rows and opens a token link in-shell', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<ConsumersTab state={state} />, {
      client: {
        stateConsumers: vi.fn().mockResolvedValue([
          row({
            kind: 'hook',
            name: 'notify',
            detail: 'supplies kind person',
            link: { token: 'hooks', plugin_path: null, search: {} },
          }),
        ]),
      },
    });
    expect(await screen.findByText('notify')).toBeInTheDocument();
    expect(screen.getByText('supplies kind person')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open hook notify' }));
    expect(navigate).toHaveBeenCalledWith('hooks', {});
  });

  it('opens a plugin-path link through the plugin navigator', async () => {
    const user = userEvent.setup();
    const { navigatePlugin } = renderWithProviders(<ConsumersTab state={state} />, {
      client: {
        stateConsumers: vi.fn().mockResolvedValue([
          row({
            kind: 'flow',
            name: 'greeter',
            detail: 'binds with subject_expr .turn.subject',
            link: {
              token: null,
              plugin_path: 'tai42_acme_plugin/flows',
              search: { flow: 'greeter', tab: 'bindings' },
            },
          }),
        ]),
      },
    });
    await user.click(await screen.findByRole('button', { name: 'Open flow greeter' }));
    expect(navigatePlugin).toHaveBeenCalledWith('tai42_acme_plugin', 'flows', undefined, {
      flow: 'greeter',
      tab: 'bindings',
    });
  });

  it('opens a preset consumer on the presets page', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<ConsumersTab state={state} />, {
      client: {
        stateConsumers: vi.fn().mockResolvedValue([
          row({
            kind: 'preset',
            name: 'daily_note',
            detail: 'binds state_write, state_read',
            link: { token: 'presets', plugin_path: null, search: { preset: 'daily_note' } },
          }),
        ]),
      },
    });
    expect(await screen.findByText('binds state_write, state_read')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open preset daily_note' }));
    expect(navigate).toHaveBeenCalledWith('presets', { preset: 'daily_note' });
  });

  it('surfaces a no-scheduling-backend family as a muted line, never a row', async () => {
    renderWithProviders(<ConsumersTab state={state} />, {
      client: {
        stateConsumers: vi
          .fn()
          .mockResolvedValue([row({ kind: 'schedule', unavailable: 'no scheduling backend' })]),
      },
    });
    expect(
      await screen.findByText('Schedules: no scheduling backend on this deployment.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Nothing binds this state yet')).toBeInTheDocument();
  });

  it('shows the empty state when nothing binds the state', async () => {
    renderWithProviders(<ConsumersTab state={state} />, {
      client: { stateConsumers: vi.fn().mockResolvedValue([]) },
    });
    expect(await screen.findByText('Nothing binds this state yet')).toBeInTheDocument();
  });

  it('a 501 shows FeatureDisabled', async () => {
    renderWithProviders(<ConsumersTab state={state} />, {
      client: {
        stateConsumers: vi.fn().mockRejectedValue(new ApiError('no store', 501)),
      },
    });
    expect(await screen.findByTestId('feature-disabled')).toBeInTheDocument();
  });

  it('a linkless row and a malformed plugin link render — (no Open)', async () => {
    renderWithProviders(<ConsumersTab state={state} />, {
      client: {
        stateConsumers: vi.fn().mockResolvedValue([
          row({ kind: 'agent', name: 'noodle', detail: 'names a state_* builtin' }),
          row({
            kind: 'flow',
            name: 'bare',
            link: { token: null, plugin_path: 'no-slash-here', search: null },
          }),
        ]),
      },
    });
    expect(await screen.findByText('noodle')).toBeInTheDocument();
    // Neither row offers an Open control.
    expect(screen.queryByRole('button', { name: /Open/ })).not.toBeInTheDocument();
  });

  it('surfaces a loud error when the consumers read fails (not a 501)', async () => {
    renderWithProviders(<ConsumersTab state={state} />, {
      client: { stateConsumers: vi.fn().mockRejectedValue(new Error('consumers down')) },
    });
    expect(await screen.findByText('consumers down')).toBeInTheDocument();
  });
});
