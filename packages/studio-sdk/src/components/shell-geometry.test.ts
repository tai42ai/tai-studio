/**
 * The shell's fixed geometry is documented in TWO places — the published
 * `README.md` prose and `components.css` itself — and nothing joined them, so the
 * 232 px sidebar, the 72 px icon rail and the 56 px topbar could all be changed in
 * the sheet with the whole package suite green and the README quietly wrong. The
 * README↔sheet join `token-usage.test.ts` authors reads token TABLE ROWS whose
 * first cell matches `` `--tai-*` ``; the shell numbers live in a PROSE paragraph
 * and in a local `--shell-*` custom property, so that join steps straight past
 * them.
 *
 * This reconciles the two copies by DERIVATION, in both directions: the three
 * lengths the sheet actually renders must equal the three the README documents. A
 * change to either side reddens until the other is brought with it. There is no
 * third hand-written copy of the numbers here — that would be the very defect this
 * pins.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sheet = readFileSync(resolve(packageRoot, 'src/components/components.css'), 'utf8');
const readme = readFileSync(resolve(packageRoot, 'README.md'), 'utf8');

/** The one required capture group of `pattern`, as a number, or `undefined`. */
function pxOf(source: string, pattern: RegExp): number | undefined {
  const value = pattern.exec(source)?.[1];
  return value === undefined ? undefined : Number(value);
}

describe('shell geometry, sheet vs published README', () => {
  it('documents exactly the sidebar, rail and topbar the sheet renders', () => {
    // The two FIXED-width `.tai-shell` grids: the desktop sidebar and the icon
    // rail. The `.tai-shell` selector cannot match `.tai-shell-sidebar` (no `-`
    // after it), and the below-640 single-column grid has no fixed px so it is
    // not one of these. The wider is the sidebar, the narrower the rail — a
    // relation the values carry themselves, not one imposed by document order.
    const shellFixedColumns = [
      ...sheet.matchAll(
        /\.tai-shell\s*\{[^}]*?grid-template-columns:\s*(\d+)px\s+minmax\(0,\s*1fr\)/g,
      ),
    ].map((match) => Number(match[1]));
    expect(shellFixedColumns).toHaveLength(2);

    const sheetGeometry = {
      sidebar: Math.max(...shellFixedColumns),
      rail: Math.min(...shellFixedColumns),
      topbar: pxOf(sheet, /--shell-topbar-height:\s*(\d+)px/),
    };

    const documentedGeometry = {
      sidebar: pxOf(readme, /(\d+)\s*px sidebar/),
      rail: pxOf(readme, /(\d+)\s*px icon rail/),
      topbar: pxOf(readme, /(\d+)\s*px bar/),
    };

    // Every value was really found — a `undefined` on either side would let the
    // reconciliation pass by comparing two holes.
    expect(Object.values(sheetGeometry).every((value) => typeof value === 'number')).toBe(true);
    expect(Object.values(documentedGeometry).every((value) => typeof value === 'number')).toBe(
      true,
    );

    expect(sheetGeometry).toEqual(documentedGeometry);
  });
});
