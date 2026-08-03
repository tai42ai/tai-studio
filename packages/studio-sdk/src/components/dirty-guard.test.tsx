import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { GuardedTabs, useRegisterDirty } from './dirty-guard';
import { NavigationProvider } from '../navigation';
import type { NavigationContextValue } from '../navigation';

const navigation: NavigationContextValue = {
  navigate: vi.fn(),
  resolvePath: () => '/x',
  navigatePlugin: vi.fn(),
  resolvePluginPath: () => '/x',
};

function renderGuarded(ui: ReactNode): void {
  render(<NavigationProvider value={navigation}>{ui}</NavigationProvider>);
}

function DirtyPanel(): ReactNode {
  useRegisterDirty(true);
  return <div>dirty panel</div>;
}

function CleanPanel(): ReactNode {
  useRegisterDirty(false);
  return <div>clean panel</div>;
}

describe('GuardedTabs', () => {
  it('confirms before switching away from a dirty panel and completes on discard', async () => {
    const user = userEvent.setup();
    renderGuarded(
      <GuardedTabs
        items={[
          { value: 'a', label: 'A', content: <DirtyPanel /> },
          { value: 'b', label: 'B', content: <CleanPanel /> },
        ]}
      />,
    );

    expect(screen.getByText('dirty panel')).toBeInTheDocument();

    // The switch is held while the confirm is open — the dirty panel stays mounted.
    await user.click(screen.getByRole('tab', { name: 'B' }));
    expect(await screen.findByText('Discard unsaved changes?')).toBeInTheDocument();
    expect(screen.getByText('dirty panel')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(await screen.findByText('clean panel')).toBeInTheDocument();
  });

  it('holds on the current panel when the discard is cancelled', async () => {
    const user = userEvent.setup();
    renderGuarded(
      <GuardedTabs
        items={[
          { value: 'a', label: 'A', content: <DirtyPanel /> },
          { value: 'b', label: 'B', content: <CleanPanel /> },
        ]}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'B' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(screen.getByText('dirty panel')).toBeInTheDocument();
    expect(screen.queryByText('clean panel')).toBeNull();
  });

  it('switches freely when nothing is dirty', async () => {
    const user = userEvent.setup();
    renderGuarded(
      <GuardedTabs
        items={[
          { value: 'a', label: 'A', content: <CleanPanel /> },
          { value: 'b', label: 'B', content: <div>panel b</div> },
        ]}
      />,
    );

    await user.click(screen.getByRole('tab', { name: 'B' }));
    expect(await screen.findByText('panel b')).toBeInTheDocument();
    expect(screen.queryByText(/unsaved changes/)).toBeNull();
  });
});
