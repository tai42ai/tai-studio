/**
 * A date RANGE drawn as ONE control. The platform declares a range as two
 * `string`/`format: date` properties where the END names its START in `rangeStart`;
 * the answer stays the two date strings, nothing is recombined. Where a pair is
 * drawable as one control (below), `ObjectFields` renders this {@link DateRangeField}
 * — a group with the two ends' labels over two native date inputs — at the START's
 * slot and skips the END; otherwise the two properties draw as two ordinary date
 * fields (a documented, valid layout).
 *
 * {@link dateRangePairs} is the ONE definition of "drawable as one control", reused
 * by every surface so each surface's merge decision agrees.
 */
import type { ReactNode } from 'react';

import { Field } from '../components/field';
import { TextInput } from '../components/inputs';
import type { JsonSchema } from './types';

/** A START/END pair drawable as one range control, resolved off a page's properties. */
export interface DateRangePair {
  readonly startName: string;
  readonly startSchema: JsonSchema;
  readonly endName: string;
  readonly endSchema: JsonSchema;
}

/** A property's `visibleWhen` as a stable key for deep-equality (absent ⇒ `''`). */
function visibilityKey(schema: JsonSchema): string {
  return schema.visibleWhen === undefined ? '' : JSON.stringify(schema.visibleWhen);
}

function isDateString(schema: JsonSchema): boolean {
  return schema.format === 'date';
}

/**
 * The date-range pairs among `properties` that are drawable as ONE control. A pair
 * qualifies when: the END names an existing sibling START in `rangeStart`; BOTH are
 * `format: date`; both carry the SAME `visibleWhen` (deep-equal, or both absent); AND
 * no OTHER field's `visibleWhen` names either end — otherwise merging the pair would
 * leave that field's predicate pointing at a control that no longer draws on its own,
 * so the pair stays two date fields (the documented degrade). `properties` is ONE
 * page's ordered list; a field is used in at most one pair.
 */
export function dateRangePairs(
  properties: readonly (readonly [string, JsonSchema])[],
): readonly DateRangePair[] {
  const byName = new Map<string, JsonSchema>(properties.map(([name, schema]) => [name, schema]));
  const pairs: DateRangePair[] = [];
  const paired = new Set<string>();

  for (const [endName, endSchema] of properties) {
    if (paired.has(endName)) continue;
    const startName = endSchema.rangeStart;
    if (typeof startName !== 'string' || startName === endName || paired.has(startName)) continue;
    const startSchema = byName.get(startName);
    if (startSchema === undefined) continue;
    if (!isDateString(startSchema) || !isDateString(endSchema)) continue;
    if (visibilityKey(startSchema) !== visibilityKey(endSchema)) continue;
    const dependedOn = properties.some(
      ([name, schema]) =>
        name !== startName &&
        name !== endName &&
        typeof schema.visibleWhen?.field === 'string' &&
        (schema.visibleWhen.field === startName || schema.visibleWhen.field === endName),
    );
    if (dependedOn) continue;
    pairs.push({ startName, startSchema, endName, endSchema });
    paired.add(startName);
    paired.add(endName);
  }
  return pairs;
}

/** The field's own `title`, else its property name. */
function titleOf(schema: JsonSchema, name: string): string {
  return typeof schema.title === 'string' && schema.title.length > 0 ? schema.title : name;
}

/** One end of the range: a labelled native date input emitting the date string. */
function RangeEnd({
  heading,
  schema,
  value,
  required,
  error,
  onChange,
}: {
  heading: string;
  schema: JsonSchema;
  value: unknown;
  required: boolean;
  error: string | undefined;
  onChange: (value: unknown) => void;
}): ReactNode {
  const current = typeof value === 'string' ? value : '';
  return (
    <Field label={heading} error={error}>
      <TextInput
        type="date"
        // The native control enforces its inclusive bounds; the validator enforces
        // the rest (unavailable days, the range span) that the control cannot draw.
        min={typeof schema.minDate === 'string' ? schema.minDate : undefined}
        max={typeof schema.maxDate === 'string' ? schema.maxDate : undefined}
        required={required}
        value={current}
        onChange={(event) => {
          const next = event.target.value;
          // An empty optional end drops its key; a required one keeps the empty
          // string so the validator can flag it.
          onChange(next === '' && !required ? undefined : next);
        }}
      />
    </Field>
  );
}

export function DateRangeField({
  pair,
  startValue,
  endValue,
  startRequired,
  endRequired,
  markRequired,
  startError,
  endError,
  onChangeStart,
  onChangeEnd,
}: {
  readonly pair: DateRangePair;
  readonly startValue: unknown;
  readonly endValue: unknown;
  readonly startRequired: boolean;
  readonly endRequired: boolean;
  readonly markRequired: boolean;
  readonly startError: string | undefined;
  readonly endError: string | undefined;
  readonly onChangeStart: (value: unknown) => void;
  readonly onChangeEnd: (value: unknown) => void;
}): ReactNode {
  const startTitle = titleOf(pair.startSchema, pair.startName);
  const endTitle = titleOf(pair.endSchema, pair.endName);
  const mark = (title: string, required: boolean): string =>
    markRequired && required ? `${title} *` : title;
  return (
    <Field label={`${startTitle} – ${endTitle}`} group>
      <div className="tai-row">
        <RangeEnd
          heading={mark(startTitle, startRequired)}
          schema={pair.startSchema}
          value={startValue}
          required={startRequired}
          error={startError}
          onChange={onChangeStart}
        />
        <RangeEnd
          heading={mark(endTitle, endRequired)}
          schema={pair.endSchema}
          value={endValue}
          required={endRequired}
          error={endError}
          onChange={onChangeEnd}
        />
      </div>
    </Field>
  );
}
