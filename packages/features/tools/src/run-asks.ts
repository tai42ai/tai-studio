/**
 * Read a run answer into what the panel shows. The api-client parses every run-tool body
 * (and every parked record's answer) with the served `RunAnswer` union, so the reader
 * switches on its `kind`: `result` is the tool's own value, `asks` the caller asks the run
 * parked on, `parked` a park with only user asks left, `none` an empty result. A tool value
 * that happens to look like a park is a `result` and shows as one. A body the api-client
 * refused arrives as an `ApiSchemaError`, whose first issue names the unreadable panel's
 * details.
 */
import type { ApiSchemaError, ParkedCallerAsk, RunAnswer } from '@tai42/api-client';

/** The three surfaces the run panel shows for a resolved run. */
export type RunView =
  | { readonly kind: 'result'; readonly result: unknown }
  | { readonly kind: 'asks'; readonly asks: readonly ParkedCallerAsk[] }
  | { readonly kind: 'parked' };

/** Read a served run answer into a run view, by its `kind`. */
export function readRunResult(answer: RunAnswer): RunView {
  switch (answer.kind) {
    case 'result':
      return { kind: 'result', result: answer.result };
    case 'asks':
      return { kind: 'asks', asks: answer.asks };
    case 'parked':
      return { kind: 'parked' };
    case 'none':
      return { kind: 'result', result: null };
  }
}

/** One schema issue as the refusal carries it: a dotted path and its message. */
function isIssue(value: unknown): value is { path: readonly PropertyKey[]; message: string } {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.path) && typeof record.message === 'string';
}

/** The first issue of a refused answer, as `<path>: <message>` (the message alone at the
 *  root); a transport refusal that carries text (not JSON, no envelope) is that text. */
export function unreadableIssue(error: ApiSchemaError): string {
  const { issues } = error;
  if (typeof issues === 'string') return issues;
  const first: unknown = Array.isArray(issues) ? issues[0] : undefined;
  if (!isIssue(first)) return error.message;
  const path = first.path.map(String).join('.');
  return path === '' ? first.message : `${path}: ${first.message}`;
}
