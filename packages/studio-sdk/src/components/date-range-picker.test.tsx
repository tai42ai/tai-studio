import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  DateRangePicker,
  DEFAULT_DATE_RANGE_PRESETS,
  formatRangeLabel,
  normalizeCustomRange,
  type DateRangeValue,
} from './date-range-picker';

/** A fixed local wall clock the clamp reads, so "now" is deterministic. */
const NOW = new Date('2026-08-02T15:00:00');

describe('normalizeCustomRange', () => {
  it('keeps an in-order past range, with an inclusive end minute', () => {
    const range = normalizeCustomRange('2026-01-10T08:00', '2026-01-10T09:30', NOW);
    expect(range.from).toBe(new Date('2026-01-10T08:00:00.000').toISOString());
    // The end runs to the final millisecond of the selected minute.
    const end = new Date(range.to);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it('swaps a reversed pair BEFORE clamping, never leaving a future end', () => {
    // `from` sits after now, `to` before it: clamp-then-swap would move the future
    // `from` onto the end and ship an instant past now. Swap-first cannot.
    const range = normalizeCustomRange('2026-08-02T20:00', '2026-08-02T10:00', NOW);
    expect(range.from).toBe(new Date('2026-08-02T10:00:00.000').toISOString());
    expect(range.to).toBe(NOW.toISOString());
    // The corrected invariant: the end never exceeds now.
    expect(new Date(range.to).getTime()).toBeLessThanOrEqual(NOW.getTime());
  });

  it('treats the end minute as inclusive to 23:59:59.999, not 23:59:00', () => {
    const farFuture = new Date('2030-01-01T00:00:00');
    const range = normalizeCustomRange('2026-08-01T00:00', '2026-08-02T23:59', farFuture);
    const end = new Date(range.to);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it('clamps a future end down to now even when the pair is already in order', () => {
    const range = normalizeCustomRange('2026-08-01T00:00', '2026-12-31T00:00', NOW);
    expect(range.to).toBe(NOW.toISOString());
  });

  it('clamps a future start down to now', () => {
    const range = normalizeCustomRange('2026-09-01T09:00', '2026-09-02T09:00', NOW);
    expect(range.from).toBe(NOW.toISOString());
    expect(range.to).toBe(NOW.toISOString());
  });

  it('raises on an unparseable input rather than defaulting silently', () => {
    expect(() => normalizeCustomRange('', '2026-08-02T10:00', NOW)).toThrow(/Invalid from/);
    expect(() => normalizeCustomRange('2026-08-02T10:00', 'not-a-date', NOW)).toThrow(/Invalid to/);
  });
});

describe('formatRangeLabel', () => {
  it('reads a preset token as its chip label', () => {
    expect(formatRangeLabel({ kind: 'relative', token: '24h' })).toBe('Last 24 hours');
    expect(formatRangeLabel({ kind: 'relative', token: '7d' })).toBe('Last 7 days');
  });

  it('derives a phrase for a relative token no preset carries', () => {
    expect(formatRangeLabel({ kind: 'relative', token: '2w' })).toBe('Last 2 weeks');
    expect(formatRangeLabel({ kind: 'relative', token: '1h' })).toBe('Last 1 hour');
  });

  it('raises on a token outside the grammar', () => {
    expect(() => formatRangeLabel({ kind: 'relative', token: 'nope' })).toThrow(
      /Invalid relative range token/,
    );
  });

  it('includes the YEAR of both ends, so a cross-year range is unambiguous', () => {
    const label = formatRangeLabel({
      kind: 'absolute',
      from: new Date('2026-12-31T22:00:00').toISOString(),
      to: new Date('2027-01-01T02:00:00').toISOString(),
    });
    expect(label).toContain('2026');
    expect(label).toContain('2027');
  });

  it('includes the year even for a same-year range', () => {
    const label = formatRangeLabel({
      kind: 'absolute',
      from: new Date('2026-03-01T09:00:00').toISOString(),
      to: new Date('2026-03-02T09:00:00').toISOString(),
    });
    expect(label).toContain('2026');
  });
});

describe('DateRangePicker', () => {
  const relativeValue: DateRangeValue = { kind: 'relative', token: '7d' };

  it('renders the preset chips inside a named group with accessible names', () => {
    render(
      <DateRangePicker
        value={relativeValue}
        onValueChange={() => undefined}
        aria-label="Trace window"
      />,
    );
    expect(screen.getByRole('group', { name: 'Trace window' })).toBeInTheDocument();
    for (const preset of DEFAULT_DATE_RANGE_PRESETS) {
      expect(screen.getByRole('button', { name: preset.label })).toBeInTheDocument();
    }
  });

  it('marks the active preset pressed and the others not', () => {
    render(<DateRangePicker value={relativeValue} onValueChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Last 24 hours' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('emits a relative token when a preset chip is clicked', async () => {
    const onValueChange = vi.fn();
    render(<DateRangePicker value={relativeValue} onValueChange={onValueChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Last 30 days' }));
    expect(onValueChange).toHaveBeenCalledWith({ kind: 'relative', token: '30d' });
  });

  it('disables Apply until both custom inputs are filled', () => {
    render(<DateRangePicker value={relativeValue} onValueChange={() => undefined} />);
    const apply = screen.getByRole('button', { name: 'Apply range' });
    expect(apply).toBeDisabled();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-08-02T10:00' } });
    expect(apply).toBeDisabled();
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-08-02T12:00' } });
    expect(apply).toBeEnabled();
  });

  it('emits a normalized absolute range on Apply (swap + clamp + inclusive end)', async () => {
    const onValueChange = vi.fn();
    render(<DateRangePicker value={relativeValue} onValueChange={onValueChange} now={() => NOW} />);
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-08-02T20:00' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-08-02T10:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Apply range' }));
    expect(onValueChange).toHaveBeenCalledWith({
      kind: 'absolute',
      from: new Date('2026-08-02T10:00:00.000').toISOString(),
      to: NOW.toISOString(),
    });
  });

  it('seeds the custom inputs from an absolute value', () => {
    const value: DateRangeValue = {
      kind: 'absolute',
      from: new Date('2026-08-01T08:30:00').toISOString(),
      to: new Date('2026-08-02T09:15:00').toISOString(),
    };
    render(<DateRangePicker value={value} onValueChange={() => undefined} />);
    expect(screen.getByLabelText('From')).toHaveValue('2026-08-01T08:30');
    expect(screen.getByLabelText('To')).toHaveValue('2026-08-02T09:15');
  });

  it('re-seeds the inputs when the caller swaps in a new absolute value', async () => {
    const valueA: DateRangeValue = {
      kind: 'absolute',
      from: new Date('2026-08-01T08:30:00').toISOString(),
      to: new Date('2026-08-02T09:15:00').toISOString(),
    };
    const valueC: DateRangeValue = {
      kind: 'absolute',
      from: new Date('2026-07-10T06:00:00').toISOString(),
      to: new Date('2026-07-11T18:45:00').toISOString(),
    };
    const onValueChange = vi.fn();
    const { rerender } = render(
      <DateRangePicker value={valueA} onValueChange={onValueChange} now={() => NOW} />,
    );
    expect(screen.getByLabelText('From')).toHaveValue('2026-08-01T08:30');

    // The caller replaces the controlled value while the picker stays mounted.
    rerender(<DateRangePicker value={valueC} onValueChange={onValueChange} now={() => NOW} />);
    expect(screen.getByLabelText('From')).toHaveValue('2026-07-10T06:00');
    expect(screen.getByLabelText('To')).toHaveValue('2026-07-11T18:45');

    // Apply emits the new value C, never the superseded draft A.
    await userEvent.click(screen.getByRole('button', { name: 'Apply range' }));
    expect(onValueChange).toHaveBeenCalledWith({
      kind: 'absolute',
      from: new Date('2026-07-10T06:00:00.000').toISOString(),
      to: new Date('2026-07-11T18:45:59.999').toISOString(),
    });
  });

  it('preserves an in-progress edit across a re-render carrying a value-equal value', async () => {
    const value: DateRangeValue = {
      kind: 'absolute',
      from: new Date('2026-08-01T08:30:00').toISOString(),
      to: new Date('2026-08-02T09:15:00').toISOString(),
    };
    // A far-future clock so the edited range is never clamped, keeping the emitted
    // instants exactly the typed ones.
    const now = () => new Date('2030-01-01T00:00:00');
    const onValueChange = vi.fn();
    const { rerender } = render(
      <DateRangePicker value={value} onValueChange={onValueChange} now={now} />,
    );
    expect(screen.getByLabelText('From')).toHaveValue('2026-08-01T08:30');

    // The user starts a custom edit, replacing only the From instant.
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-07-15T06:00' } });

    // An unrelated parent re-render ships a fresh value object whose from/to ISO
    // strings equal the original — a new identity carrying value-equal ends.
    rerender(
      <DateRangePicker
        value={{
          kind: 'absolute',
          from: new Date('2026-08-01T08:30:00').toISOString(),
          to: new Date('2026-08-02T09:15:00').toISOString(),
        }}
        onValueChange={onValueChange}
        now={now}
      />,
    );

    // The typed edit survives: a value-equal re-seed must NOT wipe the in-progress draft.
    expect(screen.getByLabelText('From')).toHaveValue('2026-07-15T06:00');
    expect(screen.getByLabelText('To')).toHaveValue('2026-08-02T09:15');

    // Apply emits the EDITED range, never the superseded original From.
    await userEvent.click(screen.getByRole('button', { name: 'Apply range' }));
    expect(onValueChange).toHaveBeenCalledWith({
      kind: 'absolute',
      from: new Date('2026-07-15T06:00:00.000').toISOString(),
      to: new Date('2026-08-02T09:15:59.999').toISOString(),
    });
  });

  it('echoes the active window as text with the year present', () => {
    const value: DateRangeValue = {
      kind: 'absolute',
      from: new Date('2026-08-01T08:30:00').toISOString(),
      to: new Date('2026-08-02T09:15:00').toISOString(),
    };
    render(<DateRangePicker value={value} onValueChange={() => undefined} />);
    expect(screen.getByRole('status')).toHaveTextContent('2026');
  });

  it('disables every control when disabled', () => {
    render(<DateRangePicker value={relativeValue} onValueChange={() => undefined} disabled />);
    expect(screen.getByRole('button', { name: 'Last 7 days' })).toBeDisabled();
    expect(screen.getByLabelText('From')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Apply range' })).toBeDisabled();
  });
});
