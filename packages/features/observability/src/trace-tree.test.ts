/**
 * The pure trace-rebuild helpers: span nesting with orphan and CYCLE-ISLAND
 * re-parenting (nothing vanishes), recursive start-time sort, the default
 * selection, the token allowlist (cost keys excluded, total fallback), and the
 * leaf-only token roll-up that no longer double-counts a wrapper span.
 */
import { describe, expect, it } from 'vitest';
import type { RunSpan, RunTrace } from '@tai42/api-client';

import {
  buildTree,
  defaultSelectedId,
  isDebugSpan,
  isErrorSpan,
  spanDurationMs,
  spanTokens,
  traceTotals,
} from './trace-tree';

function span(overrides: Partial<RunSpan> & { id: string }): RunSpan {
  return {
    parentId: null,
    traceId: 't1',
    name: overrides.id,
    type: null,
    level: null,
    statusMessage: null,
    start: null,
    end: null,
    model: null,
    usage: null,
    metadata: null,
    input: null,
    output: null,
    nodeId: null,
    ...overrides,
  };
}

function trace(spans: RunSpan[], overrides: Partial<RunTrace> = {}): RunTrace {
  return {
    traceId: 't1',
    timestamp: '2026-01-01T00:00:00Z',
    tags: [],
    totalCost: null,
    input: null,
    output: null,
    metadata: null,
    spans,
    ...overrides,
  };
}

const at = (iso: string): string => iso;

describe('spanDurationMs', () => {
  it('is the end-minus-start in ms, or null when an endpoint is missing/bad', () => {
    expect(
      spanDurationMs(
        span({ id: 'a', start: '2026-01-01T00:00:00Z', end: '2026-01-01T00:00:01.5Z' }),
      ),
    ).toBe(1500);
    expect(spanDurationMs(span({ id: 'a', start: null, end: '2026-01-01T00:00:01Z' }))).toBeNull();
    expect(spanDurationMs(span({ id: 'a', start: 'nonsense', end: 'nonsense' }))).toBeNull();
  });
});

describe('buildTree', () => {
  it('nests children under their parent and sorts every sibling list by start', () => {
    const spans = [
      span({ id: 'root', start: at('2026-01-01T00:00:00Z') }),
      span({ id: 'b', parentId: 'root', start: at('2026-01-01T00:00:02Z') }),
      span({ id: 'a', parentId: 'root', start: at('2026-01-01T00:00:01Z') }),
    ];
    const tree = buildTree(spans);
    expect(tree.roots.map((n) => n.span.id)).toEqual(['root']);
    // Vendor order was b-then-a; the tree sorts children ascending by start.
    expect(tree.roots[0]?.children.map((n) => n.span.id)).toEqual(['a', 'b']);
  });

  it('re-parents an orphan (absent parent) to the root', () => {
    const tree = buildTree([span({ id: 'lonely', parentId: 'ghost' })]);
    expect(tree.roots.map((n) => n.span.id)).toEqual(['lonely']);
  });

  it('re-parents a CYCLE ISLAND to root so no span silently vanishes', () => {
    // A.parent=B and B.parent=A: both parents are present but the pair is
    // unreachable from any real root. The old flatten dropped both entirely.
    const spans = [
      span({ id: 'root' }),
      span({ id: 'A', parentId: 'B' }),
      span({ id: 'B', parentId: 'A' }),
    ];
    const tree = buildTree(spans);
    const rootIds = tree.roots.map((n) => n.span.id).sort();
    expect(rootIds).toEqual(['A', 'B', 'root']);
    // Every input span is still present in the index — none vanished.
    expect([...tree.byId.keys()].sort()).toEqual(['A', 'B', 'root']);
  });

  it('treats a self-parent as a root rather than nesting a span under itself', () => {
    const tree = buildTree([span({ id: 'self', parentId: 'self' })]);
    expect(tree.roots.map((n) => n.span.id)).toEqual(['self']);
  });

  it('picks the first error span and the slowest non-root span', () => {
    const spans = [
      span({ id: 'root', start: at('2026-01-01T00:00:00Z'), end: at('2026-01-01T00:00:10Z') }),
      span({
        id: 'fast',
        parentId: 'root',
        start: at('2026-01-01T00:00:00Z'),
        end: at('2026-01-01T00:00:01Z'),
      }),
      span({
        id: 'slow',
        parentId: 'root',
        start: at('2026-01-01T00:00:02Z'),
        end: at('2026-01-01T00:00:07Z'),
      }),
      span({
        id: 'boom',
        parentId: 'root',
        level: 'ERROR',
        start: at('2026-01-01T00:00:03Z'),
      }),
    ];
    const tree = buildTree(spans);
    expect(tree.firstErrorId).toBe('boom');
    // 'slow' is the longest non-root span; the root (10s) is deliberately ignored.
    expect(tree.slowestId).toBe('slow');
  });

  it('gives the axis a non-zero span even when no span carries a timestamp', () => {
    const tree = buildTree([span({ id: 'a' })]);
    expect(tree.t1).toBeGreaterThan(tree.t0);
  });

  it('hides DEBUG spans from the default tree while keeping the rest', () => {
    const spans = [
      span({ id: 'root' }),
      span({ id: 'work', parentId: 'root' }),
      // A no-op fan-in stand-down span the engine stamps DEBUG; a phantom rerun.
      span({ id: 'waiting', parentId: 'root', level: 'DEBUG' }),
    ];
    const tree = buildTree(spans);
    expect([...tree.byId.keys()].sort()).toEqual(['root', 'work']);
    expect(tree.roots[0]?.children.map((n) => n.span.id)).toEqual(['work']);
  });

  it('reveals DEBUG spans when includeDebug is set', () => {
    const spans = [span({ id: 'root' }), span({ id: 'waiting', parentId: 'root', level: 'debug' })];
    const tree = buildTree(spans, { includeDebug: true });
    expect([...tree.byId.keys()].sort()).toEqual(['root', 'waiting']);
    expect(tree.roots[0]?.children.map((n) => n.span.id)).toEqual(['waiting']);
  });

  it('re-parents a DEBUG span’s children to its parent rather than dropping them', () => {
    const spans = [
      span({ id: 'root' }),
      span({ id: 'debug', parentId: 'root', level: 'DEBUG' }),
      span({ id: 'child', parentId: 'debug' }),
    ];
    const tree = buildTree(spans);
    // The debug node is gone but its child survives, re-attached to root.
    expect([...tree.byId.keys()].sort()).toEqual(['child', 'root']);
    expect(tree.roots.map((n) => n.span.id)).toEqual(['root']);
    expect(tree.roots[0]?.children.map((n) => n.span.id)).toEqual(['child']);
  });

  it('detaches a child to root when every ancestor up the chain is DEBUG', () => {
    const spans = [
      span({ id: 'outer', level: 'DEBUG' }),
      span({ id: 'inner', parentId: 'outer', level: 'DEBUG' }),
      span({ id: 'leaf', parentId: 'inner' }),
    ];
    const tree = buildTree(spans);
    expect([...tree.byId.keys()]).toEqual(['leaf']);
    expect(tree.roots.map((n) => n.span.id)).toEqual(['leaf']);
  });

  it('leaves a trace with no DEBUG spans unchanged', () => {
    const spans = [span({ id: 'root' }), span({ id: 'child', parentId: 'root' })];
    const tree = buildTree(spans);
    expect([...tree.byId.keys()].sort()).toEqual(['child', 'root']);
    expect(tree.roots[0]?.children.map((n) => n.span.id)).toEqual(['child']);
  });
});

describe('isDebugSpan / isErrorSpan', () => {
  it('classifies levels case-insensitively and independently', () => {
    expect(isDebugSpan(span({ id: 'a', level: 'DEBUG' }))).toBe(true);
    expect(isDebugSpan(span({ id: 'a', level: 'debug' }))).toBe(true);
    expect(isDebugSpan(span({ id: 'a', level: 'ERROR' }))).toBe(false);
    expect(isDebugSpan(span({ id: 'a', level: null }))).toBe(false);
    // A DEBUG span is never an error, so error status is untouched by hiding it.
    expect(isErrorSpan(span({ id: 'a', level: 'DEBUG' }))).toBe(false);
  });
});

describe('defaultSelectedId', () => {
  it('prefers the first error span', () => {
    const tree = buildTree([
      span({ id: 'root' }),
      span({ id: 'bad', parentId: 'root', level: 'ERROR' }),
    ]);
    expect(defaultSelectedId(tree)).toBe('bad');
  });

  it('falls back to the first root when there is no error', () => {
    const tree = buildTree([span({ id: 'root' })]);
    expect(defaultSelectedId(tree)).toBe('root');
  });

  it('is null for an empty trace', () => {
    expect(defaultSelectedId(buildTree([]))).toBeNull();
  });
});

describe('spanTokens', () => {
  it('sums allowlisted input and output token keys', () => {
    expect(spanTokens({ input_tokens: 10, output_tokens: 5 })).toBe(15);
    expect(spanTokens({ prompt_tokens: 8, completion_tokens: 2 })).toBe(10);
  });

  it('never counts a cost key as tokens', () => {
    // The old includes()-heuristic read `input_cost` as input tokens.
    expect(spanTokens({ input_cost: 0.02, output_cost: 0.05 })).toBe(0);
    expect(spanTokens({ input_tokens: 4, input_cost: 0.02 })).toBe(4);
  });

  it('falls back to an explicit total key when neither input nor output is present', () => {
    expect(spanTokens({ total_tokens: 42 })).toBe(42);
    expect(spanTokens({ total: 7 })).toBe(7);
  });

  it('prefers input+output over a total when both are present', () => {
    expect(spanTokens({ input_tokens: 3, output_tokens: 4, total_tokens: 99 })).toBe(7);
  });

  it('is zero for missing or non-object usage', () => {
    expect(spanTokens(null)).toBe(0);
    expect(spanTokens('nope')).toBe(0);
    expect(spanTokens([1, 2, 3])).toBe(0);
  });
});

describe('traceTotals', () => {
  it('sums tokens over LEAF spans only, so a wrapper aggregate is not double-counted', () => {
    // The wrapper re-reports the sum of its two leaves; counting it too would
    // report 30 instead of the true 15.
    const spans = [
      span({ id: 'wrapper', usage: { total_tokens: 15 } }),
      span({ id: 'gen1', parentId: 'wrapper', usage: { input_tokens: 6, output_tokens: 2 } }),
      span({ id: 'gen2', parentId: 'wrapper', usage: { input_tokens: 5, output_tokens: 2 } }),
    ];
    expect(traceTotals(trace(spans, { totalCost: 0.5 })).totalTokens).toBe(15);
  });

  it('carries cost straight from the wire and reports status, span count, and duration', () => {
    const spans = [
      span({
        id: 'root',
        start: at('2026-01-01T00:00:00Z'),
        end: at('2026-01-01T00:00:02Z'),
      }),
      span({ id: 'bad', parentId: 'root', level: 'ERROR' }),
    ];
    const totals = traceTotals(trace(spans, { totalCost: 1.25 }));
    expect(totals.totalCost).toBe(1.25);
    expect(totals.status).toBe('error');
    expect(totals.spanCount).toBe(2);
    expect(totals.durationMs).toBe(2000);
  });

  it('keeps status and span count over the full wire list even when the tree hides DEBUG', () => {
    const spans = [
      span({ id: 'root' }),
      span({ id: 'bad', parentId: 'root', level: 'ERROR' }),
      span({ id: 'waiting', parentId: 'root', level: 'DEBUG' }),
    ];
    const totals = traceTotals(trace(spans));
    // The DEBUG span never marks an error; the ERROR span still does.
    expect(totals.status).toBe('error');
    // The raw data keeps every span, so the count reflects all three.
    expect(totals.spanCount).toBe(3);
  });

  it('holds every summary number steady across the debug toggle', () => {
    // A generation carrying 15 tokens whose ONLY child is a DEBUG stand-down:
    // hiding debug makes the generation a leaf, showing it does not — but the
    // token total must not flinch either way.
    const spans = [
      span({
        id: 'gen',
        type: 'GENERATION',
        usage: { input_tokens: 10, output_tokens: 5 },
        start: at('2026-01-01T00:00:00Z'),
        end: at('2026-01-01T00:00:02Z'),
      }),
      span({ id: 'waiting', parentId: 'gen', level: 'DEBUG' }),
    ];
    // traceTotals is view-independent by construction (it takes no tree), so the
    // same call stands in for both the hidden and the shown view.
    const totals = traceTotals(trace(spans, { totalCost: 0.25 }));
    expect(totals.totalTokens).toBe(15);
    expect(totals.spanCount).toBe(2);
    expect(totals.status).toBe('success');
    expect(totals.durationMs).toBe(2000);
    // The rendered tree still differs by view, but the roll-up above does not.
    expect(buildTree(spans).byId.has('waiting')).toBe(false);
    expect(buildTree(spans, { includeDebug: true }).byId.has('waiting')).toBe(true);
  });

  it('is success with a null duration when no span errors or carries timing', () => {
    const spans = [span({ id: 'root' })];
    const totals = traceTotals(trace(spans));
    expect(totals.status).toBe('success');
    expect(totals.durationMs).toBeNull();
  });
});
