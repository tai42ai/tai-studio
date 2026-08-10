/**
 * `useClipboardCopy` — the shared clipboard-write interaction: reads the clipboard the
 * browser actually offers, writes the value, and holds a transient "copied" window
 * (confirmed face + polite announcement) reverting after {@link COPIED_RESET_MS}. A
 * refused write, or a value that throws while being produced, surfaces as a
 * caller-worded error string rather than a throw, so the control shows a visible alert.
 *
 * Only the WORDING is per control, supplied via {@link ClipboardCopyMessages}.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** How long a copy control shows its confirmed state before reverting. */
export const COPIED_RESET_MS = 2000;

/** A copy control's confirmed face; whichever face shows is also its accessible name. */
export const COPIED_LABEL = 'Copied';

/** Announced once on a successful copy, worded so it is never read as the label. */
const COPIED_ANNOUNCEMENT = 'Copied to clipboard';

/**
 * `lib.dom` declares `navigator.clipboard` as always present, but the platform
 * exposes it only in a SECURE CONTEXT — over plain http it is not there at all.
 * Reading the navigator through this shape admits the absence the DOM types deny,
 * so the guard below is a real check rather than a cast around one.
 */
interface MaybeClipboard {
  readonly clipboard?: Clipboard;
}

/** The clipboard this browser actually offers, or `undefined` when it offers none. */
function clipboardOf(host: MaybeClipboard): Clipboard | undefined {
  return host.clipboard;
}

export interface ClipboardCopyMessages {
  /** Shown when the browser offers no clipboard at all (any non-secure context). */
  readonly noClipboard: string;
  /** Shown when the write, or producing the value, is offered and refused. */
  readonly writeFailed: (reason: unknown) => string;
}

export interface ClipboardCopy {
  /** Whether the confirmed window is currently open. */
  readonly copied: boolean;
  /** The last failure's message, or `undefined` while the last copy stands. */
  readonly error: string | undefined;
  /** The polite live-region text: the announcement while confirmed, else empty. */
  readonly announcement: string;
  /**
   * Writes the produced text to the clipboard, returning whether it landed. The
   * value is produced lazily so a serialization that throws is reported through
   * {@link ClipboardCopyMessages.writeFailed}, exactly as a refused write is.
   */
  readonly copy: (produce: () => string) => Promise<boolean>;
}

export function useClipboardCopy(messages: ClipboardCopyMessages): ClipboardCopy {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The write is async, so a copy can be in flight when the control unmounts (a dialog
  // holding it closes on the same click); checked before the resolution touches state.
  // Clearing the timer alone can't cover it — at unmount no timer exists yet.
  const mounted = useRef(true);
  // Wording is read at write time, not closed over, so the callback stays stable even
  // when the caller passes fresh message objects.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    };
  }, []);

  const copy = useCallback(async (produce: () => string): Promise<boolean> => {
    const clipboard = clipboardOf(navigator);
    if (clipboard === undefined) {
      setError(messagesRef.current.noClipboard);
      return false;
    }
    // Clear any prior failure at the START of a new attempt, before awaiting the
    // write, so a stale alert does not linger through an in-flight retry.
    setError(undefined);
    try {
      const text = produce();
      await clipboard.writeText(text);
      if (!mounted.current) return true;
      setCopied(true);
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => {
        if (mounted.current) setCopied(false);
      }, COPIED_RESET_MS);
      return true;
    } catch (reason: unknown) {
      if (mounted.current) setError(messagesRef.current.writeFailed(reason));
      return false;
    }
  }, []);

  return { copied, error, announcement: copied ? COPIED_ANNOUNCEMENT : '', copy };
}
