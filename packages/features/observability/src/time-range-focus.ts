/**
 * Moves focus to the time range when a read the reader asked for on this page
 * answers too broad: the pressed preset chip of the range picker, or its From input
 * when the range is custom. Focus moves once per entry into the too-broad state.
 * A page that opens straight into the state (a shared link) keeps its focus, so the
 * move happens only when the request differs from the one the page opened with or
 * the page has already shown a result.
 */
import { type RefObject, useEffect, useRef } from 'react';

function rangeFocusTarget(container: HTMLElement): HTMLElement {
  const target =
    container.querySelector<HTMLElement>('button[aria-pressed="true"]') ??
    container.querySelector<HTMLElement>('input');
  if (target === null) {
    throw new Error('The time range holds neither a pressed preset nor a From input to focus.');
  }
  return target;
}

export function useFocusRangeOnTooBroad({
  tooBroad,
  hasResult,
  requestKey,
  rangeRef,
}: {
  /** True while the result area shows the too-broad notice. */
  readonly tooBroad: boolean;
  /** True while the result area shows a result the backend served. */
  readonly hasResult: boolean;
  /** Identifies the read the result area shows (its parameters). */
  readonly requestKey: string;
  /** The container that holds the range picker. */
  readonly rangeRef: RefObject<HTMLElement | null>;
}): void {
  const openingKey = useRef(requestKey);
  const shownResult = useRef(false);
  const wasTooBroad = useRef(false);

  useEffect(() => {
    if (tooBroad && !wasTooBroad.current) {
      if (shownResult.current || requestKey !== openingKey.current) {
        const container = rangeRef.current;
        if (container === null) {
          throw new Error('The too-broad notice shows without its time range mounted.');
        }
        rangeFocusTarget(container).focus();
      }
    }
    wasTooBroad.current = tooBroad;
    if (hasResult) shownResult.current = true;
  }, [tooBroad, hasResult, requestKey, rangeRef]);
}
