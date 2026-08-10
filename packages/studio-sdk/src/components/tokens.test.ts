import { describe, expect, it } from 'vitest';

import { TOKEN_NAMES } from './tokens';

describe('token contract', () => {
  it('pins the documented token names (styling API must not drift silently)', () => {
    expect(TOKEN_NAMES).toMatchSnapshot();
  });

  it('has no duplicate token names', () => {
    expect(new Set(TOKEN_NAMES).size).toBe(TOKEN_NAMES.length);
  });
});
