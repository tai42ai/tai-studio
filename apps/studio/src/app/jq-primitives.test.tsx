/**
 * The one contract translation in the host's jq-studio primitive injection:
 * {@link JqBadge} maps jq-studio's Badge variant vocabulary onto the SDK `Badge`'s
 * before rendering it. jq-studio names its tints `err | info | neutral | ok | warn`
 * while the SDK `Badge` understands `neutral | primary | success | warning | danger`;
 * only `neutral` overlaps, so without this map jq-studio's `info` context chip (and
 * any `ok`/`warn`/`err` badge) would miss the SDK's `VARIANT_CLASS` and silently
 * paint neutral-gray. The SDK `Badge` echoes its resolved variant on `data-variant`,
 * so each row below asserts the tint the SDK actually paints.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { JqBadge } from './jq-primitives';

describe('JqBadge — jq-studio → SDK Badge variant translation', () => {
  it('maps every jq-studio tint variant onto the matching SDK variant', () => {
    const cases: readonly (readonly [string, string])[] = [
      ['info', 'primary'],
      ['ok', 'success'],
      ['warn', 'warning'],
      ['err', 'danger'],
      ['neutral', 'neutral'],
    ];
    for (const [jqVariant, sdkVariant] of cases) {
      const { unmount } = render(<JqBadge variant={jqVariant}>{jqVariant}</JqBadge>);
      expect(screen.getByText(jqVariant)).toHaveAttribute('data-variant', sdkVariant);
      unmount();
    }
  });

  it("translates the editor's info context chip to the SDK primary tint, not neutral-gray", () => {
    // The regression this fix closes: jq-studio renders <Badge variant="info">in: …</Badge>
    // for the context chip; a bare SDK Badge has no `info` and would fall to neutral.
    render(<JqBadge variant="info">in: auth context</JqBadge>);
    const chip = screen.getByText('in: auth context');
    expect(chip).toHaveAttribute('data-variant', 'primary');
    expect(chip).not.toHaveAttribute('data-variant', 'neutral');
  });

  it('passes an SDK-native variant through untouched (no double translation)', () => {
    // jq-studio's built-ins already emit SDK-native names (e.g. `success`); those are
    // not in the map and must reach the SDK Badge verbatim.
    render(<JqBadge variant="success">ok</JqBadge>);
    expect(screen.getByText('ok')).toHaveAttribute('data-variant', 'success');
  });

  it('passes an unknown variant through to the SDK Badge, which neutral-falls it back', () => {
    render(<JqBadge variant="mystery">x</JqBadge>);
    // Unmapped and non-SDK: JqBadge forwards it verbatim and the SDK Badge applies
    // its own neutral fallback — the tint is chosen by the SDK, not swallowed here.
    expect(screen.getByText('x')).toHaveAttribute('data-variant', 'mystery');
  });
});
