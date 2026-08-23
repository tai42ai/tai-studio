/**
 * Pure helpers for the trace explorer: rebuild the span forest from the flat wire
 * list, measure the waterfall extents, pick the default-selected span, and roll up
 * the trace totals.
 */
import type { RunSpan, RunTrace } from '@tai42/api-client';

/** A span with its resolved children and duration; children are sorted by start. */
export interface SpanNode {
  readonly span: RunSpan;
  readonly children: SpanNode[];
  readonly durationMs: number | null;
}

/** The rebuilt trace: its root spans, an id index, the time axis, and the two jumps. */
export interface TraceTree {
  readonly roots: SpanNode[];
  readonly byId: ReadonlyMap<string, SpanNode>;
  /** The earliest span start (ms), or 0 when no span carries a timestamp. */
  readonly t0: number;
  /** The latest span end (ms); always > t0 so the axis has a non-zero span. */
  readonly t1: number;
  /** The slowest non-root span (the real bottleneck), or null. */
  readonly slowestId: string | null;
  /** The earliest-starting ERROR span, or null. */
  readonly firstErrorId: string | null;
}

/** A span's wall-clock duration in ms, or null when either endpoint is missing/bad. */
export function spanDurationMs(span: RunSpan): number | null {
  if (span.start === null || span.end === null) return null;
  const start = new Date(span.start).getTime();
  const end = new Date(span.end).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return end - start;
}

/** A span's start as ms, or `fallback` when it carries no parseable start. */
function startMs(span: RunSpan, fallback: number): number {
  if (span.start === null) return fallback;
  const value = new Date(span.start).getTime();
  return Number.isNaN(value) ? fallback : value;
}

/** Whether a span's level marks it an error. */
export function isErrorSpan(span: RunSpan): boolean {
  return (span.level ?? '').toUpperCase() === 'ERROR';
}

/** Whether a span's level marks it debug-only — hidden from the default tree view. */
export function isDebugSpan(span: RunSpan): boolean {
  return (span.level ?? '').toUpperCase() === 'DEBUG';
}

/** Knobs for {@link buildTree}. */
export interface BuildTreeOptions {
  /** Keep DEBUG-level spans in the emitted tree. Default false — DEBUG is hidden. */
  readonly includeDebug?: boolean;
}

/**
 * Drop DEBUG spans while keeping the forest whole: a surviving child of a dropped
 * span is re-pointed at its nearest surviving ancestor (attaching to a root when
 * none survives), so a subtree is never lost with the debug node. The underlying
 * wire list is untouched — this is a view-only projection for rendering.
 */
function withoutDebug(spans: readonly RunSpan[]): readonly RunSpan[] {
  const dropped = new Set<string>();
  for (const span of spans) if (isDebugSpan(span)) dropped.add(span.id);
  if (dropped.size === 0) return spans;

  const byId = new Map(spans.map((span) => [span.id, span]));
  // Walk up raw `parentId` pointers past dropped spans to the first survivor; a
  // visited set bounds the walk so a pre-existing cycle cannot spin.
  const survivingParent = (parentId: string | null): string | null => {
    const seen = new Set<string>();
    let current: string | null = parentId;
    while (current !== null) {
      if (seen.has(current)) return null;
      seen.add(current);
      if (!dropped.has(current)) return byId.has(current) ? current : null;
      current = byId.get(current)?.parentId ?? null;
    }
    return null;
  };

  const out: RunSpan[] = [];
  for (const span of spans) {
    if (dropped.has(span.id)) continue;
    const parentId = survivingParent(span.parentId);
    out.push(parentId === span.parentId ? span : { ...span, parentId });
  }
  return out;
}

/**
 * Would linking `id` under `parentId` close a cycle? Walk the ancestor chain via
 * raw `parentId` pointers; reaching `id` again — or revisiting any node — means
 * yes. The visited set bounds the walk so a pre-existing cycle cannot spin.
 */
function createsCycle(id: string, parentId: string, byId: ReadonlyMap<string, SpanNode>): boolean {
  const seen = new Set<string>();
  let current: string | null = parentId;
  while (current !== null) {
    if (current === id) return true;
    if (seen.has(current)) return true;
    seen.add(current);
    current = byId.get(current)?.span.parentId ?? null;
  }
  return false;
}

/**
 * Rebuild the span forest, nesting by `parentId` and sorting each sibling list by
 * start. A span attaches to root — never dropped — when its parent is absent, is
 * itself, or linking it would close a cycle, so every span attaches exactly once
 * and the forest stays acyclic.
 */
export function buildTree(spans: readonly RunSpan[], options: BuildTreeOptions = {}): TraceTree {
  // DEBUG spans are dropped from the rendered forest by default (re-parenting
  // their children); the caller opts back in with `includeDebug` to reveal them.
  const visible = options.includeDebug === true ? spans : withoutDebug(spans);
  const byId = new Map<string, SpanNode>();
  for (const span of visible) {
    byId.set(span.id, { span, children: [], durationMs: spanDurationMs(span) });
  }

  const roots: SpanNode[] = [];
  for (const node of byId.values()) {
    const pid = node.span.parentId;
    const parent =
      pid !== null &&
      pid !== node.span.id &&
      byId.has(pid) &&
      !createsCycle(node.span.id, pid, byId)
        ? byId.get(pid)
        : undefined;
    if (parent !== undefined) parent.children.push(node);
    else roots.push(node);
  }

  let t0 = Infinity;
  let t1 = -Infinity;
  let slowestId: string | null = null;
  let slowest = -1;
  let firstErrorId: string | null = null;
  let firstErrorStart = Infinity;

  for (const span of visible) {
    if (span.start !== null) {
      const start = new Date(span.start).getTime();
      if (!Number.isNaN(start)) t0 = Math.min(t0, start);
    }
    if (span.end !== null) {
      const end = new Date(span.end).getTime();
      if (!Number.isNaN(end)) t1 = Math.max(t1, end);
    }
    const duration = spanDurationMs(span);
    // "Slowest" points at the real bottleneck — a non-root span — since a root
    // span usually wraps the whole run and is uninformative.
    const parentId = span.parentId;
    const hasParent = parentId !== null && parentId !== span.id && byId.has(parentId);
    if (duration !== null && hasParent && duration > slowest) {
      slowest = duration;
      slowestId = span.id;
    }
    if (isErrorSpan(span)) {
      const start = startMs(span, 0);
      if (start < firstErrorStart) {
        firstErrorStart = start;
        firstErrorId = span.id;
      }
    }
  }

  const byStart = (a: SpanNode, b: SpanNode): number => startMs(a.span, 0) - startMs(b.span, 0);
  const sortRecursively = (list: SpanNode[]): void => {
    list.sort(byStart);
    for (const node of list) sortRecursively(node.children);
  };
  sortRecursively(roots);

  if (!Number.isFinite(t0)) t0 = 0;
  if (!Number.isFinite(t1) || t1 <= t0) t1 = t0 + 1;

  return { roots, byId, t0, t1, slowestId, firstErrorId };
}

/** The span selected by default when a trace opens: the first error, else the first root. */
export function defaultSelectedId(tree: TraceTree): string | null {
  return tree.firstErrorId ?? tree.roots[0]?.span.id ?? null;
}

// -- token totals ------------------------------------------------------------

/**
 * Allowlisted usage keys counting as INPUT and OUTPUT tokens, plus keys carrying a
 * pre-summed TOTAL. Explicit allowlist, not substring match; any key containing
 * `cost` is excluded so a cost field is never summed as tokens.
 */
const INPUT_TOKEN_KEYS = new Set(['input_tokens', 'inputtokens', 'prompt_tokens', 'prompttokens']);
const OUTPUT_TOKEN_KEYS = new Set([
  'output_tokens',
  'outputtokens',
  'completion_tokens',
  'completiontokens',
]);
const TOTAL_TOKEN_KEYS = new Set(['total_tokens', 'totaltokens', 'total']);

function numericField(usage: Record<string, unknown>, keys: ReadonlySet<string>): number | null {
  for (const [rawKey, value] of Object.entries(usage)) {
    const key = rawKey.toLowerCase();
    if (key.includes('cost')) continue;
    if (keys.has(key) && typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

/**
 * A single span's token count from its `usage` object: input + output from their
 * allowlisted keys, else an explicit total key. No usable usage contributes 0.
 */
export function spanTokens(usage: unknown): number {
  if (usage === null || typeof usage !== 'object' || Array.isArray(usage)) return 0;
  const record = usage as Record<string, unknown>;
  const input = numericField(record, INPUT_TOKEN_KEYS);
  const output = numericField(record, OUTPUT_TOKEN_KEYS);
  if (input !== null || output !== null) return (input ?? 0) + (output ?? 0);
  return numericField(record, TOTAL_TOKEN_KEYS) ?? 0;
}

/** The trace's roll-up summary shown in the header bar. */
export interface TraceTotals {
  readonly status: 'success' | 'error';
  readonly durationMs: number | null;
  readonly totalCost: number | null;
  readonly totalTokens: number;
  readonly spanCount: number;
}

/**
 * Roll up the trace: overall status, wall-clock duration, cost (straight from the
 * wire's `trace.totalCost`), token total, and span count.
 *
 * Tokens are summed over LEAF spans only. A wrapper span typically re-reports the
 * aggregate usage of the generations beneath it, so summing every span
 * double-counts; leaves carry the actual per-call usage, so their sum is the true
 * total without a dedupe pass.
 *
 * The token total is summed over a DEBUG-excluded basis regardless of the view's
 * "Show debug" state: DEBUG spans are no-op stand-down noise that carry no usage,
 * and dropping a childless DEBUG stand-down keeps its parent generation a leaf, so
 * that generation's usage is still attributed — the number stays put across the
 * toggle. Status, duration, and span count read the FULL wire list, so they too
 * describe the whole trace and never move with the view.
 */
export function traceTotals(trace: RunTrace): TraceTotals {
  const tokenBasis = buildTree(trace.spans);
  let totalTokens = 0;
  for (const node of tokenBasis.byId.values()) {
    if (node.children.length === 0) totalTokens += spanTokens(node.span.usage);
  }

  const starts: number[] = [];
  const ends: number[] = [];
  for (const span of trace.spans) {
    if (span.start !== null) {
      const value = new Date(span.start).getTime();
      if (!Number.isNaN(value)) starts.push(value);
    }
    if (span.end !== null) {
      const value = new Date(span.end).getTime();
      if (!Number.isNaN(value)) ends.push(value);
    }
  }
  const durationMs =
    starts.length > 0 && ends.length > 0 ? Math.max(...ends) - Math.min(...starts) : null;

  return {
    status: trace.spans.some(isErrorSpan) ? 'error' : 'success',
    durationMs,
    totalCost: trace.totalCost,
    totalTokens,
    spanCount: trace.spans.length,
  };
}
