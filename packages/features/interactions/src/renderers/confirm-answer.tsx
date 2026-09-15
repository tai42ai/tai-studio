import { Button } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import type { AnswerRendererProps } from './answer-schema';
import { buttonRowStyle } from './renderer-styles';

export function ConfirmAnswer({ onSubmit, disabled }: AnswerRendererProps): ReactNode {
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
        Yes
      </Button>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => {
          onSubmit(false);
        }}
      >
        No
      </Button>
    </div>
  );
}
