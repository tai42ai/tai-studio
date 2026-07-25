import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import type { ApiClient } from '@tai42/api-client';

import { ApiProvider, useApi } from './useApi';

const client = {} as unknown as ApiClient;

describe('useApi', () => {
  it('throws when used outside an ApiProvider', () => {
    expect(() => renderHook(() => useApi())).toThrow(/ApiProvider/);
  });

  it('returns the provided client inside an ApiProvider', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ApiProvider value={client}>{children}</ApiProvider>
    );
    const { result } = renderHook(() => useApi(), { wrapper });
    expect(result.current).toBe(client);
  });
});
