/**
 * The inline grammar for `Markdown`: locating code spans, links, images, strong
 * and emphasis runs, and resolving them to escaped React nodes. A single
 * forward-only cursor keeps the pass linear; a link is admitted only when
 * `safeHttpUrl` accepts it, and an image contributes its `alt` text alone.
 */
import type { ReactNode } from 'react';

import { safeHttpUrl } from './primitives';

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
 * Whether the marker ending at `j` closes the pending `opener`: at least one body
 * character in, preceded by a non-space (and, for `_`, not followed by a word
 * character on its outer edge).
 */
function isEmphasisCloser(
  text: string,
  j: number,
  opener: number,
  m: number,
  underscore: boolean,
): boolean {
  return (
    opener !== -1 &&
    j >= opener + m + 1 &&
    NON_SPACE.test(text[j - 1] ?? '') &&
    (!underscore || j + m >= text.length || !WORD.test(text[j + m] ?? ''))
  );
}

/**
 * Whether the marker at `j` opens a run: no opener pending, followed by a
 * non-space (and, for `_`, not abutting a word character on its left).
 */
function isEmphasisOpener(
  text: string,
  j: number,
  opener: number,
  m: number,
  underscore: boolean,
): boolean {
  return (
    opener === -1 &&
    j + m < text.length &&
    NON_SPACE.test(text[j + m] ?? '') &&
    (!underscore || j === 0 || !WORD.test(text[j - 1] ?? ''))
  );
}

/**
 * The earliest run delimited by `marker` (`**`, `__`, `*` or `_`) at or after
 * `from`. Walks once, holding one pending opener per line and closing it at the
 * first marker a non-space away (and, for `_`, not abutting a word character on
 * its outer edges). One pending opener per line reproduces the leftmost lazy
 * match, quirks and all (`***a***` yields `***a**`, and `**a*` matches none); a
 * newline drops the opener. O(1) per character.
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
    if (isEmphasisCloser(text, j, opener, m, underscore)) {
      return { index: opener, length: j + m - opener, content: text.slice(opener + m, j) };
    }
    if (isEmphasisOpener(text, j, opener, m, underscore)) opener = j;
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
 * The forward-only memo one `findBracketed` sweep threads through its candidates:
 * the reusable `]` pointer, the destination cached on a `]`, and the span a scan
 * proved to hold no `)`.
 */
interface BracketMemo {
  /** First `]` at an index the current candidate can still use. */
  close: number;
  /** The `]` the memoized destination belongs to. */
  destKey: number;
  /** Closing `)` for `destKey`, or -1. */
  destEnd: number;
  /**
   * Exclusive index up to which a scan proved no `)` exists; a destination start
   * below it skips the scan. A start at or past it must still scan.
   */
  deadUntil: number;
}

/**
 * The closing `)` for the destination of the label ending at `close`, memoized on
 * that `]`. A destination start inside a proven no-`)` span skips the scan.
 */
function resolveDestination(text: string, close: number, memo: BracketMemo): number {
  if (memo.destKey === close) return memo.destEnd;
  memo.destKey = close;
  const destStart = close + 2;
  if (memo.deadUntil !== -1 && destStart < memo.deadUntil) {
    memo.destEnd = -1;
    return -1;
  }
  const scan = scanDestination(text, destStart);
  memo.destEnd = scan.end;
  if (scan.end === -1 && scan.stop > destStart) memo.deadUntil = scan.stop;
  return memo.destEnd;
}

/**
 * The bracketed span opening at `bracket` (label `start` accounts for an image's
 * `!`), or `null` when this candidate has no non-empty label followed by a
 * `(dest)`. Requires `memo.close` already advanced to a live `]`.
 */
function matchAt(
  text: string,
  bracket: number,
  start: number,
  image: boolean,
  memo: BracketMemo,
): BracketedSpan | null {
  const labelOk = image || memo.close > bracket + 1;
  if (!labelOk || text[memo.close + 1] !== '(') return null;
  const destEnd = resolveDestination(text, memo.close, memo);
  if (destEnd === -1) return null;
  return {
    index: start,
    length: destEnd + 1 - start,
    content: text.slice(bracket + 1, memo.close),
    extra: text.slice(memo.close + 2, destEnd),
  };
}

/**
 * The earliest `[label](dest)` (or, when `image`, `![alt](dest)`) at or after
 * `from`. A label runs from `[` to the first `]`; a link needs a non-empty label,
 * an image admits an empty one. Linear: each `[` candidate reuses a forward-only
 * `]` pointer and a destination memoized on that `]`, and `deadUntil` records a
 * proven no-`)` span so later candidates starting inside it skip the scan.
 */
function findBracketed(text: string, from: number, image: boolean): BracketedSpan | null {
  const memo: BracketMemo = { close: -1, destKey: -1, destEnd: -1, deadUntil: -1 };

  let bracket = text.indexOf('[', from);
  while (bracket !== -1) {
    // An image opens at the `!` immediately before its `[`.
    const start = image ? bracket - 1 : bracket;
    if (!image || (start >= from && text[start] === '!')) {
      if (memo.close < bracket + 1) memo.close = text.indexOf(']', bracket + 1);
      if (memo.close === -1) return null;
      const span = matchAt(text, bracket, start, image, memo);
      if (span !== null) return span;
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
export function renderInline(text: string, keyBase: string): ReactNode[] {
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
