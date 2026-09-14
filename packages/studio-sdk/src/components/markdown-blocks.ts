/**
 * The block grammar for `Markdown`: folds markdown source into an ordered list of
 * blocks. Pure and total — any string parses, and text that matches no block
 * construct becomes a paragraph rather than being discarded.
 */

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

/** One parsed block and the line index the parse advanced past. */
interface ParseStep {
  readonly block: MarkdownBlock;
  readonly next: number;
}

/** A fenced code block; runs to its closing fence or the end of the document. */
function parseFence(lines: readonly string[], i: number): ParseStep | null {
  const fence = FENCE_OPEN.exec(lines[i] ?? '');
  if (fence === null) return null;
  const closer = fenceCloser(fence[1] ?? '');
  const info = (fence[2] ?? '').trim();
  const body: string[] = [];
  let j = i + 1;
  for (; j < lines.length; j += 1) {
    const next = lines[j] ?? '';
    if (closer.test(next)) break;
    body.push(next);
  }
  // Step past the closing fence when one is present; at end-of-document there is
  // nothing to step past.
  if (j < lines.length) j += 1;
  return {
    block: { type: 'code', language: info.length > 0 ? info : undefined, code: body.join('\n') },
    next: j,
  };
}

/** An ATX heading on a single line. */
function parseHeading(lines: readonly string[], i: number): ParseStep | null {
  const heading = HEADING.exec(lines[i] ?? '');
  if (heading === null) return null;
  return {
    block: {
      type: 'heading',
      level: (heading[1] ?? '').length as HeadingLevel,
      text: heading[2] ?? '',
    },
    next: i + 1,
  };
}

/** A thematic break on a single line. */
function parseThematicBreak(lines: readonly string[], i: number): ParseStep | null {
  if (!THEMATIC_BREAK.test(lines[i] ?? '')) return null;
  return { block: { type: 'thematicBreak' }, next: i + 1 };
}

/** A blockquote: the run of `>`-marked lines, parsed recursively as its own blocks. */
function parseBlockquote(lines: readonly string[], i: number): ParseStep | null {
  if (!BLOCKQUOTE.test(lines[i] ?? '')) return null;
  const inner: string[] = [];
  let j = i;
  for (; j < lines.length; j += 1) {
    const quoted = BLOCKQUOTE.exec(lines[j] ?? '');
    if (quoted === null) break;
    inner.push(quoted[1] ?? '');
  }
  return { block: { type: 'blockquote', children: parseBlocks(inner) }, next: j };
}

/** An ordered or unordered list: the run of item lines sharing the leading marker. */
function parseList(lines: readonly string[], i: number): ParseStep | null {
  const line = lines[i] ?? '';
  const unordered = UNORDERED_ITEM.exec(line);
  const ordered = unordered === null ? ORDERED_ITEM.exec(line) : null;
  if (unordered === null && ordered === null) return null;
  const pattern = ordered !== null ? ORDERED_ITEM : UNORDERED_ITEM;
  // An ordered item's content is its second group, behind the start number; an
  // unordered item's content is its first.
  const textGroup = ordered !== null ? 2 : 1;
  const items: string[] = [];
  let j = i;
  for (; j < lines.length; j += 1) {
    const item = pattern.exec(lines[j] ?? '');
    if (item === null) break;
    items.push(item[textGroup] ?? '');
  }
  const block: MarkdownBlock =
    ordered !== null
      ? { type: 'list', ordered: true, items, start: Number(ordered[1] ?? '1') }
      : { type: 'list', ordered: false, items };
  return { block, next: j };
}

/**
 * A paragraph: this line and the following lines up to a blank line or the start
 * of another block. The total fallback — always succeeds. Soft line breaks are
 * kept as newlines.
 */
function parseParagraph(lines: readonly string[], i: number): ParseStep {
  const paragraph: string[] = [lines[i] ?? ''];
  let j = i + 1;
  for (; j < lines.length; j += 1) {
    const next = lines[j] ?? '';
    if (BLANK.test(next) || startsBlock(next)) break;
    paragraph.push(next);
  }
  return { block: { type: 'paragraph', text: paragraph.join('\n') }, next: j };
}

function parseBlocks(lines: readonly string[]): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    if (BLANK.test(lines[i] ?? '')) {
      i += 1;
      continue;
    }
    const step =
      parseFence(lines, i) ??
      parseHeading(lines, i) ??
      parseThematicBreak(lines, i) ??
      parseBlockquote(lines, i) ??
      parseList(lines, i) ??
      parseParagraph(lines, i);
    blocks.push(step.block);
    i = step.next;
  }

  return blocks;
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
