/**
 * A badge's label clears the 4.5:1 body-text floor on every row ground it is drawn
 * over, in both themes, computed from the token values so it can never drift into
 * a comment.
 *
 * A badge paints a TRANSLUCENT tint, so what its label is read against is the tint
 * composited over whatever row sits under it, and the row may be tinted itself:
 *
 *  - a table row at rest shows the page or panel ground through it;
 *  - a hovered row, and a row a screen marks as highlighted, take the accent tint;
 *  - a JSON diff row takes its kind's semantic tint and carries the badge naming
 *    that kind.
 *
 * Each of those is checked over the three grounds a table is laid on (the page,
 * the surface and a raised panel such as a card or a dialog). The badge pairs and
 * the hover ground are read from the sheet, and the diff rows from a rendered
 * `JsonDiff`, so a change to either is held to the same floor.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { JsonDiff } from './json-diff';
import { declarationsOf, readRules, withoutComments } from './test-css-reader';

const here = dirname(fileURLToPath(import.meta.url));
const tokenSheet = withoutComments(readFileSync(resolve(here, 'tokens.css'), 'utf8'));
const sheet = readRules(readFileSync(resolve(here, 'components.css'), 'utf8'));

/** The WCAG floor for a badge label: 11 px normal-weight text is body text. */
const FLOOR = 4.5;

type Theme = 'light' | 'dark';
type Rgba = readonly [number, number, number, number];

/** The value a token is authored with in the base block, for one theme. */
function authored(token: string, theme: Theme): string {
  const name = theme === 'dark' ? token.replace('--tai-color-', '--tai-dark-color-') : token;
  const match = new RegExp(`${name}:\\s*([^;]+);`).exec(tokenSheet);
  if (match?.[1] !== undefined) return match[1].trim();
  // A token with no dark twin takes its light value in both themes.
  if (theme === 'dark') return authored(token, 'light');
  throw new Error(`no authored value for ${token}`);
}

/** A colour value — a literal, or a `var()` alias of another token — as RGBA. */
function resolveColour(value: string, theme: Theme): Rgba {
  const alias = /^var\((--tai-color-[\w-]+)\)$/.exec(value);
  if (alias?.[1] !== undefined) return resolveColour(authored(alias[1], theme), theme);
  const hex = /^#([0-9a-fA-F]{6})$/.exec(value);
  if (hex?.[1] !== undefined) {
    const digits = hex[1];
    const at = (start: number): number => parseInt(digits.slice(start, start + 2), 16);
    return [at(0), at(2), at(4), 1];
  }
  const rgba = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(value);
  if (rgba !== null) {
    return [Number(rgba[1]), Number(rgba[2]), Number(rgba[3]), Number(rgba[4])];
  }
  throw new Error(`cannot resolve colour ${value}`);
}

/** `top` painted over an opaque `under`. */
function over(top: Rgba, under: Rgba): Rgba {
  const alpha = top[3];
  return [
    top[0] * alpha + under[0] * (1 - alpha),
    top[1] * alpha + under[1] * (1 - alpha),
    top[2] * alpha + under[2] * (1 - alpha),
    1,
  ];
}

function relativeLuminance(colour: Rgba): number {
  const channel = (eightBit: number): number => {
    const srgb = eightBit / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(colour[0]) + 0.7152 * channel(colour[1]) + 0.0722 * channel(colour[2]);
}

function contrast(a: Rgba, b: Rgba): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Whether a rule sits under no condition: inside the component layer and nothing else. */
function unconditional(context: readonly string[]): boolean {
  return context.every((at) => at.startsWith('@layer'));
}

/** The single value one exact selector declares for `property` under no condition. */
function declared(selector: string, property: string): string | undefined {
  const values = sheet
    .filter((rule) => unconditional(rule.context) && rule.selectors.includes(selector))
    .flatMap((rule) => declarationsOf(rule.body))
    .filter((declaration) => declaration.property === property)
    .map((declaration) => declaration.value);
  if (values.length > 1) throw new Error(`${selector} declares ${property} more than once`);
  return values[0];
}

/** A badge class list's tint and label, the modifier's declaration over the base's. */
function badgePair(classes: string): { background: string; color: string } {
  const pick = (property: string): string => {
    const value = classes
      .split(' ')
      .reverse()
      .map((className) => declared(`.${className}`, property))
      .find((one) => one !== undefined);
    if (value === undefined) throw new Error(`${classes} declares no ${property}`);
    return value;
  };
  return { background: pick('background'), color: pick('color') };
}

/** The class list of every badge variant the `Badge` component draws. */
const BADGE_CLASSES = [
  'tai-badge',
  'tai-badge tai-badge-neutral',
  'tai-badge tai-badge-ok',
  'tai-badge tai-badge-warn',
  'tai-badge tai-badge-err',
];

/** The ground under a hovered table row, read from the sheet's hover rule. */
function hoverGround(): string {
  const rule = sheet.find((one) =>
    one.selectors.some(
      (selector) => selector.startsWith('.tai-table tbody tr') && selector.endsWith(':hover'),
    ),
  );
  const value = rule === undefined ? undefined : declarationsOf(rule.body)[0];
  if (value?.property !== 'background') throw new Error('no table row hover ground');
  return value.value;
}

/** Every JSON diff row a rendered `JsonDiff` draws: its row class and its badge's classes. */
function diffRows(): { row: string; badge: string }[] {
  const { container, unmount } = render(
    <JsonDiff before={{ kept: 1, gone: 1 }} after={{ kept: 2, fresh: 1 }} />,
  );
  const rows = [...container.querySelectorAll('tbody tr')].map((tr) => {
    const badge = tr.querySelector('.tai-badge');
    if (badge === null) throw new Error('a diff row carries no badge');
    return { row: tr.className, badge: badge.className };
  });
  unmount();
  return rows;
}

/** The grounds a table is laid on: the page, the surface and a raised panel. */
const GROUNDS = ['--tai-color-bg', '--tai-color-surface', '--tai-color-surface-raised'];

const THEMES: Theme[] = ['light', 'dark'];

interface Case {
  readonly theme: Theme;
  readonly ground: string;
  readonly row: string;
  readonly badge: string;
  readonly rowTint: string | undefined;
}

function cases(): Case[] {
  const hover = hoverGround();
  const diff = diffRows();
  return THEMES.flatMap((theme) =>
    GROUNDS.flatMap((ground) => [
      ...BADGE_CLASSES.map((badge) => ({ theme, ground, row: 'rest', badge, rowTint: undefined })),
      ...BADGE_CLASSES.map((badge) => ({
        theme,
        ground,
        row: 'hovered or highlighted',
        badge,
        rowTint: hover,
      })),
      ...diff.map(({ row, badge }) => ({
        theme,
        ground,
        row,
        badge,
        rowTint: declared(`.${row}`, 'background'),
      })),
    ]),
  );
}

describe('badge label contrast over every row ground', () => {
  it('reads a real set of row states', () => {
    expect(hoverGround()).toBe('var(--tai-color-accent-tint)');
    expect(
      diffRows()
        .map(({ row }) => row)
        .sort(),
    ).toEqual(['tai-diff-added', 'tai-diff-changed', 'tai-diff-removed']);
  });

  it.each(cases())(
    '$theme, $ground, $row row: $badge clears the floor',
    ({ theme, ground, badge, rowTint }) => {
      const base = resolveColour(authored(ground, theme), theme);
      const row = rowTint === undefined ? base : over(resolveColour(rowTint, theme), base);
      const { background, color } = badgePair(badge);
      const fill = over(resolveColour(background, theme), row);
      const label = over(resolveColour(color, theme), fill);
      expect(contrast(label, fill)).toBeGreaterThanOrEqual(FLOOR);
    },
  );
});
