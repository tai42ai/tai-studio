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
import { type ReactNode, useMemo } from 'react';

import { CodeBlock } from './code-block';
import { type HeadingLevel, type MarkdownBlock, parseMarkdown } from './markdown-blocks';
import { renderInline } from './markdown-inline';

export type { HeadingLevel, MarkdownBlock } from './markdown-blocks';
export { parseMarkdown } from './markdown-blocks';
export { scanInline } from './markdown-inline';

export interface MarkdownProps {
  /** The markdown source. Rendered as an escaped-by-construction React tree. */
  readonly markdown: string;
  /** Appended to `tai-prose` so a caller can position the block without losing its paint. */
  readonly className?: string;
}

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
