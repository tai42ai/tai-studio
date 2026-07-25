/**
 * The api-client's read-only `baseUrl` surface: it must reflect the constructor's
 * configured base VERBATIM, in both branches — a configured absolute origin and
 * the same-origin empty string. Features that compose an absolute API URL (the QR
 * trigger-link path) read this rather than assuming same-origin, so a drift here
 * would silently retarget those URLs.
 */
import { describe, expect, it } from 'vitest';

import { createApiClient } from './client';

describe('api-client baseUrl exposure', () => {
  it('reflects a configured absolute base verbatim', () => {
    const client = createApiClient({ getToken: () => null, baseUrl: 'https://api.example.com' });
    expect(client.baseUrl).toBe('https://api.example.com');
  });

  it('reflects a configured base with a trailing slash verbatim (no normalization)', () => {
    const client = createApiClient({ getToken: () => null, baseUrl: 'https://api.example.com/' });
    expect(client.baseUrl).toBe('https://api.example.com/');
  });

  it('is the empty string for a same-origin (unset) base', () => {
    expect(createApiClient({ getToken: () => null }).baseUrl).toBe('');
    expect(createApiClient({ getToken: () => null, baseUrl: '' }).baseUrl).toBe('');
  });
});
