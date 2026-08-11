/**
 * The compose box at a thread's foot: a textarea and a send button that POST a
 * human message into the thread. One of the conversation monitor's thread
 * mutations, grafted onto the otherwise read-only monitor.
 *
 * On success the input clears and the transcript read is invalidated, so the tail
 * shows the sent message at once rather than on its next poll. A send failure
 * surfaces LOUDLY inline and the typed text is kept — a read-only session may not
 * send, and the refusal is shown, never swallowed.
 */
import { useState, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  ErrorState,
  Field,
  Spinner,
  Textarea,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';

import { conversationTranscriptKey } from './keys';
import { TRANSCRIPT_PAGE_SIZE } from './Transcript';

const formStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-3)',
};

export function ComposeMessage({
  route,
  threadId,
}: {
  readonly route: string;
  readonly threadId: string;
}): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');

  const mutation = useMutation({
    mutationFn: (message: string) =>
      api.sendConversationThreadMessage(route, { thread_id: threadId, text: message }),
    onSuccess: () => {
      setText('');
      void queryClient.invalidateQueries({
        queryKey: conversationTranscriptKey(route, threadId, TRANSCRIPT_PAGE_SIZE),
      });
    },
  });

  const trimmed = text.trim();
  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    if (trimmed === '') return;
    mutation.mutate(trimmed);
  };

  return (
    <Card>
      <form aria-label="Send a message" onSubmit={onSubmit} style={formStyle}>
        <Field label="Message">
          <Textarea
            value={text}
            placeholder="Type a reply…"
            disabled={mutation.isPending}
            onChange={(event) => {
              setText(event.target.value);
            }}
          />
        </Field>
        {mutation.isError ? <ErrorState message={errorMessage(mutation.error)} /> : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="submit" variant="primary" disabled={mutation.isPending || trimmed === ''}>
            {mutation.isPending ? <Spinner label="Sending" /> : null}
            Send
          </Button>
        </div>
      </form>
    </Card>
  );
}
