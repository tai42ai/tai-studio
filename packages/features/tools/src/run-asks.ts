/**
 * Normalize a synchronous run-tool result into what the panel shows: a final value,
 * a list of caller asks, or a user-only park with nothing for the caller.
 *
 * A run whose tool asked its CALLER and parked returns the caller-ask envelope
 * `{asks: [...]}`; a run that parked only USER asks returns the suspension receipt
 * (ids only, no caller ask for the panel to show). Running `resume_parked` /
 * `cancel_parked` on a parked subject returns a visit outcome
 * (`{action, cancelled, kind, result, asks}`), which is read by its `kind` into the
 * same three views. Anything else is the tool's own value.
 */
import { type ParkedCallerAsk, schemas } from '@tai42/api-client';

/** The three surfaces the run panel shows for a resolved run. */
export type RunView =
  | { readonly kind: 'result'; readonly result: unknown }
  | { readonly kind: 'asks'; readonly asks: readonly ParkedCallerAsk[] }
  | { readonly kind: 'parked' };

/**
 * Read a run-tool result into a run view. A visit outcome (what `resume_parked` /
 * `cancel_parked` return) is read by its `kind`; the caller-ask envelope and the
 * user-only park receipt are the platform's two park shapes; any other value is the
 * tool's own result. The visit outcome is matched first: its `action` and `kind`
 * fields set it apart from a plain envelope, which would otherwise match on `asks`
 * alone. A `none` outcome carries no value and shows as an empty result.
 */
export function readRunResult(result: unknown): RunView {
  const visit = schemas.visitOutcome.safeParse(result);
  if (visit.success) {
    const outcome = visit.data;
    if (outcome.kind === 'asks') return { kind: 'asks', asks: outcome.asks };
    if (outcome.kind === 'parked') return { kind: 'parked' };
    return { kind: 'result', result: outcome.kind === 'result' ? outcome.result : null };
  }
  const asks = schemas.callerAsksEnvelope.safeParse(result);
  if (asks.success) return { kind: 'asks', asks: asks.data.asks };
  const parked = schemas.suspendedRunReceipt.safeParse(result);
  if (parked.success) return { kind: 'parked' };
  return { kind: 'result', result };
}
