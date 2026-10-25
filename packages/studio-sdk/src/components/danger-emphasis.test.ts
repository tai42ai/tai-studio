/**
 * The destructive-emphasis contract, computed from the token hex values so it can
 * never drift into a comment. A destructive fill that shares the brand accent's
 * ramp reads as the primary action — the exact confusion these assertions forbid:
 *
 *  - the destructive label clears the 4.5:1 body-text floor on the destructive fill, in both
 *    themes, so the button is legible;
 *  - the destructive fill runs DARKER than the accent fill in both themes, so a
 *    destructive control is told apart from a primary one by lightness alone —
 *    the dark half is the one at risk of a destructive fill reading LIGHTER than the
 *    accent and nearly identical to it, which this half forbids;
 *  - the hover is a shade deeper than the rest, in both themes, so the pressed
 *    state reads as intent rather than a second colour.
 *
 * The accent (brand primary) is read only as the thing the destructive fill must differ from;
 * nothing here touches it.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const tokensCss = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), 'tokens.css'),
  'utf8',
);

/** The literal hex a token is authored with in the base `:root` block. */
function hexOf(token: string): string {
  const match = new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})`).exec(tokensCss);
  if (match?.[1] === undefined) throw new Error(`no literal hex for ${token}`);
  return match[1];
}

/** The WCAG relative luminance of a `#rrggbb` colour. */
function relativeLuminance(hex: string): number {
  const channel = (eightBit: number): number => {
    const srgb = eightBit / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  const r = channel(parseInt(hex.slice(1, 3), 16));
  const g = channel(parseInt(hex.slice(3, 5), 16));
  const b = channel(parseInt(hex.slice(5, 7), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The WCAG contrast ratio between two `#rrggbb` colours. */
function contrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const THEMES = [
  { name: 'light', suffix: '' },
  { name: 'dark', suffix: '-dark' },
] as const;

/** Resolve one destructive role token for a theme; the light half has no `-dark` twin. */
function destructive(member: string, suffix: string): string {
  return suffix === '' ? hexOf(`--tai-color-${member}`) : hexOf(`--tai-dark-color-${member}`);
}

function accent(suffix: string): string {
  return suffix === '' ? hexOf('--tai-color-accent') : hexOf('--tai-dark-color-accent');
}

describe('destructive emphasis is distinct from the brand primary', () => {
  it.each(THEMES)(
    '$name: the destructive label clears 4.5:1 on the destructive fill',
    ({ suffix }) => {
      const fill = destructive('destructive', suffix);
      const label = destructive('on-destructive', suffix);
      expect(contrast(fill, label)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(THEMES)('$name: the destructive fill runs darker than the accent fill', ({ suffix }) => {
    // Lightness alone separates the two: a reader never has to resolve the hue to
    // tell a destructive button from a primary one.
    expect(relativeLuminance(destructive('destructive', suffix))).toBeLessThan(
      relativeLuminance(accent(suffix)),
    );
    // …and they are not the same colour to begin with.
    expect(destructive('destructive', suffix)).not.toBe(accent(suffix));
  });

  it.each(THEMES)('$name: the destructive hover is a shade deeper than the rest', ({ suffix }) => {
    expect(relativeLuminance(destructive('destructive-hover', suffix))).toBeLessThan(
      relativeLuminance(destructive('destructive', suffix)),
    );
  });

  it.each(THEMES)('$name: the destructive fill still stands off its page ground', ({ suffix }) => {
    // A solid destructive button must read as a control against the page: the fill
    // clears the 3:1 WCAG 1.4.11 asks of a non-text boundary over the ground.
    const ground = suffix === '' ? hexOf('--tai-color-bg') : hexOf('--tai-dark-color-bg');
    expect(contrast(destructive('destructive', suffix), ground)).toBeGreaterThanOrEqual(3);
  });
});
