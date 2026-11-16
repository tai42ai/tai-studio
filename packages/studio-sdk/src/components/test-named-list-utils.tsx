/** The stub query and navigation harness the agent and channel picker tests share. */
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { vi } from 'vitest';

import { NavigationProvider } from '../navigation/context';
import type { NavigationContextValue, RouteSearch, RouteToken } from '../navigation/types';

export interface StubQuery<T> {
  readonly data: T | undefined;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly isSuccess: boolean;
  readonly error: unknown;
  readonly refetch: () => void;
}

export function stubQuery<T>(overrides: Partial<StubQuery<T>>): StubQuery<T> {
  return {
    data: undefined,
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    refetch: vi.fn(),
    ...overrides,
  };
}

export const pendingRead = { isPending: true } as const;
export const forbiddenRead = { isError: true, error: { status: 403 } } as const;

function navigation(): NavigationContextValue {
  return {
    navigate: vi.fn(),
    resolvePath: <T extends RouteToken>(token: T, search?: RouteSearch<T>) => {
      const qs = search ? new URLSearchParams(search as Record<string, string>).toString() : '';
      return `/${token}${qs ? `?${qs}` : ''}`;
    },
    navigatePlugin: vi.fn(),
    resolvePluginPath: vi.fn(() => '/plugins'),
  };
}

export function renderWithNavigation(ui: ReactNode): ReturnType<typeof render> {
  return render(<NavigationProvider value={navigation()}>{ui}</NavigationProvider>);
}
