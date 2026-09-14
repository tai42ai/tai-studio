/**
 * Unit tests for the pure connect-form helpers: the OAuth-result discriminator and
 * the start-connect args assembly.
 */
import { describe, expect, it } from 'vitest';
import type { ProviderView } from '@tai42/api-client';

import { buildConnectArgs, hasAuthorizeUrl } from './connect-dialog-model';

const provider = {
  id: 'acme',
  display_name: 'Acme',
  description: '',
  sub_services: [],
  config_fields: [
    { key: 'token', label: 'Token', required: true, secret: true },
    { key: 'region', label: 'Region', required: false, secret: false },
  ],
} as unknown as ProviderView;

describe('hasAuthorizeUrl', () => {
  it('is true when an authorize_url is present', () => {
    expect(hasAuthorizeUrl({ authorize_url: 'https://x' } as never)).toBe(true);
  });

  it('is false for a no-auth completion', () => {
    expect(hasAuthorizeUrl({ fanout: null } as never)).toBe(false);
  });
});

describe('buildConnectArgs', () => {
  it('trims the alias and spreads the enabled sub-services', () => {
    const args = buildConnectArgs(provider, '  work  ', new Set(['mail']), {});
    expect(args.alias).toBe('work');
    expect(args.enabled_sub_services).toEqual(['mail']);
    expect(args.config_values).toBeUndefined();
  });

  it('includes only filled config values', () => {
    const args = buildConnectArgs(provider, 'work', new Set(), { token: 'abc', region: '' });
    expect(args.config_values).toEqual({ token: 'abc' });
  });
});
