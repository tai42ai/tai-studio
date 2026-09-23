/**
 * The caller-ask list a synchronous run shows when its tool parked CALLER asks. It is a
 * read-only surface: one row per ask — its prompt and the ask's id. Resuming a parked ask
 * is done by running `resume_parked` from the same panel on the same subject; the list
 * carries no answer control. An empty list is the "parked with no open asks" note rather
 * than a blank box.
 *
 * The list scrolls within a bounded height so many asks never grow the panel unbounded;
 * each prompt truncates to one line with a full-text title tooltip. The ask id is the
 * value an operator copies into a `resume_parked` run, so it carries an accessible label
 * and selects whole in one gesture.
 *
 * A pane that scrolls must be reachable without a pointer (WCAG 2.1.1): while the list
 * actually overflows its bounded height it becomes a focusable, labelled scroll region
 * (arrow keys scroll it), and drops the tab stop again once it fits.
 */
import type { ParkedCallerAsk } from '@tai42/api-client';
import { useOverflowRegion } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

const promptStyle = {
  margin: 0,
  fontWeight: 500,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const;

function AskRow({ ask }: { readonly ask: ParkedCallerAsk }): ReactNode {
  const prompt =
    ask.question !== null && ask.question !== undefined && ask.question !== ''
      ? ask.question
      : '(no prompt)';

  return (
    <li className="tai-stack tai-stack-3" style={{ listStyle: 'none' }} data-testid="ask-row">
      <p title={prompt} style={promptStyle}>
        {prompt}
      </p>
      <div className="tai-row" style={{ margin: 0 }}>
        <span className="tai-muted">Ask id</span>
        <code
          className="tai-mono"
          aria-label={`Ask id ${ask.id}`}
          style={{ userSelect: 'all', wordBreak: 'break-all', minWidth: 0 }}
        >
          {ask.id}
        </code>
      </div>
    </li>
  );
}

/** The note every park surface shows when the run parked with no caller ask left to act on:
 * a status line in the panel's muted tone. `testId` names the surface for its tests. */
export function ParkedNote({ testId }: { readonly testId: string }): ReactNode {
  return (
    <p role="status" className="tai-muted" style={{ margin: 0 }} data-testid={testId}>
      This run parked with no open asks.
    </p>
  );
}

export function AsksList({ asks }: { readonly asks: readonly ParkedCallerAsk[] }): ReactNode {
  // The list IS its own scrolling box (a capped height with its own `overflow-y`),
  // so it wears the region attributes itself rather than nesting a second scroller.
  const region = useOverflowRegion(undefined, 'Caller asks', 'vertical');
  if (asks.length === 0) {
    return <ParkedNote testId="asks-empty" />;
  }
  return (
    <section className="tai-stack">
      <h3 className="tai-card-title">Caller asks</h3>
      <ul
        className="tai-stack"
        data-testid="asks-list"
        style={{ margin: 0, padding: 0, maxHeight: '24rem', overflowY: 'auto' }}
        {...region}
      >
        {asks.map((ask) => (
          <AskRow key={ask.id} ask={ask} />
        ))}
      </ul>
    </section>
  );
}
