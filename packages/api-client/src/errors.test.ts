/** The structured-error readers: the holders of a refused rename or delete, and the
 *  stored preset a read could not walk. */
import { describe, expect, it } from 'vitest';

import { ApiError, holdersFromError, storedPresetFaultFromError } from './errors';

const holder = {
  kind: 'hook',
  tag: 'hooks',
  name: 'h',
  locator: { hook: 'h' },
  summary: "hook 'h' names 'jq/gate' at condition",
};

describe('holdersFromError', () => {
  it('reads the holders a 409 body carries', () => {
    const error = new ApiError('held by: …', 409, undefined, undefined, {
      error: 'held by: …',
      holders: [holder],
    });
    expect(holdersFromError(error)).toEqual([holder]);
  });

  it('answers null for a body without holders and for a non-ApiError', () => {
    expect(
      holdersFromError(new ApiError('boom', 500, undefined, undefined, { error: 'boom' })),
    ).toBeNull();
    expect(holdersFromError(new ApiError('boom', 500))).toBeNull();
    expect(holdersFromError(new Error('boom'))).toBeNull();
  });

  it('throws on a malformed holders list', () => {
    const error = new ApiError('held', 409, undefined, undefined, { holders: [{ kind: 'hook' }] });
    expect(() => holdersFromError(error)).toThrow();
  });
});

describe('storedPresetFaultFromError', () => {
  it('answers the preset name a stored-preset-unreadable error carries', () => {
    const error = new ApiError('unreadable', 500, 'stored-preset-unreadable', undefined, {
      error: 'unreadable',
      code: 'stored-preset-unreadable',
      preset: 'nightly',
    });
    expect(storedPresetFaultFromError(error)).toBe('nightly');
  });

  it('throws when the code is set but the preset name is missing or empty', () => {
    const missing = new ApiError('x', 500, 'stored-preset-unreadable', undefined, { error: 'x' });
    const empty = new ApiError('x', 500, 'stored-preset-unreadable', undefined, { preset: '' });
    expect(() => storedPresetFaultFromError(missing)).toThrow('carried no stored preset name');
    expect(() => storedPresetFaultFromError(empty)).toThrow('carried no stored preset name');
  });

  it('answers null for any other error', () => {
    expect(storedPresetFaultFromError(new ApiError('x', 500, 'other'))).toBeNull();
    expect(storedPresetFaultFromError(new Error('x'))).toBeNull();
  });
});
