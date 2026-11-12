/**
 * The display-only parts of a stepped form: a page's ordered display blocks
 * (headings, body text, images, and data slots) and a review step's generic readback of
 * entered values. Neither is an input control — they render alongside (or instead of, for
 * a review page) a page's fields.
 *
 * UNTRUSTED PAYLOADS: every block's `text`/`src`/`alt` and every reaction `display` value
 * arrives from the question source or its reaction handler. Text renders only as
 * React-escaped text; an image source (the block's `src` or a reaction's value for its
 * slot) goes through the SDK's scheme-gated {@link MediaImage} (loud block/failed
 * notices), never a raw attribute.
 */
import type { DisplayBlock } from '@tai42/api-client';
import type { JsonSchema } from '@tai42/studio-sdk';
import { fieldDrawingOrder, isFieldVisible, MediaImage } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import type { FormFieldWords } from './answer-schema';
import {
  displayBodyStyle,
  displayHeadingStyle,
  displayStackStyle,
  reviewListStyle,
  reviewRowStyle,
  reviewTermStyle,
  reviewValueStyle,
} from './renderer-styles';

/**
 * The ordered display-only blocks on a page (headings, body text, images, slots).
 * `sendValues` is the send data; `reactionDisplay` the merged `display` updates of the
 * reactions so far. A text slot shows the reaction's value when the reaction gave one,
 * else the send value, and the block's own `text` when that value is absent or `null`. An
 * image slot shows the reaction's value, else the block's own `src`, never the send value.
 */
export function DisplayBlocks({
  blocks,
  sendValues,
  reactionDisplay,
}: {
  readonly blocks: readonly DisplayBlock[];
  readonly sendValues: Record<string, unknown>;
  readonly reactionDisplay: Record<string, unknown>;
}): ReactNode {
  if (blocks.length === 0) return null;
  return (
    <div style={displayStackStyle} data-testid="form-display">
      {blocks.map((block, index) => (
        <DisplayBlockView
          key={index}
          block={block}
          sendValues={sendValues}
          reactionDisplay={reactionDisplay}
        />
      ))}
    </div>
  );
}

function DisplayBlockView({
  block,
  sendValues,
  reactionDisplay,
}: {
  readonly block: DisplayBlock;
  readonly sendValues: Record<string, unknown>;
  readonly reactionDisplay: Record<string, unknown>;
}): ReactNode {
  const reactionValue = slotEntry(reactionDisplay, block.slot);

  if (block.kind === 'image') {
    const image = renderDisplayImage(block, reactionValue);
    return block.slot !== null ? <div data-testid={`form-slot-${block.slot}`}>{image}</div> : image;
  }

  const slotValue = reactionValue !== undefined ? reactionValue : slotEntry(sendValues, block.slot);
  const text = slotValueText(slotValue) ?? (typeof block.text === 'string' ? block.text : '');
  if (text === '') return null;
  const style = block.kind === 'heading' ? displayHeadingStyle : displayBodyStyle;
  const testId = block.slot !== null ? `form-slot-${block.slot}` : undefined;
  return (
    <p style={style} data-testid={testId}>
      {text}
    </p>
  );
}

/**
 * An image display block: the scheme-gated image, degrading to its alt text with no
 * source. `reactionValue` is a reaction's value for the block's slot: absent keeps the
 * block's `src`; `null` or `''` clears the picture; any other value is the source.
 */
function renderDisplayImage(block: DisplayBlock, reactionValue: unknown): ReactNode {
  const src = imageSourceOf(block, reactionValue);
  const alt = typeof block.alt === 'string' && block.alt.trim() !== '' ? block.alt : undefined;
  // Web can draw images; `MediaImage` scheme-gates the src (loud block/failed notices).
  // A block with no source degrades to its alt text as body, never a broken image.
  if (src !== '') return <MediaImage url={src} caption={alt} altFallback={alt ?? 'Image'} />;
  return alt !== undefined ? <p style={displayBodyStyle}>{alt}</p> : null;
}

/** The source an image block draws; `''` when it has none. */
function imageSourceOf(block: DisplayBlock, reactionValue: unknown): string {
  if (reactionValue === undefined) return typeof block.src === 'string' ? block.src : '';
  if (reactionValue === null) return '';
  return toText(reactionValue);
}

/** The own entry for `slot` in `record`; no slot or no entry → undefined. */
function slotEntry(record: Record<string, unknown>, slot: string | null): unknown {
  return slot !== null && Object.hasOwn(record, slot) ? record[slot] : undefined;
}

/** A display slot's value as text (a computed total is a number); absent → undefined. */
function slotValueText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return toText(value);
}

/**
 * A review step's generic readback: each visible top-level field's label and the value
 * entered for it, in drawing order (each `timeOf` time right after its date). A field hidden by its `visibleWhen` predicate is absent from
 * the readback, since it is absent from the answer the consumer receives. A yes/no value
 * reads in the field's own `trueLabel` / `falseLabel` words, else "Yes" / "No".
 */
export function ReviewReadback({
  schema,
  value,
  fieldWording,
}: {
  readonly schema: JsonSchema;
  readonly value: Record<string, unknown>;
  readonly fieldWording: Readonly<Record<string, FormFieldWords>> | undefined;
}): ReactNode {
  const properties = schema.properties ?? {};
  const rows = fieldDrawingOrder(Object.keys(properties), properties)
    .map((name) => [name, properties[name]] as const)
    .filter((row): row is readonly [string, JsonSchema] => row[1] !== undefined)
    .filter(([, prop]) => isFieldVisible(prop, value));
  if (rows.length === 0) return null;
  return (
    <dl style={reviewListStyle} data-testid="form-review">
      {rows.map(([name, prop]) => (
        <div key={name} style={reviewRowStyle}>
          <dt style={reviewTermStyle}>{typeof prop.title === 'string' ? prop.title : name}</dt>
          <dd style={reviewValueStyle}>
            {formatReadbackValue(
              Object.hasOwn(value, name) ? value[name] : undefined,
              fieldWording !== undefined && Object.hasOwn(fieldWording, name)
                ? fieldWording[name]
                : undefined,
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * One answered value rendered for the review readback; an empty value reads as "—", a
 * yes/no value as the field's own words, else "Yes" / "No".
 */
function formatReadbackValue(value: unknown, words: FormFieldWords | undefined): string {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.map(toText).join(', ');
  if (typeof value === 'boolean')
    return value ? (words?.trueLabel ?? 'Yes') : (words?.falseLabel ?? 'No');
  return toText(value);
}

/** An arbitrary value as display text: primitives direct, objects/arrays as JSON. */
function toText(value: unknown): string {
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    default:
      return JSON.stringify(value);
  }
}
