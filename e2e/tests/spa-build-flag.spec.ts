/**
 * The `SKIP_SPA_BUILD` resolution the webServer hands boot.sh. A default that
 * reuses `apps/studio/dist` serves whatever was built last, so a green suite
 * would say nothing about the working tree — and the exit code cannot tell the
 * two apart. This pins the resolution itself: build fresh unless the caller
 * explicitly opts out, and CI never opts out.
 */
import { test, expect } from '@playwright/test';
import { spaBuildFlag } from '../playwright.config';

test('a bare run builds the SPA from the working tree', () => {
  expect(spaBuildFlag({})).toBe('0');
});

test('an explicit opt-out reuses the prebuilt dist', () => {
  expect(spaBuildFlag({ SKIP_SPA_BUILD: '1' })).toBe('1');
});

test('any other value is not an opt-out', () => {
  expect(spaBuildFlag({ SKIP_SPA_BUILD: '0' })).toBe('0');
  expect(spaBuildFlag({ SKIP_SPA_BUILD: 'true' })).toBe('0');
  expect(spaBuildFlag({ SKIP_SPA_BUILD: '' })).toBe('0');
});

test('CI builds fresh even when asked to skip', () => {
  expect(spaBuildFlag({ CI: 'true', SKIP_SPA_BUILD: '1' })).toBe('0');
});
