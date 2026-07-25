/** The door-display helper. The door itself is a server-derived string enum. */
import { describe, expect, it } from 'vitest';
import type { TriggerAuth } from '@tai42/api-client';

import { describeTriggerAuth } from './trigger-auth';

const DOORS: readonly TriggerAuth[] = [
  'public',
  'verifier',
  'token',
  'token+api_key',
  'out-of-service',
];

describe('describeTriggerAuth', () => {
  it('labels every door, distinguishing the token + api-key combo', () => {
    expect(describeTriggerAuth('public')).toBe('Public');
    expect(describeTriggerAuth('verifier')).toBe('Verifier-signed');
    expect(describeTriggerAuth('token')).toBe('QR token');
    expect(describeTriggerAuth('token+api_key')).toBe('QR token + api key');
    expect(describeTriggerAuth('out-of-service')).toBe('Out of service');
  });

  it('never renders a blank cell for any door', () => {
    for (const door of DOORS) {
      expect(describeTriggerAuth(door)).not.toBe('');
    }
  });
});
