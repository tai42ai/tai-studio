/**
 * The view-model for one manifest-section add/remove editor: the add-entries form
 * state, the add/remove mutations, and the parse-then-add handler.
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { errorMessage } from '@tai42/studio-sdk';
import { summarizeFleetFanout } from '@tai42/api-client';

import { manifestKey } from '../keys';

/** The apply-result slice these editors render — the fleet fan-out the shared report
 *  handler interprets. The client methods return a wider result (`status`/`env_keys`
 *  too); this names only what the surface reads. */
export interface ApplyFanout {
  readonly fanout: Parameters<typeof summarizeFleetFanout>[0];
}

/** Parse the add-entries buffer into a list of entries, each an object carrying a
 *  non-empty `title` string. Accepts a single object or an array of them; anything
 *  else is a loud message (no request is sent). */
export function parseEntries(text: string): { entries: unknown[] } | { error: string } {
  const trimmed = text.trim();
  if (trimmed === '') return { error: 'Enter one entry object, or an array of them.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch (error) {
    return { error: `Invalid JSON: ${errorMessage(error)}` };
  }
  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (list.length === 0) return { error: 'Enter at least one entry.' };
  for (const [index, entry] of list.entries()) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return { error: `Entry ${String(index + 1)} must be a JSON object with a "title".` };
    }
    const title = (entry as Record<string, unknown>).title;
    if (typeof title !== 'string' || title.trim() === '') {
      return { error: `Entry ${String(index + 1)} must carry a non-empty "title" string.` };
    }
  }
  return { entries: list };
}

export function useEntrySection(
  add: (entries: unknown[], replace: boolean) => Promise<ApplyFanout>,
  remove: (title: string) => Promise<ApplyFanout>,
) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [replace, setReplace] = useState(false);
  const [parseError, setParseError] = useState<string | undefined>(undefined);
  const [removeTitle, setRemoveTitle] = useState('');
  const [confirmTitle, setConfirmTitle] = useState<string | null>(null);

  const invalidate = (): Promise<void> => queryClient.invalidateQueries({ queryKey: manifestKey });

  const addMutation = useMutation({
    mutationFn: (args: { entries: unknown[]; replace: boolean }) => add(args.entries, args.replace),
    onSuccess: async () => {
      await invalidate();
      setText('');
    },
  });
  const removeMutation = useMutation({
    mutationFn: (title: string) => remove(title),
    onSuccess: async () => {
      await invalidate();
      setConfirmTitle(null);
      setRemoveTitle('');
    },
  });

  const onAdd = (): void => {
    const parsed = parseEntries(text);
    if ('error' in parsed) {
      setParseError(parsed.error);
      return;
    }
    setParseError(undefined);
    addMutation.mutate({ entries: parsed.entries, replace });
  };

  const trimmedRemove = removeTitle.trim();

  return {
    text,
    setText,
    replace,
    setReplace,
    parseError,
    removeTitle,
    setRemoveTitle,
    confirmTitle,
    setConfirmTitle,
    addMutation,
    removeMutation,
    onAdd,
    trimmedRemove,
  };
}
