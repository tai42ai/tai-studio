/**
 * The create form's identity fields: the required Name and Description. Both gate
 * submit (the API rejects an empty description with a 422), shown as a loud inline
 * field error once the form is submitted.
 */
import { Field, TextInput } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

export function PresetIdentityFields({
  name,
  onNameChange,
  description,
  onDescriptionChange,
  submitted,
}: {
  readonly name: string;
  readonly onNameChange: (value: string) => void;
  readonly description: string;
  readonly onDescriptionChange: (value: string) => void;
  readonly submitted: boolean;
}): ReactNode {
  const nameMissing = name.trim() === '';
  const descriptionMissing = description.trim() === '';
  return (
    <>
      <Field label="Name" error={submitted && nameMissing ? 'A name is required.' : undefined}>
        <TextInput
          value={name}
          onChange={(event) => {
            onNameChange(event.target.value);
          }}
          placeholder="paris_weather"
          aria-required
        />
      </Field>

      <Field
        label="Description"
        error={submitted && descriptionMissing ? 'A description is required.' : undefined}
      >
        <TextInput
          value={description}
          onChange={(event) => {
            onDescriptionChange(event.target.value);
          }}
          placeholder="Paris weather"
          aria-required
        />
      </Field>
    </>
  );
}
