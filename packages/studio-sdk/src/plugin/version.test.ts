import { describe, expect, it } from 'vitest';

import { checkPluginApiVersion, STUDIO_PLUGIN_API_VERSION } from './version';

describe('STUDIO_PLUGIN_API_VERSION', () => {
  it('is 3', () => {
    expect(STUDIO_PLUGIN_API_VERSION).toBe(3);
  });
});

describe('checkPluginApiVersion', () => {
  it('accepts a plugin targeting the exact current version', () => {
    const result = checkPluginApiVersion(STUDIO_PLUGIN_API_VERSION, STUDIO_PLUGIN_API_VERSION);
    expect(result.ok).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('rejects a LOWER targeted version', () => {
    const result = checkPluginApiVersion(STUDIO_PLUGIN_API_VERSION - 1, STUDIO_PLUGIN_API_VERSION);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('must be rebuilt');
  });

  it('rejects a HIGHER targeted version (equality, not <=)', () => {
    // A `<=` implementation would wrongly accept this; the gate must be exact.
    const result = checkPluginApiVersion(STUDIO_PLUGIN_API_VERSION + 1, STUDIO_PLUGIN_API_VERSION);
    expect(result.ok).toBe(false);
  });
});
