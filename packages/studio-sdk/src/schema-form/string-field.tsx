/**
 * The string field renderer. A plain string renders as a text input (its
 * `type` derived from any JSON-Schema `format`); a media-annotated schema
 * renders the upload control instead; and when the form supplies a completion
 * provider, the input is backed by argument autocomplete.
 */
import type { ReactNode } from 'react';
import { useCallback, useContext } from 'react';

import { CompletionInput } from '../components/completion-input';
import { Field } from '../components/field';
import { TextInput } from '../components/inputs';
import type { MediaUpload } from './classify';
import { CompletionProviderContext } from './context';
import { MediaField } from './media-field';
import type { CompletionProvider } from './SchemaForm';

export function StringField({
  heading,
  description,
  error,
  format,
  media,
  argName,
  value,
  required,
  onChange,
}: {
  heading: string;
  description: string | undefined;
  error: string | undefined;
  format: string | undefined;
  media: MediaUpload | undefined;
  argName: string;
  value: unknown;
  required: boolean;
  onChange: (value: unknown) => void;
}): ReactNode {
  const completionProvider = useContext(CompletionProviderContext);
  const current = typeof value === 'string' ? value : '';
  // An empty optional field emits `undefined` (drops the key); a required one
  // keeps the empty string so validation can flag it.
  const emit = (next: string): void => {
    onChange(next === '' && !required ? undefined : next);
  };

  // A media-annotated field renders the upload control instead of a text box.
  if (media !== undefined) {
    return (
      <MediaField
        heading={heading}
        description={description}
        error={error}
        media={media}
        value={current}
        onChange={emit}
      />
    );
  }

  return (
    <Field label={heading} description={description} error={error}>
      {completionProvider !== undefined ? (
        <CompletionField
          argName={argName}
          value={current}
          onChange={emit}
          provider={completionProvider}
        />
      ) : (
        <TextInput
          type={stringInputType(format)}
          value={current}
          onChange={(event) => {
            emit(event.target.value);
          }}
        />
      )}
    </Field>
  );
}

/**
 * A string field backed by argument completions. Split out so its memoised
 * hooks stay unconditional (they cannot live behind the provider check in
 * {@link StringField}) and so the completion `provider` is a non-optional prop.
 */
function CompletionField({
  argName,
  value,
  onChange,
  provider,
}: {
  argName: string;
  value: string;
  onChange: (value: string) => void;
  provider: CompletionProvider;
}): ReactNode {
  // Memoised so its identity is stable across renders: CompletionInput lists
  // `fetchCompletions` in its effect deps, so a fresh function each render would
  // re-fetch on every keystroke in every string field.
  const fetchCompletions = useCallback(
    (partial: string) => provider(argName, partial),
    [provider, argName],
  );
  // A completion fetch is a best-effort enhancement, not a fatal error — but it
  // must never be swallowed silently. Surface the failure with the field's path
  // for context. Memoised for the same effect-deps reason as `fetchCompletions`.
  const onError = useCallback(
    (error: unknown) => {
      console.error(`SchemaForm: completion fetch failed for field "${argName}"`, error);
    },
    [argName],
  );

  return (
    <CompletionInput
      value={value}
      onChange={onChange}
      fetchCompletions={fetchCompletions}
      onError={onError}
    />
  );
}

const FORMAT_INPUT_TYPES: Record<string, string> = {
  email: 'email',
  uri: 'url',
  'uri-reference': 'url',
  date: 'date',
  'date-time': 'datetime-local',
  time: 'time',
};

function stringInputType(format: string | undefined): string {
  if (format === undefined) return 'text';
  return FORMAT_INPUT_TYPES[format] ?? 'text';
}
