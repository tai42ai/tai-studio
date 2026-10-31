import { describe, expect, it } from 'vitest';

import { ApiError } from './errors';
import { isMcpStarting, isMcpStartingError } from './mcp-failure';

describe('isMcpStarting', () => {
  it('reads a starting record as a start in progress', () => {
    expect(isMcpStarting({ category: 'starting' })).toBe(true);
  });

  it.each(['preset_store', 'auth', 'unreachable', 'error'])(
    'reads a %s record as a failure',
    (category) => {
      expect(isMcpStarting({ category })).toBe(false);
    },
  );

  it('reads a record without a category as a failure', () => {
    expect(isMcpStarting({})).toBe(false);
  });
});

describe('isMcpStartingError', () => {
  it('reads an ApiError carrying the mcp-server-starting code as a start in progress', () => {
    expect(isMcpStartingError(new ApiError('still starting', 503, 'mcp-server-starting'))).toBe(
      true,
    );
  });

  it('reads an ApiError with another code, or none, as no start in progress', () => {
    expect(isMcpStartingError(new ApiError('unreadable', 500, 'stored-preset-unreadable'))).toBe(
      false,
    );
    expect(isMcpStartingError(new ApiError('reloading', 503))).toBe(false);
    expect(isMcpStartingError(new ApiError('did not list its tools', 502))).toBe(false);
  });

  it('reads an error that is not an ApiError as no start in progress', () => {
    expect(isMcpStartingError(new Error('mcp-server-starting'))).toBe(false);
  });
});
