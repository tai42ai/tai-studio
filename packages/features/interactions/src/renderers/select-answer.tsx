import { Button, Field, RadioGroup, Select } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';
import { useState } from 'react';

import type { AnswerRendererProps } from './answer-schema';
import { asStringArray, nonBlankString, wordingOf } from './answer-schema';
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

  // The choice prompt: the caller's `wording.choice.label`, else the generic word. One
  // text labels the field; the Select's placeholder echoes it with the trailing ellipsis.
  // The submit button carries the caller's `wording.answer.submit`, else "Submit".
  const wording = wordingOf(interaction.format_payload);
  const choiceLabel = nonBlankString(wording?.choice?.label);
  const submitLabel = nonBlankString(wording?.answer?.submit);
  const fieldLabel = choiceLabel ?? 'Choose an option';
  const placeholder = choiceLabel === undefined ? 'Choose an option…' : `${choiceLabel}…`;

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
        placeholder={placeholder}
      />
    );

  return (
    <div style={answerStackStyle}>
      {/* A RadioGroup is a group, so the Field label carries no `for`; a Select
          renders a labelable trigger, so there it still does. */}
      <Field label={fieldLabel} group={options.length <= RADIO_MAX_OPTIONS}>
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
          {submitLabel ?? 'Submit'}
        </Button>
      </div>
    </div>
  );
}
