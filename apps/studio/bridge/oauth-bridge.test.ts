/**
 * Unit tests for the OAuth bridge's anchored-root allow-list. The e2e coverage
 * only asserts REJECTION; these pin the ACCEPT branch too, so a regression that
 * loosens (or breaks) the matcher fails here. `isAllowedTarget` takes the allowed
 * root as a parameter, so each case fixes it explicitly rather than relying on the
 * build-time env default.
 */
import { describe, expect, it } from 'vitest';

import { isAllowedTarget } from './oauth-bridge';

const ROOT = 'tai42.ai';

describe('isAllowedTarget — accept branch', () => {
  it('accepts an https sub-domain of the allowed root', () => {
    expect(isAllowedTarget('https://a.tai42.ai', ROOT)).toBe(true);
  });

  it('accepts the exact allowed root over https', () => {
    expect(isAllowedTarget('https://tai42.ai', ROOT)).toBe(true);
  });
});

describe('isAllowedTarget — reject branch', () => {
  it('rejects a non-https origin', () => {
    expect(isAllowedTarget('http://a.tai42.ai', ROOT)).toBe(false);
  });

  it('rejects a URL carrying a path (not a bare origin)', () => {
    expect(isAllowedTarget('https://a.tai42.ai/evil', ROOT)).toBe(false);
  });

  it('rejects a URL carrying embedded credentials', () => {
    expect(isAllowedTarget('https://user:pw@a.tai42.ai', ROOT)).toBe(false);
  });

  it('rejects an unanchored suffix host (root as a left label)', () => {
    expect(isAllowedTarget('https://tai42.ai.evil.com', ROOT)).toBe(false);
  });

  it('rejects a host that merely ends with the root string', () => {
    expect(isAllowedTarget('https://eviltai42.ai', ROOT)).toBe(false);
  });
});
