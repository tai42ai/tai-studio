/** The query-key factory pins the tuples the hooks surface shares with settings. */
import { describe, expect, it } from 'vitest';

import { tokensPayloadKey } from './keys';

describe('hooks query keys', () => {
  // Settings' key-mint invalidates this exact tuple.
  it('re-exports the shared api-key tuple', () => {
    expect(tokensPayloadKey).toEqual(['auth-tokens-payload']);
  });
});
