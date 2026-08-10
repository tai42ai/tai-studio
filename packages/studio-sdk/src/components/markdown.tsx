/**
 * `Markdown` — a safe renderer for the markdown agents emit, on the design
 * system's prose ground (`tai-prose`). Supports a deliberate subset (headings,
 * emphasis, lists, blockquotes, thematic breaks, links, inline and fenced code),
 * rendered entirely through React elements and text children.
 *
 * SAFETY: never an HTML sink — no `dangerouslySetInnerHTML`, no raw-HTML
 * passthrough, no network. A link is admitted only when `safeHttpUrl` accepts an
 * absolute `http(s)` URL; every other spelling renders as plain link text.
 * `![alt](url)` collapses to its `alt` text, so no source URL is fetched. Fenced
 * code goes to `CodeBlock`, itself text-only.
 */
import { useMemo, type ReactNode } from 'react';

import { CodeBlock } from './code-block';
import { safeHttpUrl } from './primitives';

/** The heading levels ATX syntax can express, `#` through `######`. */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

/** A parsed block. Inline markup inside `text` is resolved at render time. */
export type MarkdownBlock =
  | { readonly type: 'heading'; readonly level: HeadingLevel; readonly text: string }
  | { readonly type: 'paragraph'; readonly text: string }
  | { readonly type: 'code'; readonly language: string | undefined; readonly code: string }
  | {
      readonly type: 'list';
      readonly ordered: boolean;
      readonly items: readonly string[];
      /** The first item's number on an ordered list, so the render can offset `<ol start>`. */
      readonly start?: number;
    }
  | { readonly type: 'blockquote'; readonly children: readonly MarkdownBlock[] }
  | { readonly type: 'thematicBreak' };

export interface MarkdownProps {
  /** The markdown source. Rendered as an escaped-by-construction React tree. */
  readonly markdown: string;
  /** Appended to `tai-prose` so a caller can position the block without losing its paint. */
  readonly className?: string;
}

// -- block grammar -----------------------------------------------------------

const BLANK = /^[ \t]*$/;
/** A fence opener: three-or-more backticks or tildes, then an info string. */
const FENCE_OPEN = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*(.*)$/;
/**
 * An ATX heading: 1–6 hashes, a required space, then text. A closing hash run is
 * stripped only when whitespace separates it from the content, so `# C#` keeps
 * its literal `C#`.
 */
const HEADING = /^[ \t]{0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/;
/** A thematic break: three-or-more `-`, `*` or `_`, spaces allowed between. */
const THEMATIC_BREAK = /^[ \t]{0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
/** A blockquote line: a `>` marker and its (optionally space-prefixed) content. */
const BLOCKQUOTE = /^[ \t]{0,3}>[ \t]?(.*)$/;
/** An unordered list item: a `-`, `*` or `+` bullet, a space, then content. */
const UNORDERED_ITEM = /^[ \t]*[-*+][ \t]+(.*)$/;
/** An ordered list item: a start number, a `.` or `)` delimiter, a space, then content. */
const ORDERED_ITEM = /^[ \t]*(\d{1,9})[.)][ \t]+(.*)$/;

/** True when a line starts a block that interrupts an open paragraph. */
function startsBlock(line: string): boolean {
  return (
    FENCE_OPEN.test(line) ||
    HEADING.test(line) ||
    THEMATIC_BREAK.test(line) ||
    BLOCKQUOTE.test(line) ||
    UNORDERED_ITEM.test(line) ||
    ORDERED_ITEM.test(line)
  );
}

/**
 * The `closer` for an open fence: the same marker character, at least as long as
 * the opener, alone on its line. A source that never closes its fence takes the
 * rest of the document as code — the same run-to-end rule CommonMark applies —
 * rather than silently dropping the block.
 */
function fenceCloser(marker: string): RegExp {
  const char = marker.startsWith('`') ? '`' : '~';
  return new RegExp(`^[ \\t]{0,3}${char}{${String(marker.length)},}[ \\t]*$`);
}

/**
 * Folds markdown source into an ordered list of blocks. Pure and total: any
 * string parses, and text that matches no block construct becomes a paragraph
 * rather than being discarded.
 */
export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  return parseBlocks(lines);
}

function parseBlocks(lines: readonly string[]): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? '';

    if (BLANK.test(line)) {
      i += 1;
      continue;
    }

    const fence = FENCE_OPEN.exec(line);
    if (fence !== null) {
      const closer = fenceCloser(fence[1] ?? '');
      const info = (fence[2] ?? '').trim();
      const body: string[] = [];
      i += 1;
      for (; i < lines.length; i += 1) {
        const next = lines[i] ?? '';
        if (closer.test(next)) break;
        body.push(next);
      }
      // Step past the closing fence when one is present; at end-of-document
      // there is nothing to step past.
      if (i < lines.length) i += 1;
      blocks.push({
        type: 'code',
        language: info.length > 0 ? info : undefined,
        code: body.join('\n'),
      });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading !== null) {
      blocks.push({
        type: 'heading',
        level: (heading[1] ?? '').length as HeadingLevel,
        text: heading[2] ?? '',
      });
      i += 1;
      continue;
    }

    if (THEMATIC_BREAK.test(line)) {
      blocks.push({ type: 'thematicBreak' });
      i += 1;
      continue;
    }

    if (BLOCKQUOTE.test(line)) {
      const inner: string[] = [];
      for (; i < lines.length; i += 1) {
        const quoted = BLOCKQUOTE.exec(lines[i] ?? '');
        if (quoted === null) break;
        inner.push(quoted[1] ?? '');
      }
      blocks.push({ type: 'blockquote', children: parseBlocks(inner) });
      continue;
    }

    const unordered = UNORDERED_ITEM.exec(line);
    const ordered = unordered === null ? ORDERED_ITEM.exec(line) : null;
    if (unordered !== null || ordered !== null) {
      const pattern = ordered !== null ? ORDERED_ITEM : UNORDERED_ITEM;
      // An ordered item's content is its second group, behind the start number; an
      // unordered item's content is its first.
      const textGroup = ordered !== null ? 2 : 1;
      const items: string[] = [];
      for (; i < lines.length; i += 1) {
        const item = pattern.exec(lines[i] ?? '');
        if (item === null) break;
        items.push(item[textGroup] ?? '');
      }
      if (ordered !== null) {
        blocks.push({ type: 'list', ordered: true, items, start: Number(ordered[1] ?? '1') });
      } else {
        blocks.push({ type: 'list', ordered: false, items });
      }
      continue;
    }

    // A paragraph: this line and the following lines up to a blank line or the
    // start of another block. Soft line breaks are kept as newlines.
    const paragraph: string[] = [line];
    i += 1;
    for (; i < lines.length; i += 1) {
      const next = lines[i] ?? '';
      if (BLANK.test(next) || startsBlock(next)) break;
      paragraph.push(next);
    }
    blocks.push({ type: 'paragraph', text: paragraph.join('\n') });
  }

  return blocks;
}

// -- inline grammar ----------------------------------------------------------

// Single-character predicates, so the `\S` and `\w` classes decide flanking
// exactly — a non-breaking space is whitespace, an underscore a word character —
// rather than an open-coded space test getting those edges wrong.
const NON_SPACE = /\S/;
const WORD = /\w/;

/** Inline code: a run of backticks and its literal, unparsed content, on one line. */
const CODE_SPAN = /`([^`\n]+)`/g;

// Emphasis runs carry CommonMark flanking: the opening marker must be followed by
// a non-space and the closing marker preceded by a non-space, so spaced prose like
// `w * h * d` is left literal. An `_` marker is additionally barred from touching a
// word character on its outer side, so intraword underscores (`user_id_field`,
// `a__proto__b`) never open or close a run; `*` keeps working everywhere.

/** A resolved emphasis or strong run: where it sits and the text between its markers. */
interface EmphasisSpan {
  readonly index: number;
  readonly length: number;
  readonly content: string;
}

/**
 * The earliest run delimited by `marker` (`**`, `__`, `*` or `_`) at or after
 * `from`. Walks once, holding one pending opener per line and closing it at the
 * first marker a non-space away (and, for `_`, not abutting a word character on
 * its outer edges). One pending opener per line reproduces the leftmost lazy
 * match, quirks and all (`***a***` → `***a**`, `**a*` → none); a newline drops the
 * opener. O(1) per character.
 */
function findEmphasisSpan(text: string, from: number, marker: string): EmphasisSpan | null {
  const m = marker.length;
  const mark = marker[0];
  const underscore = mark === '_';
  let opener = -1;
  for (let j = from; j + m <= text.length; j += 1) {
    const ch = text[j];
    if (ch === '\n') {
      opener = -1;
      continue;
    }
    if (ch !== mark || (m === 2 && text[j + 1] !== mark)) continue;
    // A closer: first marker >=1 body char away, preceded by a non-space (and,
    // for `_`, not followed by a word character).
    if (
      opener !== -1 &&
      j >= opener + m + 1 &&
      NON_SPACE.test(text[j - 1] ?? '') &&
      (!underscore || j + m >= text.length || !WORD.test(text[j + m] ?? ''))
    ) {
      return { index: opener, length: j + m - opener, content: text.slice(opener + m, j) };
    }
    // The opener: first marker followed by a non-space (and, for `_`, not abutting
    // a word character on its left); only the first is kept.
    if (
      opener === -1 &&
      j + m < text.length &&
      NON_SPACE.test(text[j + m] ?? '') &&
      (!underscore || j === 0 || !WORD.test(text[j - 1] ?? ''))
    ) {
      opener = j;
    }
  }
  return null;
}

/** The outcome of a `scanDestination` sweep: the `)` it found, and where it halted. */
interface DestinationScan {
  /** The closing `)` index, or `-1` when the run is empty or unterminated. */
  readonly end: number;
  /**
   * Where the walk halted — the `)` on success, else the whitespace or end-of-text
   * that ended a failure. On a failure that advanced, `[start, stop)` provably
   * holds no `)`, which the caller memoizes as a dead span.
   */
  readonly stop: number;
}

/**
 * The destination run of a bracketed construct: one-or-more non-`)`, non-space
 * characters bounded by `)`. Forward-only cursor. See {@link DestinationScan} for
 * `end`/`stop`.
 */
function scanDestination(text: string, start: number): DestinationScan {
  let k = start;
  while (k < text.length && text[k] !== ')' && NON_SPACE.test(text[k] ?? '')) k += 1;
  if (k > start && text[k] === ')') return { end: k, stop: k };
  // A failure halts at `k`: the whitespace that stopped the walk, or `text.length`
  // when the run reached the end. Either way `[start, k)` holds no `)`.
  return { end: -1, stop: k };
}

/** A resolved link or image: its label/alt `content` and its destination `extra`. */
interface BracketedSpan {
  readonly index: number;
  readonly length: number;
  readonly content: string;
  readonly extra: string;
}

/**
 * The earliest `[label](dest)` (or, when `image`, `![alt](dest)`) at or after
 * `from`. A label runs from `[` to the first `]`; a link needs a non-empty label,
 * an image admits an empty one. Linear: each `[` candidate reuses a forward-only
 * `]` pointer and a destination memoized on that `]`, and `deadUntil` records a
 * proven no-`)` span so later candidates starting inside it skip the scan.
 */
function findBracketed(text: string, from: number, image: boolean): BracketedSpan | null {
  let close = -1; // first `]` at an index the current candidate can still use
  let destKey = -1; // the `]` the memoized destination belongs to
  let destEnd = -1; // closing `)` for `destKey`, or -1
  // Exclusive index up to which a scan proved no `)` exists; a destination start
  // below it skips the scan. A start at or past it must still scan. Call-local.
  let deadUntil = -1;

  let bracket = text.indexOf('[', from);
  while (bracket !== -1) {
    // An image opens at the `!` immediately before its `[`.
    const start = image ? bracket - 1 : bracket;
    if (!image || (start >= from && text[start] === '!')) {
      if (close < bracket + 1) close = text.indexOf(']', bracket + 1);
      if (close === -1) return null;
      const labelOk = image || close > bracket + 1;
      if (labelOk && text[close + 1] === '(') {
        if (destKey !== close) {
          destKey = close;
          const destStart = close + 2;
          if (deadUntil !== -1 && destStart < deadUntil) {
            // A destination inside a proven no-`)` span halts where that scan did.
            destEnd = -1;
          } else {
            const scan = scanDestination(text, destStart);
            destEnd = scan.end;
            if (scan.end === -1 && scan.stop > destStart) deadUntil = scan.stop;
          }
        }
        if (destEnd !== -1) {
          return {
            index: start,
            length: destEnd + 1 - start,
            content: text.slice(bracket + 1, close),
            extra: text.slice(close + 2, destEnd),
          };
        }
      }
    }
    bracket = text.indexOf('[', bracket + 1);
  }
  return null;
}

type InlineKind = 'code' | 'image' | 'link' | 'strong' | 'emphasis';

/** An inline construct located at an absolute `index`, ready to render. */
interface InlineFound {
  readonly kind: InlineKind;
  readonly index: number;
  readonly length: number;
  /** Inline code text, image alt, link label, or emphasis/strong body. */
  readonly content: string;
  /** A link's or image's destination. */
  readonly extra?: string;
}

/** Inline code at or after `from`; the shared cursor is set immediately before the scan. */
function findCode(text: string, from: number): InlineFound | null {
  CODE_SPAN.lastIndex = from;
  const match = CODE_SPAN.exec(text);
  if (match === null) return null;
  return { kind: 'code', index: match.index, length: match[0].length, content: match[1] ?? '' };
}

interface InlineRule {
  readonly kind: InlineKind;
  readonly find: (text: string, from: number) => InlineFound | null;
}

/** Tags an emphasis span with its element kind, or passes `null` through. */
function asFound(kind: InlineKind, span: EmphasisSpan | null): InlineFound | null {
  return span === null
    ? null
    : { kind, index: span.index, length: span.length, content: span.content };
}

/**
 * Inline constructs in tie-break order at a shared position: code, image, link,
 * strong, emphasis — so `**` reads as one strong span, not two emphasis markers.
 * Strong and emphasis are split per marker (`**`/`__`, `*`/`_`) so each marker
 * caches its own exhaustion and the pass stays linear; star precedes underscore.
 */
const INLINE_RULES: readonly InlineRule[] = [
  { kind: 'code', find: findCode },
  {
    kind: 'image',
    find: (text, from) => {
      const span = findBracketed(text, from, true);
      return span === null ? null : { kind: 'image', ...span };
    },
  },
  {
    kind: 'link',
    find: (text, from) => {
      const span = findBracketed(text, from, false);
      return span === null ? null : { kind: 'link', ...span };
    },
  },
  { kind: 'strong', find: (text, from) => asFound('strong', findEmphasisSpan(text, from, '**')) },
  { kind: 'strong', find: (text, from) => asFound('strong', findEmphasisSpan(text, from, '__')) },
  {
    kind: 'emphasis',
    find: (text, from) => asFound('emphasis', findEmphasisSpan(text, from, '*')),
  },
  {
    kind: 'emphasis',
    find: (text, from) => asFound('emphasis', findEmphasisSpan(text, from, '_')),
  },
];

/**
 * Resolves inline markup to React nodes. A cursor walks the text once; each rule
 * caches its earliest match at or after the cursor and is rescanned only when the
 * cursor passes that match, so the rules' rescans cover disjoint forward ranges
 * and the pass is linear. Plain runs are pushed as text children that React
 * escapes; a link is admitted only when `safeHttpUrl` accepts it, and an image
 * contributes its `alt` text alone.
 */
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Per rule: `undefined` not yet scanned, `null` no match through the end
  // (final), otherwise the pending match to reuse until the cursor passes it.
  const cache: (InlineFound | null | undefined)[] = INLINE_RULES.map(() => undefined);
  let pos = 0;

  while (pos < text.length) {
    let best: InlineFound | null = null;
    for (const [r, rule] of INLINE_RULES.entries()) {
      let hit = cache[r];
      if (hit === undefined || (hit !== null && hit.index < pos)) {
        hit = rule.find(text, pos);
        cache[r] = hit;
      }
      if (hit !== null && (best === null || hit.index < best.index)) {
        best = hit;
      }
    }
    if (best === null) {
      nodes.push(text.slice(pos));
      break;
    }
    if (best.index > pos) {
      nodes.push(text.slice(pos, best.index));
    }
    nodes.push(renderInlineMatch(best, `${keyBase}-${String(best.index)}`));
    pos = best.index + best.length;
  }

  return nodes;
}

/**
 * Test-only entry point to the inline scanner. Resolves inline markup to React
 * nodes exactly as `renderInline` does, but without mounting or serializing a
 * DOM, so a test can time the scan itself in isolation from render cost. Not part
 * of the public API.
 */
export function scanInline(text: string): ReactNode[] {
  return renderInline(text, 'k');
}

function renderInlineMatch(found: InlineFound, key: string): ReactNode {
  switch (found.kind) {
    case 'code':
      return <code key={key}>{found.content}</code>;
    case 'image':
      // Images are not rendered: the alt text is all that survives, and no URL
      // is fetched.
      return found.content;
    case 'link': {
      const url = safeHttpUrl(found.extra ?? '');
      const children = renderInline(found.content, `${key}-t`);
      if (url === undefined) {
        // A destination that is not an absolute http(s) URL never becomes a live
        // anchor: the display text is rendered as plain text.
        return <span key={key}>{children}</span>;
      }
      return (
        <a key={key} href={url} target="_blank" rel="noopener noreferrer external">
          {children}
        </a>
      );
    }
    case 'strong':
      return <strong key={key}>{renderInline(found.content, `${key}-t`)}</strong>;
    case 'emphasis':
      return <em key={key}>{renderInline(found.content, `${key}-t`)}</em>;
  }
}

// -- block rendering ---------------------------------------------------------

/** The intrinsic element each heading level renders, keyed for a valid JSX tag. */
const HEADING_TAG: Record<HeadingLevel, 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'> = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
  5: 'h5',
  6: 'h6',
};

function renderBlock(block: MarkdownBlock, key: string): ReactNode {
  switch (block.type) {
    case 'heading': {
      const Tag = HEADING_TAG[block.level];
      return <Tag key={key}>{renderInline(block.text, key)}</Tag>;
    }
    case 'paragraph':
      return <p key={key}>{renderInline(block.text, key)}</p>;
    case 'code':
      return <CodeBlock key={key} code={block.code} language={block.language} />;
    case 'list': {
      const items = block.items.map((item, index) => {
        const itemKey = `${key}-${String(index)}`;
        return <li key={itemKey}>{renderInline(item, itemKey)}</li>;
      });
      if (block.ordered) {
        // A list that starts at 1 needs no `start`; any other first number is carried
        // through so the marker sequence matches the source.
        const start = block.start !== undefined && block.start !== 1 ? block.start : undefined;
        return (
          <ol key={key} start={start}>
            {items}
          </ol>
        );
      }
      return <ul key={key}>{items}</ul>;
    }
    case 'blockquote':
      return (
        <blockquote key={key}>
          {block.children.map((child, index) => renderBlock(child, `${key}-${String(index)}`))}
        </blockquote>
      );
    case 'thematicBreak':
      return <hr key={key} />;
  }
}

export function Markdown({ markdown, className }: MarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown]);
  const proseClass = className === undefined ? 'tai-prose' : `tai-prose ${className}`;
  return (
    <div className={proseClass}>
      {blocks.map((block, index) => renderBlock(block, `b${String(index)}`))}
    </div>
  );
}
