import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { __resetContributions, getContributions, loadPlugin } from '../plugin/registry';
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

/** Strict accessors for the optional-typed surface — THIS host always provides
 *  both; absence would be a real regression, so throw rather than skip. */
const liveEditors = (): ReadonlyMap<string, ExpressionEditorContribution> => {
  const editors = getContributions().expressionEditors;
  if (editors === undefined) throw new Error('this host must provide expressionEditors');
  return editors;
};
const registerStrict = (
  ctx: { registerExpressionEditor?: (c: ExpressionEditorContribution) => void },
  contribution: ExpressionEditorContribution,
): void => {
  if (ctx.registerExpressionEditor === undefined) {
    throw new Error('this host must provide registerExpressionEditor');
  }
  ctx.registerExpressionEditor(contribution);
};

describe('useExpressionEditor — live registry (the bridge wiring end to end)', () => {
  afterEach(() => {
    __resetContributions();
  });

  it('a hook mounted BEFORE the load pass sees the editor after commit + re-render', async () => {
    // Mirrors the production sequence on a core route (which never waits for the
    // load pass): the field mounts against the pre-commit registry map, the load
    // pass commits an editor, the bridge re-renders on the status flip and hands
    // the provider the (reassigned) map — the mounted hook must upgrade.
    const wrapper = ({ children }: { children: ReactNode }) => (
      <ExpressionEditorsProvider editors={liveEditors()}>{children}</ExpressionEditorsProvider>
    );
    const { result, rerender } = renderHook(() => useExpressionEditor('jq'), { wrapper });
    expect(result.current).toBeNull();

    await act(async () => {
      await loadPlugin('acme', (ctx) => {
        registerStrict(ctx, {
          language: 'jq',
          contractVersion: EXPRESSION_EDITOR_CONTRACT_VERSION,
          load: () => Promise.resolve({ Editor: () => null }),
        });
      });
    });
    rerender();
    expect(result.current?.language).toBe('jq');
  });
});
