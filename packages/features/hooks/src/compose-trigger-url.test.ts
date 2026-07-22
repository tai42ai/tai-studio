/**
 * The absolute-URL composition, both branches: a configured (split-origin) base
 * wins and targets the API origin; an empty base falls back to the same-origin
 * `window.location.origin`. A trailing slash on the base is stripped so the join
 * never double-slashes (`trigger_path` always starts with `/`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { composeTriggerUrl } from './compose-trigger-url';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('composeTriggerUrl', () => {
  it('uses a configured absolute base (split-origin) over the page origin', () => {
    vi.stubGlobal('window', { location: { origin: 'https://studio.example.com' } });
    expect(composeTriggerUrl('https://api.example.com', '/trigger/trg-abc')).toBe(
      'https://api.example.com/trigger/trg-abc',
    );
  });

  it('falls back to window.location.origin for a same-origin (empty) base', () => {
    vi.stubGlobal('window', { location: { origin: 'https://studio.example.com' } });
    expect(composeTriggerUrl('', '/trigger/trg-abc')).toBe(
      'https://studio.example.com/trigger/trg-abc',
    );
  });

  it('strips a trailing slash on the base so the join never double-slashes', () => {
    vi.stubGlobal('window', { location: { origin: 'https://studio.example.com' } });
    expect(composeTriggerUrl('https://api.example.com/', '/trigger/trg-abc')).toBe(
      'https://api.example.com/trigger/trg-abc',
    );
    // Encodes the composed string verbatim — no path normalization.
    expect(composeTriggerUrl('https://api.example.com//', '/trigger/trg-abc')).toBe(
      'https://api.example.com/trigger/trg-abc',
    );
  });
});
