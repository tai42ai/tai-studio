/**
 * The compose dialog's identity fields: the required Name and Description, and the
 * overlay Tags input (hidden when the tool_meta store is off, so an author never
 * types categorization tags the OFF overlay would silently drop).
 */
import { Field, TagsInput, TextInput } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

export function ComposeIdentityFields({
  name,
  onNameChange,
  description,
  onDescriptionChange,
  tags,
  onTagsChange,
  toolMetaOff,
  submitted,
}: {
  readonly name: string;
  readonly onNameChange: (value: string) => void;
  readonly description: string;
  readonly onDescriptionChange: (value: string) => void;
  readonly tags: string[];
  readonly onTagsChange: (value: string[]) => void;
  readonly toolMetaOff: boolean;
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
          placeholder="assistant"
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
          placeholder="An assistant agent"
        />
      </Field>

      {toolMetaOff ? null : (
        <Field label="Tags" description="Categorization labels for this agent.">
          <TagsInput value={tags} onChange={onTagsChange} />
        </Field>
      )}
    </>
  );
}
