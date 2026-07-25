import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppLink, NavigationProvider, useAppNavigate } from './context';
import type { NavigationContextValue, RouteSearch, RouteToken } from './types';

function makeNav(): NavigationContextValue {
  return {
    navigate: vi.fn(),
    resolvePath: vi.fn(<T extends RouteToken>(token: T, search?: RouteSearch<T>) => {
      const qs = search ? new URLSearchParams(search as Record<string, string>).toString() : '';
      return `/${token}${qs ? `?${qs}` : ''}`;
    }),
  };
}

function wrap(nav: NavigationContextValue, ui: React.ReactNode) {
  return render(<NavigationProvider value={nav}>{ui}</NavigationProvider>);
}

describe('navigation', () => {
  it('useAppNavigate calls the shell navigate with the token + typed search', async () => {
    const nav = makeNav();
    function Go() {
      const navigate = useAppNavigate();
      return (
        <button
          type="button"
          onClick={() => {
            navigate('tools', { tool: 'echo' });
          }}
        >
          go
        </button>
      );
    }
    wrap(nav, <Go />);
    await userEvent.click(screen.getByRole('button', { name: 'go' }));
    expect(nav.navigate).toHaveBeenCalledWith('tools', { tool: 'echo' });
  });

  it('AppLink renders a real anchor with the resolved href', () => {
    const nav = makeNav();
    wrap(
      nav,
      <AppLink to="connectors" search={{ connection: 'c1' }}>
        Open
      </AppLink>,
    );
    const link = screen.getByRole('link', { name: 'Open' });
    expect(link).toHaveAttribute('href', '/connectors?connection=c1');
  });

  it('AppLink forwards aria-current onto the real anchor', () => {
    const nav = makeNav();
    wrap(
      nav,
      <AppLink to="tools" aria-current="page">
        Tools
      </AppLink>,
    );
    expect(screen.getByRole('link', { name: 'Tools' })).toHaveAttribute('aria-current', 'page');
  });

  it('plain left-click on AppLink drives a client-side transition (no full navigation)', async () => {
    const nav = makeNav();
    wrap(nav, <AppLink to="settings">Settings</AppLink>);
    await userEvent.click(screen.getByRole('link', { name: 'Settings' }));
    expect(nav.navigate).toHaveBeenCalledWith('settings', undefined);
  });

  it('modifier-click falls through to the browser (no client transition)', () => {
    const nav = makeNav();
    wrap(nav, <AppLink to="settings">Settings</AppLink>);
    const link = screen.getByRole('link', { name: 'Settings' });
    const prevented = !fireEvent.click(link, { metaKey: true, button: 0 });
    expect(nav.navigate).not.toHaveBeenCalled();
    // The default is NOT prevented, so the browser performs the real navigation.
    expect(prevented).toBe(false);
  });

  it('useAppNavigate throws loudly outside a NavigationProvider', () => {
    function Bare() {
      useAppNavigate();
      return null;
    }
    // Silence the expected React error boundary log for this render.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => render(<Bare />)).toThrow(/NavigationProvider/);
    spy.mockRestore();
  });
});
