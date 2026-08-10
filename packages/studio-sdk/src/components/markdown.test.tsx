import { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CodeBlock } from './code-block';
import {
  Markdown,
  parseMarkdown,
  scanInline,
  type HeadingLevel,
  type MarkdownBlock,
} from './markdown';
import { safeHttpUrl } from './primitives';

describe('parseMarkdown — pure block grammar', () => {
  it('reads ATX headings at their level and strips closing hashes', () => {
    expect(parseMarkdown('# Title')).toEqual([{ type: 'heading', level: 1, text: 'Title' }]);
    expect(parseMarkdown('### Deep ###')).toEqual([{ type: 'heading', level: 3, text: 'Deep' }]);
  });

  it('does not treat a hash without a following space as a heading', () => {
    expect(parseMarkdown('#notaheading')).toEqual([{ type: 'paragraph', text: '#notaheading' }]);
  });

  it('captures a fenced code block with its info string as the language', () => {
    expect(parseMarkdown('```ts\nconst x = 1;\n```')).toEqual([
      { type: 'code', language: 'ts', code: 'const x = 1;' },
    ]);
  });

  it('leaves the language undefined on a bare fence', () => {
    expect(parseMarkdown('```\nplain\n```')).toEqual([
      { type: 'code', language: undefined, code: 'plain' },
    ]);
  });

  it('runs an unclosed fence to the end of the document rather than dropping it', () => {
    expect(parseMarkdown('```\nnever closed')).toEqual([
      { type: 'code', language: undefined, code: 'never closed' },
    ]);
  });

  it('groups consecutive unordered items into one list', () => {
    expect(parseMarkdown('- a\n- b\n* c')).toEqual([
      { type: 'list', ordered: false, items: ['a', 'b', 'c'] },
    ]);
  });

  it('groups consecutive ordered items into one ordered list', () => {
    expect(parseMarkdown('1. first\n2. second')).toEqual([
      { type: 'list', ordered: true, items: ['first', 'second'], start: 1 },
    ]);
  });

  it('carries the first item number of an ordered list that does not start at 1', () => {
    expect(parseMarkdown('3. first\n4. second')).toEqual([
      { type: 'list', ordered: true, items: ['first', 'second'], start: 3 },
    ]);
  });

  it('keeps a trailing hash that is not space-separated from the heading content', () => {
    expect(parseMarkdown('# C#')).toEqual([{ type: 'heading', level: 1, text: 'C#' }]);
  });

  it('parses a thematic break independent of the marker character', () => {
    expect(parseMarkdown('---')).toEqual([{ type: 'thematicBreak' }]);
    expect(parseMarkdown('***')).toEqual([{ type: 'thematicBreak' }]);
  });

  it('nests blocks inside a blockquote', () => {
    expect(parseMarkdown('> quoted line')).toEqual([
      { type: 'blockquote', children: [{ type: 'paragraph', text: 'quoted line' }] },
    ]);
  });

  it('joins soft-wrapped lines into a single paragraph and splits on blank lines', () => {
    expect(parseMarkdown('one\ntwo\n\nthree')).toEqual([
      { type: 'paragraph', text: 'one\ntwo' },
      { type: 'paragraph', text: 'three' },
    ]);
  });

  it('lets a heading interrupt an open paragraph', () => {
    expect(parseMarkdown('body\n# Heading')).toEqual([
      { type: 'paragraph', text: 'body' },
      { type: 'heading', level: 1, text: 'Heading' },
    ]);
  });

  it('normalizes CRLF line endings', () => {
    expect(parseMarkdown('# Title\r\n\r\nbody')).toEqual([
      { type: 'heading', level: 1, text: 'Title' },
      { type: 'paragraph', text: 'body' },
    ]);
  });
});

describe('Markdown — rendering', () => {
  it('renders headings, paragraphs and lists as semantic elements on the prose ground', () => {
    const { container } = render(
      <Markdown markdown={'# Heading\n\nA paragraph.\n\n- one\n- two'} />,
    );
    expect(container.firstElementChild).toHaveClass('tai-prose');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Heading');
    expect(container.querySelector('p')).toHaveTextContent('A paragraph.');
    const items = screen.getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['one', 'two']);
  });

  it('renders emphasis and strong emphasis as <em> and <strong>', () => {
    const { container } = render(<Markdown markdown={'*soft* and **hard**'} />);
    expect(container.querySelector('em')).toHaveTextContent('soft');
    expect(container.querySelector('strong')).toHaveTextContent('hard');
  });

  it('renders underscore emphasis and strong emphasis as <em> and <strong>', () => {
    const { container } = render(<Markdown markdown={'_italic_ and __bold__'} />);
    expect(container.querySelector('em')).toHaveTextContent('italic');
    expect(container.querySelector('strong')).toHaveTextContent('bold');
  });

  it('renders a multi-word underscore run', () => {
    const { container } = render(<Markdown markdown={'_bar baz_'} />);
    expect(container.querySelector('em')).toHaveTextContent('bar baz');
  });

  it('renders underscore emphasis flanked by prose', () => {
    const { container } = render(<Markdown markdown={'an _italic_ word'} />);
    expect(container.querySelector('em')).toHaveTextContent('italic');
    expect(container.querySelector('p')?.textContent).toBe('an italic word');
  });

  it('renders underscore emphasis flanked by punctuation', () => {
    const { container } = render(<Markdown markdown={'(_x_)'} />);
    expect(container.querySelector('em')).toHaveTextContent('x');
    expect(container.querySelector('p')?.textContent).toBe('(x)');
  });

  it('renders underscore emphasis nested inside star strong', () => {
    const { container } = render(<Markdown markdown={'**a _b_ c**'} />);
    const strong = container.querySelector('strong');
    expect(strong).not.toBeNull();
    expect(strong?.querySelector('em')).toHaveTextContent('b');
    expect(strong?.textContent).toBe('a b c');
  });

  it('renders a standalone __proto__ as strong per CommonMark flanking', () => {
    const { container } = render(<Markdown markdown={'__proto__'} />);
    expect(container.querySelector('strong')).toHaveTextContent('proto');
  });

  it('leaves intraword underscores and spaced asterisks as literal text', () => {
    const { container } = render(
      <Markdown markdown={'user_id_field, a_b_c, foo__bar__baz, a__proto__b, w * h * d'} />,
    );
    expect(container.querySelector('em')).toBeNull();
    expect(container.querySelector('strong')).toBeNull();
    expect(container.querySelector('p')?.textContent).toBe(
      'user_id_field, a_b_c, foo__bar__baz, a__proto__b, w * h * d',
    );
  });

  it('numbers an ordered list from its first item number with <ol start>', () => {
    const { container } = render(<Markdown markdown={'3. first\n4. second'} />);
    expect(container.querySelector('ol')).toHaveAttribute('start', '3');
  });

  it('omits the start attribute on an ordered list that begins at 1', () => {
    const { container } = render(<Markdown markdown={'1. first\n2. second'} />);
    expect(container.querySelector('ol')).not.toHaveAttribute('start');
  });

  it('renders inline code as an escaped <code> element', () => {
    const { container } = render(<Markdown markdown={'call `render()` now'} />);
    const code = container.querySelector('code');
    expect(code).toHaveTextContent('render()');
  });

  it('delegates a fenced block to CodeBlock, preserving the code verbatim', () => {
    const { container } = render(<Markdown markdown={'```py\nprint(1)\n```'} />);
    const pre = container.querySelector('pre.tai-code-block');
    expect(pre).not.toBeNull();
    expect(pre).toHaveTextContent('print(1)');
    expect(screen.getByText('py')).toHaveClass('tai-label');
  });

  it('appends a caller className to the prose class without replacing it', () => {
    const { container } = render(<Markdown markdown="x" className="mt-4" />);
    expect(container.firstElementChild).toHaveClass('tai-prose', 'mt-4');
  });
});

describe('Markdown — link safety', () => {
  it('renders an absolute http(s) link as a blank-target anchor with a hardened rel', () => {
    render(<Markdown markdown="[docs](https://example.com/guide)" />);
    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://example.com/guide');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer external');
  });

  it('neutralizes a javascript: link into plain text with no anchor', () => {
    const { container } = render(<Markdown markdown="[click](javascript:alert(1))" />);
    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByText('click')).toBeInTheDocument();
  });

  it('neutralizes a data: link into plain text with no anchor', () => {
    const { container } = render(
      <Markdown markdown="[x](data:text/html,<script>alert(1)</script>)" />,
    );
    expect(container.querySelector('a')).toBeNull();
  });

  it('neutralizes a relative link into plain text with no anchor', () => {
    const { container } = render(<Markdown markdown="[home](/settings)" />);
    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByText('home')).toBeInTheDocument();
  });
});

describe('Markdown — no HTML sink (XSS pins)', () => {
  it('renders a <script> tag in source as inert escaped text, never an element', () => {
    const { container } = render(<Markdown markdown={'before <script>alert(1)</script> after'} />);
    expect(container.querySelector('script')).toBeNull();
    const paragraph = container.querySelector('p');
    expect(paragraph?.textContent).toContain('<script>alert(1)</script>');
  });

  it('renders an <img onerror=...> in source as inert text, never an image', () => {
    const { container } = render(<Markdown markdown={'<img src=x onerror="alert(1)">'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('p')?.textContent).toContain('onerror');
  });

  it('never emits an <img> for markdown image syntax — only the alt text survives', () => {
    const { container } = render(<Markdown markdown="![diagram](https://example.com/x.png)" />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('diagram')).toBeInTheDocument();
  });

  it('renders a script payload inside a fenced block as escaped text, never an element', () => {
    const { container } = render(<Markdown markdown={'```\n<script>alert(1)</script>\n```'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('pre')).toHaveTextContent('<script>alert(1)</script>');
  });

  it('renders HTML inside inline code as escaped text', () => {
    const { container } = render(<Markdown markdown={'use `<b>bold</b>` here'} />);
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('code')).toHaveTextContent('<b>bold</b>');
  });

  it('keeps an HTML link label inert under an unsafe scheme — no anchor, no element', () => {
    const { container } = render(<Markdown markdown={'[<b>x</b>](vbscript:danger)'} />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('p')?.textContent).toContain('<b>x</b>');
  });
});

/** Counts the scanned inline nodes that are React elements of a given tag. */
function countInlineElements(nodes: readonly ReactNode[], tag: string): number {
  return nodes.filter((node) => isValidElement(node) && node.type === tag).length;
}

// These guards watch the inline scanner's growth curve, not render cost. They run
// the scanner directly (`scanInline`) so no DOM is mounted or serialized and the
// only thing measured is the scan. The signal is complexity: a near-linear scan
// stays cheap and grows ~2x when its input doubles; a superlinear one blows up.
describe('Markdown — inline scanner scans in near-linear time', () => {
  // An all-literal wall of emphasis openers with no reachable closer. The scan
  // resolves it to a single text node, so its whole cost is the character walk. A
  // near-linear walk finishes in single-digit milliseconds; a superlinear one
  // runs for hundreds. The ceiling is loose enough to ignore machine speed yet far
  // below any superlinear regression.
  it('scans a wall of unclosed emphasis openers as literal text', () => {
    const source = ' *a'.repeat(40000);
    const start = performance.now();
    const nodes = scanInline(source);
    const elapsed = performance.now() - start;
    expect(countInlineElements(nodes, 'em')).toBe(0);
    expect(countInlineElements(nodes, 'strong')).toBe(0);
    expect(elapsed).toBeLessThan(200);
  });

  // An all-literal wall of link openers with no closer: same shape, exercising the
  // bracket scanner instead of the emphasis scanner.
  it('scans a wall of unmatched brackets as literal text', () => {
    const source = '['.repeat(40000);
    const start = performance.now();
    const nodes = scanInline(source);
    const elapsed = performance.now() - start;
    expect(countInlineElements(nodes, 'a')).toBe(0);
    expect(nodes).toEqual([source]);
    expect(elapsed).toBeLessThan(200);
  });

  // A wall of link openers each carrying a label and an open destination that
  // never closes: '[a]([a](...'. Unlike a bare '[' wall — which bails at the first
  // missing ']' — every candidate here reaches the destination scanner, the one
  // path that can go quadratic. The whole input still resolves to a single literal
  // text node, so a linear scan stays in single-digit milliseconds while a
  // quadratic one runs for seconds.
  it('scans a wall of unterminated bracket destinations as literal text', () => {
    const source = '[a]('.repeat(40000);
    const start = performance.now();
    const nodes = scanInline(source);
    const elapsed = performance.now() - start;
    expect(countInlineElements(nodes, 'a')).toBe(0);
    expect(nodes).toEqual([source]);
    expect(elapsed).toBeLessThan(200);
  });

  // The same '[a](' wall, but terminated by a single trailing space rather than
  // end-of-text. Every candidate's destination scan now runs off to the SAME
  // trailing whitespace, so a memo keyed only on end-of-text would rescan it per
  // candidate and go quadratic; the generalized no-`)` memo covers the whitespace
  // stop too, keeping the whole input a single literal node in near-linear time.
  it('scans a wall of bracket destinations ending at a trailing space as literal text', () => {
    const source = '[a]('.repeat(40000) + ' ';
    const start = performance.now();
    const nodes = scanInline(source);
    const elapsed = performance.now() - start;
    expect(countInlineElements(nodes, 'a')).toBe(0);
    expect(nodes).toEqual([source]);
    expect(elapsed).toBeLessThan(200);
  });

  // The same shape terminated by a trailing newline instead of a space: another
  // whitespace stop the end-of-text-only memo would miss.
  it('scans a wall of bracket destinations ending at a trailing newline as literal text', () => {
    const source = '[a]('.repeat(40000) + '\n';
    const start = performance.now();
    const nodes = scanInline(source);
    const elapsed = performance.now() - start;
    expect(countInlineElements(nodes, 'a')).toBe(0);
    expect(nodes).toEqual([source]);
    expect(elapsed).toBeLessThan(200);
  });

  // A many-matches input: every `*a*` run is a distinct match, so the scan emits
  // one node per run and its cost has an unavoidable linear floor from building
  // that many nodes (allocation- and GC-heavy, so timings are noisy). The signal
  // guarded here is that resolving each match does NOT re-walk the remaining tail:
  // a per-match cursor keeps the whole scan near-linear, so a large input clears a
  // generous absolute ceiling with wide headroom, whereas a scan that re-walks the
  // tail per match runs for seconds. The ceiling sits far above the linear floor
  // and far below that quadratic, and the minimum over several attempts drops the
  // GC-inflated runs, so the bound is robust rather than a machine-speed race.
  it('resolves many adjacent emphasis runs without re-walking the tail', () => {
    const runCount = 40000;
    const source = '*a* '.repeat(runCount);
    let best = Infinity;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const start = performance.now();
      const nodes = scanInline(source);
      best = Math.min(best, performance.now() - start);
      expect(countInlineElements(nodes, 'em')).toBe(runCount);
    }
    expect(best).toBeLessThan(3000);
  });
});

describe('Markdown — emphasis delimiter edge cases', () => {
  it('reads *** a *** as strong over the leftover marker', () => {
    const { container } = render(<Markdown markdown={'***a***'} />);
    const strong = container.querySelector('strong');
    expect(strong).toHaveTextContent('*a');
    // The unmatched trailing marker stays literal text after the run.
    expect(container.querySelector('p')?.textContent).toBe('*a*');
  });

  it('reads **a* as an emphasis run whose body keeps the extra star', () => {
    const { container } = render(<Markdown markdown={'**a*'} />);
    expect(container.querySelector('strong')).toBeNull();
    expect(container.querySelector('em')).toHaveTextContent('*a');
  });

  it('splits *a**b* into two adjacent emphasis runs', () => {
    const { container } = render(<Markdown markdown={'*a**b*'} />);
    const ems = container.querySelectorAll('em');
    expect(Array.from(ems).map((em) => em.textContent)).toEqual(['a', 'b']);
  });

  it('reads **a****b** as two strong runs', () => {
    const { container } = render(<Markdown markdown={'**a****b**'} />);
    const strongs = container.querySelectorAll('strong');
    expect(Array.from(strongs).map((s) => s.textContent)).toEqual(['a', 'b']);
    expect(container.querySelector('em')).toBeNull();
  });

  it('reads a bare **** line as a thematic break, never emphasis', () => {
    // A line of only stars is a block-level thematic break: it renders as a rule
    // and never reaches the inline scanner.
    const { container } = render(<Markdown markdown={'****'} />);
    expect(container.querySelector('hr')).not.toBeNull();
    expect(container.querySelector('em')).toBeNull();
    expect(container.querySelector('strong')).toBeNull();
  });

  it('reads a bare __ __ line as a thematic break, never emphasis', () => {
    const { container } = render(<Markdown markdown={'__ __'} />);
    expect(container.querySelector('hr')).not.toBeNull();
    expect(container.querySelector('em')).toBeNull();
    expect(container.querySelector('strong')).toBeNull();
  });

  it('reads an inline **** run as an emphasis span around a literal star', () => {
    // The same star run inside prose does reach the inline scanner.
    const { container } = render(<Markdown markdown={'x ****'} />);
    expect(container.querySelector('em')).toHaveTextContent('*');
    expect(container.querySelector('p')?.textContent).toBe('x **');
  });

  it('keeps an inner __ that abuts a word inside one strong run', () => {
    const { container } = render(<Markdown markdown={'__a__b c__'} />);
    const strongs = container.querySelectorAll('strong');
    expect(strongs).toHaveLength(1);
    expect(strongs[0]).toHaveTextContent('a__b c');
  });

  it('keeps an inner _ that abuts a word inside one emphasis run', () => {
    const { container } = render(<Markdown markdown={'_a_b c_'} />);
    const ems = container.querySelectorAll('em');
    expect(ems).toHaveLength(1);
    expect(ems[0]).toHaveTextContent('a_b c');
  });

  it('renders adjacent strong then underscore emphasis', () => {
    const { container } = render(<Markdown markdown={'**a**_b_'} />);
    expect(container.querySelector('strong')).toHaveTextContent('a');
    expect(container.querySelector('em')).toHaveTextContent('b');
  });

  it('reopens an underscore run immediately after a consumed run (cursor lookbehind)', () => {
    const { container } = render(<Markdown markdown={'_a_-_b_'} />);
    const ems = container.querySelectorAll('em');
    expect(Array.from(ems).map((em) => em.textContent)).toEqual(['a', 'b']);
    expect(container.querySelector('p')?.textContent).toBe('a-b');
  });

  it('binds a doubled star as one strong run, not two emphasis runs', () => {
    const { container } = render(<Markdown markdown={'**b**'} />);
    expect(container.querySelector('strong')).toHaveTextContent('b');
    expect(container.querySelector('em')).toBeNull();
  });

  it('does not cross a newline when pairing a run', () => {
    const { container } = render(<Markdown markdown={'**a\nb**'} />);
    expect(container.querySelector('strong')).toBeNull();
    expect(container.querySelector('em')).toBeNull();
  });

  it('pairs each line independently within a soft-wrapped paragraph', () => {
    const { container } = render(<Markdown markdown={'*a*\n*b*'} />);
    const ems = container.querySelectorAll('em');
    expect(Array.from(ems).map((em) => em.textContent)).toEqual(['a', 'b']);
  });

  it('leaves a marker opened over a non-breaking space literal', () => {
    const source = '* a*';
    const { container } = render(<Markdown markdown={source} />);
    expect(container.querySelector('em')).toBeNull();
    expect(container.querySelector('p')?.textContent).toBe(source);
  });

  it('recovers emphasis after an unterminated backtick', () => {
    const { container } = render(<Markdown markdown={'`x *a*'} />);
    expect(container.querySelector('code')).toBeNull();
    expect(container.querySelector('em')).toHaveTextContent('a');
    expect(container.querySelector('p')?.textContent).toBe('`x a');
  });
});

// A reference renderer that pins the single-pass alternation the linear scanner
// must equal — per-rule `.exec` and a slice-based peel loop — so the fuzz below
// proves the two are character-for-character equal.
const REF_RULES = [
  { kind: 'code', pattern: /`([^`\n]+)`/ },
  { kind: 'image', pattern: /!\[([^\]]*)\]\(([^)\s]+)\)/ },
  { kind: 'link', pattern: /\[([^\]]+)\]\(([^)\s]+)\)/ },
  {
    kind: 'strong',
    pattern: /\*\*(?=\S)([^\n]+?)(?<=\S)\*\*|(?<!\w)__(?=\S)([^\n]+?)(?<=\S)__(?!\w)/,
  },
  { kind: 'emphasis', pattern: /\*(?=\S)([^\n]+?)(?<=\S)\*|(?<!\w)_(?=\S)([^\n]+?)(?<=\S)_(?!\w)/ },
] as const;

interface RefMatch {
  readonly kind: (typeof REF_RULES)[number]['kind'];
  readonly index: number;
  readonly length: number;
  readonly match: RegExpExecArray;
}

function refNextInline(text: string): RefMatch | null {
  let best: RefMatch | null = null;
  for (const rule of REF_RULES) {
    const match = rule.pattern.exec(text);
    if (match === null) continue;
    if (best === null || match.index < best.index) {
      best = { kind: rule.kind, index: match.index, length: match[0].length, match };
    }
  }
  return best;
}

function refRenderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = text;
  let offset = 0;
  while (rest.length > 0) {
    const found = refNextInline(rest);
    if (found === null) {
      nodes.push(rest);
      break;
    }
    if (found.index > 0) nodes.push(rest.slice(0, found.index));
    nodes.push(refRenderMatch(found, `${keyBase}-${String(offset + found.index)}`));
    const consumed = found.index + found.length;
    offset += consumed;
    rest = rest.slice(consumed);
  }
  return nodes;
}

function refRenderMatch(found: RefMatch, key: string): ReactNode {
  const groups = found.match;
  switch (found.kind) {
    case 'code':
      return <code key={key}>{groups[1] ?? ''}</code>;
    case 'image':
      return groups[1] ?? '';
    case 'link': {
      const url = safeHttpUrl(groups[2] ?? '');
      const children = refRenderInline(groups[1] ?? '', `${key}-t`);
      if (url === undefined) return <span key={key}>{children}</span>;
      return (
        <a key={key} href={url} target="_blank" rel="noopener noreferrer external">
          {children}
        </a>
      );
    }
    case 'strong':
      return <strong key={key}>{refRenderInline(groups[1] ?? groups[2] ?? '', `${key}-t`)}</strong>;
    case 'emphasis':
      return <em key={key}>{refRenderInline(groups[1] ?? groups[2] ?? '', `${key}-t`)}</em>;
  }
}

const REF_HEADING_TAG: Record<HeadingLevel, 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'> = {
  1: 'h1',
  2: 'h2',
  3: 'h3',
  4: 'h4',
  5: 'h5',
  6: 'h6',
};

function refRenderBlock(block: MarkdownBlock, key: string): ReactNode {
  switch (block.type) {
    case 'heading': {
      const Tag = REF_HEADING_TAG[block.level];
      return <Tag key={key}>{refRenderInline(block.text, key)}</Tag>;
    }
    case 'paragraph':
      return <p key={key}>{refRenderInline(block.text, key)}</p>;
    case 'code':
      return <CodeBlock key={key} code={block.code} language={block.language} />;
    case 'list': {
      const items = block.items.map((item, index) => {
        const itemKey = `${key}-${String(index)}`;
        return <li key={itemKey}>{refRenderInline(item, itemKey)}</li>;
      });
      if (block.ordered) {
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
          {block.children.map((child, index) => refRenderBlock(child, `${key}-${String(index)}`))}
        </blockquote>
      );
    case 'thematicBreak':
      return <hr key={key} />;
  }
}

function ReferenceMarkdown({ markdown }: { readonly markdown: string }): ReactNode {
  const blocks = parseMarkdown(markdown);
  return (
    <div className="tai-prose">
      {blocks.map((block, index) => refRenderBlock(block, `b${String(index)}`))}
    </div>
  );
}

/** A deterministic PRNG (mulberry32) so the fuzz corpus is fixed across runs. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True when any block (or nested block) is a fenced code block. */
function hasCodeBlock(blocks: readonly MarkdownBlock[]): boolean {
  return blocks.some(
    (block) =>
      block.type === 'code' || (block.type === 'blockquote' && hasCodeBlock(block.children)),
  );
}

describe('Markdown — differential fuzz against the reference renderer', () => {
  it('renders identically to the reference over a seeded random corpus', () => {
    const alphabet = ['*', '_', 'a', 'x', '`', '[', ']', '(', ')', '!', '\n', ' '];
    const random = mulberry32(0x1a2b3c4d);
    let compared = 0;
    for (let sample = 0; sample < 3000; sample += 1) {
      const length = 1 + Math.floor(random() * 12);
      let source = '';
      for (let ch = 0; ch < length; ch += 1) {
        source += alphabet[Math.floor(random() * alphabet.length)] ?? '';
      }
      // Fenced code carries no inline markup; skip it so the comparison stays on
      // the inline surface the scanner rewrites.
      if (hasCodeBlock(parseMarkdown(source))) continue;
      const actual = renderToStaticMarkup(<Markdown markdown={source} />);
      const reference = renderToStaticMarkup(<ReferenceMarkdown markdown={source} />);
      expect(actual, `mismatch for ${JSON.stringify(source)}`).toBe(reference);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(2000);
  });
});
