import type { FormUpdate, ReactionEvent } from '@tai42/api-client';
import { useRef, useState } from 'react';

import type { Reactor } from '../reaction-config';
import { type ReactionFailure, reactionFailure } from './form-lines';

/** The form's reaction round-trips, of which only the latest one counts. */
export interface LatestReaction {
  /**
   * Run one round-trip for `event` with the partial `values` filled so far and apply its
   * update when it is still the latest. Returns the update, or null on a failure.
   */
  readonly fire: (event: ReactionEvent, partial: unknown) => Promise<FormUpdate | null>;
  /** True while the latest round-trip is in flight. */
  readonly reacting: boolean;
  /** The latest round-trip's failure, drawn as the could-not-update line. */
  readonly failure: ReactionFailure | null;
  readonly clearFailure: () => void;
}

/**
 * Runs reaction round-trips so a slow earlier one never overwrites a later one (field
 * changes can fire several in flight): an earlier response is returned to its caller but
 * not applied, and only the latest one sets the busy flag and the failure. A handler
 * error/timeout surfaces LOUDLY as `failure` and returns null, so the caller can hold a
 * page advance or a submit.
 */
export function useLatestReaction(
  react: Reactor,
  apply: (update: FormUpdate) => void,
): LatestReaction {
  const [reacting, setReacting] = useState(false);
  const [failure, setFailure] = useState<ReactionFailure | null>(null);
  const seqRef = useRef(0);

  const fire = async (event: ReactionEvent, partial: unknown): Promise<FormUpdate | null> => {
    const seq = ++seqRef.current;
    setReacting(true);
    setFailure(null);
    try {
      const update = await react(event, partial);
      if (seq !== seqRef.current) return update;
      apply(update);
      return update;
    } catch (error) {
      if (seq === seqRef.current) setFailure(reactionFailure(error));
      return null;
    } finally {
      if (seq === seqRef.current) setReacting(false);
    }
  };

  const clearFailure = (): void => {
    setFailure(null);
  };

  return { fire, reacting, failure, clearFailure };
}
