import { Button } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import type { AnswerRendererProps } from './answer-schema';
import { nonBlankString, wordingOf } from './answer-schema';
import { buttonRowStyle } from './renderer-styles';

export function ConfirmAnswer({ interaction, onSubmit, disabled }: AnswerRendererProps): ReactNode {
  // The affirmative control carries the caller's `wording.answer.confirm`, else "Yes"; the
  // negative carries `wording.answer.decline`, else "No".
  const answer = wordingOf(interaction.format_payload)?.answer;
  const confirmLabel = nonBlankString(answer?.confirm);
  const declineLabel = nonBlankString(answer?.decline);
  return (
    <div style={buttonRowStyle}>
      <Button
        type="button"
        variant="primary"
        disabled={disabled}
        onClick={() => {
          onSubmit(true);
        }}
      >
        {confirmLabel ?? 'Yes'}
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => {
          onSubmit(false);
        }}
      >
        {declineLabel ?? 'No'}
      </Button>
    </div>
  );
}
