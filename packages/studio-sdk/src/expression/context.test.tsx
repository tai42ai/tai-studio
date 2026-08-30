import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { ExpressionEditorsProvider, useExpressionEditor } from './context';
import { EXPRESSION_EDITOR_CONTRACT_VERSION, type ExpressionEditorContribution } from './types';

const editor = (language: string): ExpressionEditorContribution => ({
  language,
  contractVersion: EXPRESSION_EDITOR_CONTRACT_VERSION,
  load: () => Promise.resolve({ Editor: () => null }),
});

describe('useExpressionEditor', () => {
  it('returns null with no provider above it (graceful absence)', () => {
    const { result } = renderHook(() => useExpressionEditor('jq'));
    expect(result.current).toBeNull();
  });

  it('resolves the contribution for a registered language', () => {
    const jq = editor('jq');
    const editors = new Map([['jq', jq]]);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ExpressionEditorsProvider editors={editors}>{children}</ExpressionEditorsProvider>
    );
    const { result } = renderHook(() => useExpressionEditor('jq'), { wrapper });
    expect(result.current).toBe(jq);
  });

  it('returns null for a language no contribution covers, even under a provider', () => {
    const editors = new Map([['jq', editor('jq')]]);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ExpressionEditorsProvider editors={editors}>{children}</ExpressionEditorsProvider>
    );
    const { result } = renderHook(() => useExpressionEditor('jsonata'), { wrapper });
    expect(result.current).toBeNull();
  });

  it('resolves null under a provider with no editors at all', () => {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ExpressionEditorsProvider editors={new Map()}>{children}</ExpressionEditorsProvider>
    );
    const { result } = renderHook(() => useExpressionEditor('jq'), { wrapper });
    expect(result.current).toBeNull();
  });
});
