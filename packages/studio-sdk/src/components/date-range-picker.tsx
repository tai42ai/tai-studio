/**
 * `DateRangePicker` — the compact time-window control observability screens share.
 * It emits ONE of two shapes:
 *
 * - a relative token from a PRESET chip, `{ kind: 'relative', token }` — the backend
 *   resolves `\d+[hdw]` tokens, so a preset stays a token rather than freezing to an
 *   instant at click time;
 * - an ABSOLUTE range from the two native `datetime-local` inputs,
 *   `{ kind: 'absolute', from, to }` with ISO instants — native inputs keep the
 *   control inside the platform date UI, no third-party calendar.
 *
 * Absolute ranges are normalized by {@link normalizeCustomRange}; the active window
 * is rendered by {@link formatRangeLabel}, always with the YEAR present.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';

import { Field } from './field';
import { TextInput } from './inputs';
import { Button } from './primitives';

/** A relative preset: a `\d+[hdw]` token the backend resolves, plus its chip label. */
export interface DateRangePreset {
  readonly token: string;
  readonly label: string;
}

/** The presets a picker offers when the caller names none. */
export const DEFAULT_DATE_RANGE_PRESETS: readonly DateRangePreset[] = [
  { token: '24h', label: 'Last 24 hours' },
  { token: '7d', label: 'Last 7 days' },
  { token: '30d', label: 'Last 30 days' },
  { token: '90d', label: 'Last 90 days' },
];

/**
 * A named time window: either a relative token the backend resolves against its
 * own clock, or an absolute pair of ISO instants.
 */
export type DateRangeValue =
  | { readonly kind: 'relative'; readonly token: string }
  | { readonly kind: 'absolute'; readonly from: string; readonly to: string };

const RELATIVE_TOKEN = /^(\d+)([hdw])$/;

const UNIT_NOUN: Record<string, string> = { h: 'hour', d: 'day', w: 'week' };

/**
 * A relative token as a readable phrase (`7d` → `Last 7 days`). A token outside the
 * `\d+[hdw]` grammar raises rather than rendering a silent placeholder.
 */
function relativePhrase(token: string): string {
  const match = RELATIVE_TOKEN.exec(token);
  if (match === null) {
    throw new Error(`Invalid relative range token: ${token}`);
  }
  const amount = Number(match[1]);
  const noun = UNIT_NOUN[match[2] ?? ''] ?? '';
  return `Last ${String(amount)} ${noun}${amount === 1 ? '' : 's'}`;
}

/**
 * The active window as human text: a relative token as its preset label (or a
 * derived phrase), an absolute range as both instants with the YEAR present.
 */
const ABSOLUTE_FORMAT = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatRangeLabel(
  value: DateRangeValue,
  presets: readonly DateRangePreset[] = DEFAULT_DATE_RANGE_PRESETS,
): string {
  if (value.kind === 'relative') {
    const preset = presets.find((candidate) => candidate.token === value.token);
    return preset?.label ?? relativePhrase(value.token);
  }
  const from = new Date(value.from);
  const to = new Date(value.to);
  return `${ABSOLUTE_FORMAT.format(from)} – ${ABSOLUTE_FORMAT.format(to)}`;
}

/** A `datetime-local` string parsed as a local instant, or a loud error on garbage. */
function parseLocalInput(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid ${field} datetime: ${value}`);
  }
  return parsed;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** A local instant as the `YYYY-MM-DDTHH:mm` a `datetime-local` input reads. */
function toLocalInputValue(date: Date): string {
  return (
    `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * A raw from/to pair resolved to a clean absolute range. Order matters: SWAP the
 * reversed pair first (earlier instant becomes start), THEN cap both ends at `now` —
 * capping first can leave a future instant on the post-swap end. The end is
 * INCLUSIVE of its minute, extended to `:59.999`, so `23:59` reaches the day's end.
 */
export function normalizeCustomRange(
  fromInput: string,
  toInput: string,
  now: Date,
): { readonly from: string; readonly to: string } {
  let start = parseLocalInput(fromInput, 'from');
  let end = parseLocalInput(toInput, 'to');

  if (start.getTime() > end.getTime()) {
    [start, end] = [end, start];
  }

  // Inclusive end: extend the selected minute to its final millisecond.
  end = new Date(end);
  end.setSeconds(59, 999);

  const nowMs = now.getTime();
  if (start.getTime() > nowMs) start = new Date(nowMs);
  if (end.getTime() > nowMs) end = new Date(nowMs);

  return { from: start.toISOString(), to: end.toISOString() };
}

export interface DateRangePickerProps {
  readonly value: DateRangeValue;
  readonly onValueChange: (value: DateRangeValue) => void;
  /** The preset chips to offer. Defaults to {@link DEFAULT_DATE_RANGE_PRESETS}. */
  readonly presets?: readonly DateRangePreset[];
  /** The control group's accessible name. */
  readonly 'aria-label'?: string;
  readonly disabled?: boolean;
  /**
   * The clock the absolute-range clamp reads. Defaults to the wall clock; a caller
   * (or a test) injects a fixed instant to pin the "no future" boundary.
   */
  readonly now?: () => Date;
}

const CUSTOM_ROW_STYLE: CSSProperties = { alignItems: 'flex-end' };
const FIELD_STYLE: CSSProperties = { flex: 1 };

/**
 * The range control: a row of preset chips over the two `datetime-local` inputs and
 * an Apply action, with the active window echoed as text below.
 *
 * Controlled: the caller owns `value` and receives the next window through
 * `onValueChange` — a preset click emits its token immediately, while the custom
 * inputs hold a working draft until Apply commits the normalized absolute range.
 *
 * The drafts track the controlled value, re-seeded on a NEW absolute `value` (keyed
 * on `from`/`to`), so edits against an unchanged value are preserved but a genuinely
 * different value replaces an in-progress draft.
 */
export function DateRangePicker({
  value,
  onValueChange,
  presets = DEFAULT_DATE_RANGE_PRESETS,
  'aria-label': ariaLabel = 'Date range',
  disabled = false,
  now = () => new Date(),
}: DateRangePickerProps): ReactNode {
  const nextFrom = value.kind === 'absolute' ? value.from : null;
  const nextTo = value.kind === 'absolute' ? value.to : null;

  const [fromDraft, setFromDraft] = useState(() =>
    nextFrom !== null ? toLocalInputValue(new Date(nextFrom)) : '',
  );
  const [toDraft, setToDraft] = useState(() =>
    nextTo !== null ? toLocalInputValue(new Date(nextTo)) : '',
  );
  // The absolute ends that last seeded the drafts (null while a preset is active).
  // Comparing against the incoming ends re-seeds only when the caller swaps in a
  // different absolute value, leaving drafts typed against an unchanged value alone.
  const [seeded, setSeeded] = useState<{ from: string | null; to: string | null }>(() => ({
    from: nextFrom,
    to: nextTo,
  }));

  if (seeded.from !== nextFrom || seeded.to !== nextTo) {
    setSeeded({ from: nextFrom, to: nextTo });
    if (nextFrom !== null && nextTo !== null) {
      setFromDraft(toLocalInputValue(new Date(nextFrom)));
      setToDraft(toLocalInputValue(new Date(nextTo)));
    }
  }

  const activeToken = value.kind === 'relative' ? value.token : null;
  const canApply = !disabled && fromDraft !== '' && toDraft !== '';

  const applyCustom = (): void => {
    onValueChange({ kind: 'absolute', ...normalizeCustomRange(fromDraft, toDraft, now()) });
  };

  return (
    <div role="group" aria-label={ariaLabel} className="tai-stack tai-stack-3">
      <div className="tai-row">
        {presets.map((preset) => (
          <button
            key={preset.token}
            type="button"
            className="tai-chip"
            aria-pressed={activeToken === preset.token}
            onClick={() => {
              onValueChange({ kind: 'relative', token: preset.token });
            }}
            disabled={disabled}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="tai-row" style={CUSTOM_ROW_STYLE}>
        <Field label="From" style={FIELD_STYLE}>
          <TextInput
            type="datetime-local"
            value={fromDraft}
            onChange={(event) => {
              setFromDraft(event.target.value);
            }}
            disabled={disabled}
          />
        </Field>
        <Field label="To" style={FIELD_STYLE}>
          <TextInput
            type="datetime-local"
            value={toDraft}
            onChange={(event) => {
              setToDraft(event.target.value);
            }}
            disabled={disabled}
          />
        </Field>
        <Button type="button" variant="primary" onClick={applyCustom} disabled={!canApply}>
          Apply range
        </Button>
      </div>

      <p role="status" className="tai-muted" style={{ margin: 0 }}>
        {formatRangeLabel(value, presets)}
      </p>
    </div>
  );
}
