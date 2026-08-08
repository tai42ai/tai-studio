/**
 * The pane's ONE announcement channel.
 *
 * A live region reports what changes INSIDE it. An element that mounts with its
 * text already in place changes nothing within itself, so a notice rendered as a
 * fresh `role="status"` node is not reliably announced at all — the region has to
 * be on the page before the words are. This one mounts empty with the pane and
 * stays for its whole life; every message is a text change within it, and the
 * notices themselves render as plain markup.
 *
 * Two announcements with identical text are ONE change, and the second is silent.
 * A message that can be spoken twice therefore names what makes it new — the
 * count it left the pane at — rather than repeating a fixed sentence. A fixed
 * sentence tied to a condition ({@link useStandingNotice}) is taken back out of
 * the region when that condition lifts instead, so its return is a change again.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

export interface LiveRegion {
  /** Say `message`. Identical text twice in a row is one change, so it is said once. */
  readonly announce: (message: string) => void;
  /** Blank the region if `message` is still what it says; anything newer stands. */
  readonly retract: (message: string) => void;
  /** Render once, unconditionally, inside the pane — never behind a condition. */
  readonly region: ReactNode;
}

export function useLiveRegion(testId: string): LiveRegion {
  const [message, setMessage] = useState('');

  const announce = useCallback((next: string) => {
    setMessage(next);
  }, []);

  const retract = useCallback((spoken: string) => {
    setMessage((current) => (current === spoken ? '' : current));
  }, []);

  const region = (
    <span aria-live="polite" className="tai-visually-hidden" data-testid={testId}>
      {message}
    </span>
  );

  return { announce, retract, region };
}

/**
 * A notice announced as its condition appears — `undefined` is no notice — and
 * retracted, emptying the region, when it lifts.
 *
 * The retraction is what makes the notice repeatable: the same condition failing
 * again says the same words, and only an emptied region leaves their return a
 * change to speak. It is not a standing assertion — a later announcement from the
 * pane supersedes it, newest wins, and it is not re-asserted when that message
 * clears; the state a reader comes back to is the on-screen StaleRead notice, not
 * this region. The retraction lands only while the region is still saying those
 * words; anything said since stands.
 */
export function useStandingNotice(live: LiveRegion, message: string | undefined): void {
  const { announce, retract } = live;
  const standing = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (message !== undefined) {
      standing.current = message;
      announce(message);
      return;
    }
    const spoken = standing.current;
    if (spoken === undefined) return;
    standing.current = undefined;
    retract(spoken);
  }, [message, announce, retract]);
}
