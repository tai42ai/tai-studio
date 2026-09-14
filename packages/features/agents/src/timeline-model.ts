/**
 * The timeline item model: the readonly display items the fold produces, plus the
 * mutable twins patched in place while folding (a growing message bubble and a tool
 * call awaiting its paired result).
 */

export type TimelineItem =
  | { readonly kind: 'reasoning'; readonly id: string; readonly text: string }
  | {
      readonly kind: 'tool';
      readonly id: string;
      readonly tool: string;
      readonly args: Record<string, unknown>;
      readonly callId: string;
      readonly hasResult: boolean;
      readonly result: unknown;
      readonly isError: boolean;
    }
  | {
      readonly kind: 'message';
      readonly id: string;
      readonly text: string;
      readonly settled: boolean;
    }
  | {
      readonly kind: 'usage';
      readonly id: string;
      readonly inputTokens: number | null;
      readonly outputTokens: number | null;
      readonly totalTokens: number | null;
      readonly model: string | null;
    }
  | { readonly kind: 'structured'; readonly id: string; readonly data: unknown }
  | {
      readonly kind: 'interrupt';
      readonly id: string;
      readonly interruptId: string;
      readonly reason: string | null;
      readonly payload: unknown;
    }
  | { readonly kind: 'error'; readonly id: string; readonly message: string }
  | { readonly kind: 'unknown'; readonly id: string; readonly type: string; readonly raw: unknown };

/** Whether the folded stream has reached a terminal frame (`stream.end`/`.error`). */
export interface TimelineFold {
  readonly items: TimelineItem[];
  readonly finished: boolean;
  readonly errored: boolean;
}

// The two variants patched in place during the fold: the growing message bubble
// (`text`/`settled`) and the tool call awaiting its paired result
// (`hasResult`/`result`/`isError`). They are the mutable twins of the readonly
// `TimelineItem` members of the same `kind` — mutable is assignable to readonly,
// so the built array narrows to `TimelineItem[]` with no cast.
export interface MutableMessage {
  kind: 'message';
  id: string;
  text: string;
  settled: boolean;
}

export interface MutableTool {
  kind: 'tool';
  id: string;
  tool: string;
  args: Record<string, unknown>;
  callId: string;
  hasResult: boolean;
  result: unknown;
  isError: boolean;
}

// Every fold item: the two mutable twins above plus the remaining `TimelineItem`
// variants, which are pushed once and never patched.
export type MutableItem =
  | MutableMessage
  | MutableTool
  | Extract<
      TimelineItem,
      { kind: 'reasoning' | 'usage' | 'structured' | 'interrupt' | 'error' | 'unknown' }
    >;
