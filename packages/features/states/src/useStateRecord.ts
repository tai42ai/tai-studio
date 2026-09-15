/**
 * The per-subject record's server reads, mutations and editor state. The document
 * read returns `null` for "no document yet" (a first-class state), never an error.
 * A successful save closes the editor and invalidates the record + its write trail; a
 * successful erase closes the confirm and invalidates the record.
 */
import type { StateDetail, StateRecord, StateSubjectRef } from '@tai42/api-client';
import { type JsonSchema, useApi } from '@tai42/studio-sdk';
import {
  useMutation,
  type UseMutationResult,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useState } from 'react';

import { stateDetailKey, stateRecordKey, stateWritesKey } from './keys';

export interface EditorState {
  readonly mode: 'closed' | 'edit' | 'create';
}

export interface StateRecordController {
  readonly detailQuery: UseQueryResult<StateDetail>;
  readonly recordQuery: UseQueryResult<StateRecord | null>;
  readonly effectiveSchema: JsonSchema | null;
  readonly record: StateRecord | null;
  readonly editor: EditorState;
  readonly setEditor: (editor: EditorState) => void;
  readonly eraseOpen: boolean;
  readonly setEraseOpen: (open: boolean) => void;
  readonly saveMutation: UseMutationResult<unknown, Error, Record<string, unknown>>;
  readonly eraseMutation: UseMutationResult<unknown, Error, void>;
}

export function useStateRecord({
  stateName,
  subject,
}: {
  readonly stateName: string;
  readonly subject: StateSubjectRef;
}): StateRecordController {
  const api = useApi();
  const queryClient = useQueryClient();

  const detailQuery = useQuery({
    queryKey: stateDetailKey(stateName),
    queryFn: ({ signal }) => api.getState(stateName, signal),
  });
  const recordQuery = useQuery({
    queryKey: stateRecordKey(stateName, subject),
    queryFn: ({ signal }): Promise<StateRecord | null> =>
      api.getStateRecord(stateName, subject, signal),
  });

  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' });
  const [eraseOpen, setEraseOpen] = useState(false);

  // The record form validates and seeds against the platform-resolved `effective_schema`
  // (the base schema composed with every attachment).
  const effectiveSchema = detailQuery.data?.effective_schema ?? null;

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.putStateRecord(stateName, subject, data),
    onSuccess: () => {
      setEditor({ mode: 'closed' });
      void queryClient.invalidateQueries({ queryKey: stateRecordKey(stateName, subject) });
      void queryClient.invalidateQueries({ queryKey: stateWritesKey(stateName, subject) });
    },
  });

  const eraseMutation = useMutation({
    mutationFn: () => api.deleteStateRecord(stateName, subject),
    onSuccess: () => {
      setEraseOpen(false);
      void queryClient.invalidateQueries({ queryKey: stateRecordKey(stateName, subject) });
    },
  });

  return {
    detailQuery,
    recordQuery,
    effectiveSchema,
    record: recordQuery.data ?? null,
    editor,
    setEditor,
    eraseOpen,
    setEraseOpen,
    saveMutation,
    eraseMutation,
  };
}
