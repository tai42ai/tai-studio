import { Button, Field, Textarea } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';
import { useState } from 'react';

import type { AnswerRendererProps } from './answer-schema';
import { answerStackStyle } from './renderer-styles';

export function TextAnswer({ onSubmit, disabled }: AnswerRendererProps): ReactNode {
  const [value, setValue] = useState('');
  // Interactions are ONE-SHOT (the door 409s on an already-answered question), so a
  // stray click on an empty control would irreversibly answer `''`. A multi-line
  // textarea suits a free-text answer, and Submit stays disabled until the text has
  // non-whitespace content so an empty answer can never be sent.
  const canSubmit = !disabled && value.trim() !== '';
  return (
    <div style={answerStackStyle}>
      <Field label="Your answer">
        <Textarea
          value={value}
          disabled={disabled}
          onChange={(event) => {
            setValue(event.target.value);
          }}
        />
      </Field>
      <div>
        <Button
          type="button"
          variant="primary"
          disabled={!canSubmit}
          onClick={() => {
            onSubmit(value);
          }}
        >
          Submit
        </Button>
      </div>
    </div>
  );
}
