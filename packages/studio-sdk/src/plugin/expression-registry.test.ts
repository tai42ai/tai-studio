import { afterEach, describe, expect, it } from 'vitest';

import { __resetContributions, getContributions, loadPlugin } from './registry';
import {
  EXPRESSION_EDITOR_CONTRACT_VERSION,
  type ExpressionEditorContribution,
} from '../expression/types';

afterEach(() => {
  __resetContributions();
});

const editor = (
  language: string,
  contractVersion: number = EXPRESSION_EDITOR_CONTRACT_VERSION,
): ExpressionEditorContribution => ({
  language,
  contractVersion,
  load: () => Promise.resolve({ Editor: () => null }),
});

describe('plugin registry — registerExpressionEditor', () => {
  it('commits an editor keyed by its language', async () => {
    await loadPlugin('acme', (ctx) => {
      ctx.registerExpressionEditor(editor('jq'));
    });

    const editors = getContributions().expressionEditors;
    expect(editors.has('jq')).toBe(true);
    expect(editors.get('jq')?.language).toBe('jq');
  });

  it('turns the map identity over on commit — a mounted provider must be re-notified', async () => {
    // The provider memoizes its context value on the map's identity, so a field
    // mounted BEFORE the load pass (core routes never wait for it) only learns
    // about a committed editor through this turnover.
    const before = getContributions().expressionEditors;
    await loadPlugin('acme', (ctx) => {
      ctx.registerExpressionEditor(editor('jq'));
    });
    const after = getContributions().expressionEditors;
    expect(after).not.toBe(before);
    expect(before.has('jq')).toBe(false);
    expect(after.has('jq')).toBe(true);
  });

  it('keeps the map identity stable across a load that registers no editor', async () => {
    await loadPlugin('acme', (ctx) => {
      ctx.registerExpressionEditor(editor('jq'));
    });
    const before = getContributions().expressionEditors;
    await loadPlugin('globex', () => {
      // registers nothing
    });
    expect(getContributions().expressionEditors).toBe(before);
  });

  it('throws when one plugin registers the same language twice (staged)', async () => {
    await expect(
      loadPlugin('acme', (ctx) => {
        ctx.registerExpressionEditor(editor('jq'));
        ctx.registerExpressionEditor(editor('jq'));
      }),
    ).rejects.toThrow(/already registered for language jq/i);
  });

  it('throws when a second plugin claims a language another plugin already owns', async () => {
    await loadPlugin('acme', (ctx) => {
      ctx.registerExpressionEditor(editor('jq'));
    });
    // A language is a GLOBAL key — the committed-side guard rejects the second owner.
    await expect(
      loadPlugin('globex', (ctx) => {
        ctx.registerExpressionEditor(editor('jq'));
      }),
    ).rejects.toThrow(/already registered for language jq/i);
    // The first plugin's editor is the one that stands.
    expect(getContributions().expressionEditors.get('jq')?.language).toBe('jq');
  });

  it('rejects a contract-version mismatch loudly and commits nothing', async () => {
    await expect(
      loadPlugin('acme', (ctx) => {
        ctx.registerExpressionEditor(editor('jq', EXPRESSION_EDITOR_CONTRACT_VERSION + 1));
      }),
    ).rejects.toThrow(/must be rebuilt/i);
    // A mismatched contribution never claims the language, so a compatible editor
    // could still register afterwards.
    expect(getContributions().expressionEditors.has('jq')).toBe(false);
  });

  it('checks the contract version BEFORE the duplicate guard', async () => {
    // A compatible editor holds 'jq'; a later mismatched one for the same language
    // must fail on the version, not silently pass the duplicate check.
    await loadPlugin('acme', (ctx) => {
      ctx.registerExpressionEditor(editor('jq'));
    });
    await expect(
      loadPlugin('globex', (ctx) => {
        ctx.registerExpressionEditor(editor('jq', 99));
      }),
    ).rejects.toThrow(/must be rebuilt/i);
  });

  it('commits NOTHING when a register throws after staging an editor (atomicity)', async () => {
    await expect(
      loadPlugin('acme', (ctx) => {
        ctx.registerExpressionEditor(editor('jq'));
        throw new Error('boom after editor');
      }),
    ).rejects.toThrow(/boom after editor/);

    expect(getContributions().expressionEditors.has('jq')).toBe(false);
  });

  it('commits an editor from an async register that resolves after an await', async () => {
    await loadPlugin('acme', async (ctx) => {
      await Promise.resolve();
      ctx.registerExpressionEditor(editor('jq'));
    });

    expect(getContributions().expressionEditors.get('jq')?.language).toBe('jq');
  });

  it('throws "registration is closed" when an editor is registered after resolution', async () => {
    let deferred: () => void = () => undefined;
    await loadPlugin('acme', (ctx) => {
      deferred = () => {
        ctx.registerExpressionEditor(editor('jq'));
      };
    });

    expect(deferred).toThrow(/registration is closed/i);
    expect(getContributions().expressionEditors.has('jq')).toBe(false);
  });

  it('lets two plugins register editors for DIFFERENT languages', async () => {
    await loadPlugin('acme', (ctx) => {
      ctx.registerExpressionEditor(editor('jq'));
    });
    await loadPlugin('globex', (ctx) => {
      ctx.registerExpressionEditor(editor('jsonata'));
    });

    const editors = getContributions().expressionEditors;
    expect([...editors.keys()].sort()).toEqual(['jq', 'jsonata']);
  });
});
