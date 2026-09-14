import { useState } from 'react';
import type { ReactNode } from 'react';

import { Button, Field, RadioGroup, Select } from '@tai42/studio-sdk';

import { asStringArray } from './answer-schema';
import type { AnswerRendererProps } from './answer-schema';
import { MalformedPayload } from './malformed-payload';
import { answerStackStyle } from './renderer-styles';

/** At most this many `select` options render as radios; more fall back to a Select. */
const RADIO_MAX_OPTIONS = 3;

export function SelectAnswer({ interaction, onSubmit, disabled }: AnswerRendererProps): ReactNode {
  // `''` = nothing chosen yet; the control stays CONTROLLED from first render.
  const [choice, setChoice] = useState('');
  const options = asStringArray(interaction.format_payload.options);
  if (options === null) {
    return (
      <MalformedPayload message="This select question is malformed: its options must be a list of text choices." />
    );
  }

  const items = options.map((option) => ({ value: option, label: option }));
  const control =
    options.length <= RADIO_MAX_OPTIONS ? (
      <RadioGroup options={items} value={choice} onValueChange={setChoice} disabled={disabled} />
    ) : (
      <Select
        options={items}
        value={choice}
        onValueChange={setChoice}
        disabled={disabled}
        placeholder="Choose an option…"
      />
    );

  return (
    <div style={answerStackStyle}>
      {/* A RadioGroup is a group, so the Field label carries no `for`; a Select
          renders a labelable trigger, so there it still does. */}
      <Field label="Choose an option" group={options.length <= RADIO_MAX_OPTIONS}>
        {control}
      </Field>
      <div>
        <Button
          type="button"
          variant="primary"
          disabled={disabled || choice === ''}
          onClick={() => {
            onSubmit(choice);
          }}
        >
          Submit
        </Button>
      </div>
    </div>
  );
}
