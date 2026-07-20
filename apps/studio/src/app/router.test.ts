/**
 * `safeInternalPath` — the login returnTo guard. Only an unambiguous same-origin
 * root-relative path may be redirected to after login; every backslash,
 * protocol-relative, control-character, or absolute-URL variant a browser could
 * normalize into a cross-origin open redirect must fall back to the default
 * landing route.
 */
import { describe, expect, it } from 'vitest';

import { safeInternalPath } from './router';
import { PATH } from './routes';

describe('safeInternalPath', () => {
  it('passes unambiguous internal paths through unchanged', () => {
    for (const path of [
      '/',
      '/tools',
      '/tools?tool=demo',
      '/observability?tab=tracing&status=error',
      '/plugins/acme/dashboard',
      '/settings#section',
      '/x/%2Fnot-a-separator', // a percent-encoded slash stays a path segment
    ]) {
      expect(safeInternalPath(path)).toBe(path);
    }
  });

  it('falls back to the default route when no target is given', () => {
    expect(safeInternalPath(undefined)).toBe(PATH.tools);
  });

  it('rejects protocol-relative targets', () => {
    for (const evil of ['//evil.com', '//evil.com/path', '///evil.com']) {
      expect(safeInternalPath(evil)).toBe(PATH.tools);
    }
  });

  it('rejects absolute URLs carrying a scheme and host', () => {
    for (const evil of [
      'https://evil.com',
      'http://evil.com/x',
      'javascript:alert(1)',
      'mailto:x@evil.com',
    ]) {
      expect(safeInternalPath(evil)).toBe(PATH.tools);
    }
  });

  it('rejects backslash targets a browser folds into `//host`', () => {
    for (const evil of [
      '/\\evil.com',
      '\\\\evil.com',
      '/\\/evil.com',
      '\\/evil.com',
      '/\\\\evil.com',
      '/path\\evil.com',
    ]) {
      expect(safeInternalPath(evil)).toBe(PATH.tools);
    }
  });

  it('rejects control-character tricks a browser strips before navigating', () => {
    for (const evil of ['/\t/evil.com', '/\n//evil.com', '/\r/evil.com', '/\u0000/evil.com']) {
      expect(safeInternalPath(evil)).toBe(PATH.tools);
    }
  });

  it('rejects values not rooted at a single leading slash', () => {
    for (const evil of ['evil.com', 'tools', ' /tools', '']) {
      expect(safeInternalPath(evil)).toBe(PATH.tools);
    }
  });
});
