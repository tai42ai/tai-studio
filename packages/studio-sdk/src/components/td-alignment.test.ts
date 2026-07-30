/**
 * The td vertical-alignment guard.
 *
 * The flows-list misalignment (a 36px centered action button beside top-aligned
 * text cells) traced to a single rule: `.tai-table td` set `vertical-align: top`.
 * The fix is `middle`. `components.css` legitimately uses `top`/`bottom` in OTHER
 * rules (`.tai-prose td`, `.tai-table th`), so a whole-file contains-check would
 * false-green — this reads the EXACT `.tai-table td` rule block and asserts THAT
 * block aligns to `middle`, the same spirit as the skeleton's DDL text guards.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { declarationsOf, readRules } from './test-css-reader';

const here = dirname(fileURLToPath(import.meta.url));
const stylesheet = readFileSync(resolve(here, 'components.css'), 'utf8');

describe('.tai-table td vertical alignment', () => {
  it('centers table body cells (vertical-align: middle), not top', () => {
    const rule = readRules(stylesheet).find((r) => r.selector.trim() === '.tai-table td');
    if (rule === undefined) throw new Error('the `.tai-table td` rule must exist');
    const alignment = declarationsOf(rule.body).find((d) => d.property === 'vertical-align');
    expect(alignment?.value).toBe('middle');
  });
});
