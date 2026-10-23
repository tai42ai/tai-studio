/**
 * A date RANGE drawn as ONE control. The platform declares a range as two
 * `string`/`format: date` properties where the END names its START in `rangeStart`;
 * the answer stays the two date strings, nothing is recombined. Where a pair is
 * drawable as one control (below), `ObjectFields` renders this {@link DateRangeField}
 * — a group with one column per end, each the end's labelled native date input and,
 * when the end has a `timeOf` time, that time's own control under it — at the START's
 * slot and skips the END and the times; otherwise the properties draw as ordinary
 * fields, each time right after its date (a documented, valid layout).
 *
 * {@link dateRangePairs} is the ONE definition of "drawable as one control", and
 * {@link fieldDrawingOrder} the one drawing order, both reused by every surface so each
 * surface's merge decision and field order agree.
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
  /** The START's `timeOf` time property among the same properties, when it has one. */
  readonly startTimeName?: string;
  readonly startTimeSchema?: JsonSchema;
  /** The END's `timeOf` time property among the same properties, when it has one. */
  readonly endTimeName?: string;
  readonly endTimeSchema?: JsonSchema;
}

/**
 * `names` in drawing order: each `timeOf` time moved to sit right after the date it
 * names. `names` is one page's fields, or every property of a page-less form or a
 * readback, in their given order. A time moves only when the name it points at is in
 * `names` and does not itself point at another listed name; any other time (its date
 * not listed, a chain of times, a cycle) keeps its place. Every name appears exactly
 * once and every other name keeps its relative order. Pure and idempotent, so every
 * walker that orders the same list draws it the same way.
 */
export function fieldDrawingOrder(
  names: readonly string[],
  properties: Readonly<Record<string, JsonSchema>>,
): string[] {
  const listed = new Set(names);
  const targetOf = new Map<string, string>();
  for (const name of names) {
    const dateName = Object.hasOwn(properties, name) ? properties[name]?.timeOf : undefined;
    if (typeof dateName === 'string' && dateName !== name && listed.has(dateName)) {
      targetOf.set(name, dateName);
    }
  }
  const timesOf = new Map<string, string[]>();
  for (const name of names) {
    const dateName = targetOf.get(name);
    if (dateName === undefined || targetOf.has(dateName)) continue;
    const times = timesOf.get(dateName);
    if (times === undefined) timesOf.set(dateName, [name]);
    else times.push(name);
  }
  const moved = new Set([...timesOf.values()].flat());
  const ordered: string[] = [];
  for (const name of names) {
    if (moved.has(name)) continue;
    ordered.push(name);
    ordered.push(...(timesOf.get(name) ?? []));
  }
  return ordered;
}

/** The `timeOf` time paired with the date `dateName` among `properties`, if any. */
function pairedTime(
  dateName: string,
  properties: readonly (readonly [string, JsonSchema])[],
): readonly [string, JsonSchema] | undefined {
  return properties.find(([name, schema]) => schema.timeOf === dateName && name !== dateName);
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
 * page's ordered list; a field is used in at most one pair. Each pair also names each
 * end's `timeOf` time among the same properties, which draws inside the group.
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
    const startTime = pairedTime(startName, properties);
    const endTime = pairedTime(endName, properties);
    pairs.push({
      startName,
      startSchema,
      endName,
      endSchema,
      ...(startTime === undefined
        ? {}
        : { startTimeName: startTime[0], startTimeSchema: startTime[1] }),
      ...(endTime === undefined ? {} : { endTimeName: endTime[0], endTimeSchema: endTime[1] }),
    });
    paired.add(startName);
    paired.add(endName);
  }
  return pairs;
}

/** The field's own `title`, else its property name. */
function titleOf(schema: JsonSchema, name: string): string {
  return typeof schema.title === 'string' && schema.title.length > 0 ? schema.title : name;
}

/**
 * One end of the range, one column: a labelled native date input emitting the date
 * string, then the end's time control (when it has a `timeOf` time) under it.
 */
function RangeEnd({
  heading,
  schema,
  value,
  required,
  error,
  onChange,
  time,
}: {
  heading: string;
  schema: JsonSchema;
  value: unknown;
  required: boolean;
  error: string | undefined;
  onChange: (value: unknown) => void;
  time: ReactNode;
}): ReactNode {
  const current = typeof value === 'string' ? value : '';
  return (
    <div className="tai-stack tai-stack-3">
      <Field
        label={heading}
        description={typeof schema.description === 'string' ? schema.description : undefined}
        error={error}
      >
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
      {time}
    </div>
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
  startTime,
  endTime,
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
  /** The START's time control, drawn under its date; `null` when the end has no time. */
  readonly startTime: ReactNode;
  /** The END's time control, drawn under its date; `null` when the end has no time. */
  readonly endTime: ReactNode;
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
          time={startTime}
        />
        <RangeEnd
          heading={mark(endTitle, endRequired)}
          schema={pair.endSchema}
          value={endValue}
          required={endRequired}
          error={endError}
          onChange={onChangeEnd}
          time={endTime}
        />
      </div>
    </Field>
  );
}
