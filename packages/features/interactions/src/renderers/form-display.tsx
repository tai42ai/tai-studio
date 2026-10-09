/**
 * The display-only parts of a stepped form: a page's ordered display blocks
 * (headings, body text, images, and data slots) and a review step's generic readback of
 * entered values. Neither is an input control — they render alongside (or instead of, for
 * a review page) a page's fields.
 *
 * UNTRUSTED PAYLOADS: every block's `text`/`src`/`alt` arrives from the question source.
 * Text renders only as React-escaped text; an image `src` goes through the SDK's
 * scheme-gated {@link MediaImage} (loud block/failed notices), never a raw attribute.
 */
import type { DisplayBlock } from '@tai42/api-client';
import type { JsonSchema } from '@tai42/studio-sdk';
import { isFieldVisible, MediaImage } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import {
  displayBodyStyle,
  displayHeadingStyle,
  displayStackStyle,
  reviewListStyle,
  reviewRowStyle,
  reviewTermStyle,
  reviewValueStyle,
} from './renderer-styles';

/** The ordered display-only blocks on a page (headings, body text, images, slots). */
export function DisplayBlocks({
  blocks,
  slots,
}: {
  readonly blocks: readonly DisplayBlock[];
  readonly slots: Record<string, unknown>;
}): ReactNode {
  if (blocks.length === 0) return null;
  return (
    <div style={displayStackStyle} data-testid="form-display">
      {blocks.map((block, index) => (
        <DisplayBlockView key={index} block={block} slots={slots} />
      ))}
    </div>
  );
}

function DisplayBlockView({
  block,
  slots,
}: {
  readonly block: DisplayBlock;
  readonly slots: Record<string, unknown>;
}): ReactNode {
  // A `slot` names a data key whose current value the block shows in place of static text
  // (filled from the send data and/or a reaction's `display` update).
  const slotText =
    block.slot !== undefined && block.slot !== null ? slotValueText(slots[block.slot]) : undefined;

  if (block.kind === 'image') return renderDisplayImage(block);

  const text = slotText ?? (typeof block.text === 'string' ? block.text : '');
  if (text === '') return null;
  const style = block.kind === 'heading' ? displayHeadingStyle : displayBodyStyle;
  const testId =
    block.slot !== undefined && block.slot !== null ? `form-slot-${block.slot}` : undefined;
  return (
    <p style={style} data-testid={testId}>
      {text}
    </p>
  );
}

/** An image display block: the scheme-gated image, degrading to its alt text with no src. */
function renderDisplayImage(block: DisplayBlock): ReactNode {
  const src = typeof block.src === 'string' ? block.src : '';
  const alt = typeof block.alt === 'string' && block.alt.trim() !== '' ? block.alt : undefined;
  // Web can draw images; `MediaImage` scheme-gates the src (loud block/failed notices).
  // A block with no source degrades to its alt text as body, never a broken image.
  if (src !== '') return <MediaImage url={src} caption={alt} altFallback={alt ?? 'Image'} />;
  return alt !== undefined ? <p style={displayBodyStyle}>{alt}</p> : null;
}

/** A display slot's value as text (a computed total is a number); absent → undefined. */
function slotValueText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return toText(value);
}

/**
 * A review step's generic readback: each visible top-level field's label and the value
 * entered for it. A field hidden by its `visibleWhen` predicate is absent from
 * the readback, since it is absent from the answer the consumer receives.
 */
export function ReviewReadback({
  schema,
  value,
}: {
  readonly schema: JsonSchema;
  readonly value: Record<string, unknown>;
}): ReactNode {
  const rows = Object.entries(schema.properties ?? {}).filter(([, prop]) =>
    isFieldVisible(prop, value),
  );
  if (rows.length === 0) return null;
  return (
    <dl style={reviewListStyle} data-testid="form-review">
      {rows.map(([name, prop]) => (
        <div key={name} style={reviewRowStyle}>
          <dt style={reviewTermStyle}>{typeof prop.title === 'string' ? prop.title : name}</dt>
          <dd style={reviewValueStyle}>{formatReadbackValue(value[name])}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One answered value rendered for the review readback; an empty value reads as "—". */
function formatReadbackValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.map(toText).join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
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
