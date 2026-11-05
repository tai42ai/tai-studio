/**
 * The two contract translations in the host's jq-studio primitive injection.
 *
 * {@link JqBadge} maps jq-studio's Badge variant vocabulary onto the SDK `Badge`'s
 * before rendering it. jq-studio names its tints `err | info | neutral | ok | warn`
 * while the SDK `Badge` understands `neutral | primary | success | warning | danger`;
 * only `neutral` overlaps, so without this map jq-studio's `info` context chip (and
 * any `ok`/`warn`/`err` badge) would miss the SDK's `VARIANT_CLASS` and silently
 * paint neutral-gray. The SDK `Badge` echoes its resolved variant on `data-variant`,
 * so each row below asserts the tint the SDK actually paints.
 *
 * {@link JqConfirmDialog} names a failure's report by the dialog's title, the one
 * name jq-studio's `ConfirmDialog` contract carries.
 */
import { ApiError, createApiClient } from '@tai42/api-client';
import { ApiProvider } from '@tai42/studio-sdk';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { JqBadge, JqConfirmDialog } from './jq-primitives';

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

describe('JqConfirmDialog — jq-studio ConfirmDialog onto the SDK', () => {
  const dialog = (error?: Error | string | null) => (
    <ApiProvider value={createApiClient({ getToken: () => null })}>
      <JqConfirmDialog
        title="Discard edits"
        confirmLabel="Discard"
        pendingLabel="Discarding"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        isPending={false}
        error={error}
      >
        Discard the edits?
      </JqConfirmDialog>
    </ApiProvider>
  );

  it('names a failed reply carrying a roll by the dialog title', () => {
    const failure = new ApiError('Internal Server Error', 500, undefined, undefined, {
      error: 'Internal Server Error',
      error_id: 'err-1',
      recycle: null,
      awaiting_respawn: [{ name: 'serve-a', keys: ['TAI_KEY'] }],
      roll_deferred: false,
      roll_deferred_to: null,
    });
    render(dialog(failure));
    expect(screen.getByText(/has settings it has not applied/)).toHaveTextContent(
      '1 worker has settings it has not applied — Discard edits',
    );
  });

  it('shows no failure when jq-studio passes none', () => {
    render(dialog());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Discard the edits?')).toBeInTheDocument();
  });
});
