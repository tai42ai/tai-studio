import type { FormOption, FormPage } from '@tai42/api-client';
import { schemas } from '@tai42/api-client';
import type { JsonSchema, SchemaFormErrors } from '@tai42/studio-sdk';
import { Button, SchemaForm, validateAgainstSchema } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';

import type { AnswerRendererProps } from './answer-schema';
import { initialFormValue, isPlainObject, schemaWithSendOptions } from './answer-schema';
import { MalformedPayload } from './malformed-payload';
import {
  answerStackStyle,
  contextHeadingStyle,
  contextListStyle,
  formContextStyle,
  optionFieldStyle,
  optionRowStyle,
  optionValuesStyle,
  pagesListStyle,
} from './renderer-styles';

export function FormAnswer({ interaction, onSubmit, disabled }: AnswerRendererProps): ReactNode {
  const raw = interaction.format_payload.schema;
  if (!isPlainObject(raw)) {
    return (
      <MalformedPayload message="This form question is malformed: its schema must be an object." />
    );
  }

  // An absent `data`/`pages` leaves the preview exactly the bare form. A
  // present-but-malformed block is a LOUD notice, never a silent drop: the server
  // validates both against the schema before delivery, so a bad shape here is a
  // corrupt frame, refused like a non-object schema rather than answered against a
  // half-understood prefill.
  const rawData = interaction.format_payload.data;
  const parsedData = rawData === undefined ? null : schemas.formData.safeParse(rawData);
  if (parsedData !== null && !parsedData.success) {
    return (
      <MalformedPayload message="This form question is malformed: its prefilled data is not in the expected shape." />
    );
  }

  const rawPages = interaction.format_payload.pages;
  const parsedPages = rawPages === undefined ? null : schemas.formPages.safeParse(rawPages);
  if (parsedPages !== null && !parsedPages.success) {
    return (
      <MalformedPayload message="This form question is malformed: its pages are not in the expected shape." />
    );
  }

  // The permissive `JsonSchema` structural type is a plain record with an unknown
  // index signature; the renderer classifies each node at runtime.
  return (
    <SchemaFormAnswer
      schema={raw}
      values={parsedData?.data.values ?? {}}
      options={parsedData?.data.options ?? {}}
      pages={parsedPages?.data ?? []}
      onSubmit={onSubmit}
      disabled={disabled}
    />
  );
}

function SchemaFormAnswer({
  schema,
  values,
  options,
  pages,
  onSubmit,
  disabled,
}: {
  readonly schema: JsonSchema;
  readonly values: Record<string, unknown>;
  readonly options: Record<string, readonly FormOption[]>;
  readonly pages: readonly FormPage[];
  readonly onSubmit: (answer: unknown) => void;
  readonly disabled: boolean;
}): ReactNode {
  // The schema the controls and the validator both use: the published schema with each
  // re-optioned property's enum set to this send's values, so the operator picks from
  // the valid set in the control and a bad choice cannot be typed. Prefilled `values`
  // seed the initial value on top; a prefill outside the per-send set cannot occur
  // (the ask door validates each value against the effective schema before delivery).
  const effectiveSchema = useMemo(() => schemaWithSendOptions(schema, options), [schema, options]);
  const [value, setValue] = useState<unknown>(() => initialFormValue(effectiveSchema, values));
  const [errors, setErrors] = useState<SchemaFormErrors>({});

  const submit = (): void => {
    const found = validateAgainstSchema(effectiveSchema, value);
    setErrors(found);
    if (Object.keys(found).length === 0) onSubmit(value);
  };

  return (
    <div style={answerStackStyle}>
      <FormPagesOutline pages={pages} />
      <SchemaForm schema={effectiveSchema} value={value} onChange={setValue} errors={errors} />
      <FormSendOptions options={options} />
      <div>
        <Button type="button" variant="primary" disabled={disabled} onClick={submit}>
          Submit
        </Button>
      </div>
    </div>
  );
}

/** The read-only "Pages" outline: each page's title over the fields it groups. */
function FormPagesOutline({ pages }: { readonly pages: readonly FormPage[] }): ReactNode {
  if (pages.length === 0) return null;
  return (
    <section style={formContextStyle} data-testid="form-pages" aria-label="Pages">
      <p style={contextHeadingStyle}>Pages</p>
      <ol style={pagesListStyle}>
        {pages.map((page, index) => (
          <li key={index}>
            <span style={{ color: 'var(--tai-color-text)' }}>{page.title}</span>
            {page.fields.length > 0 ? <span> — {page.fields.join(', ')}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * One option as text. The re-optioned control shows the VALUE, so a labelled option
 * reads `label (value)` to make the value→label mapping legible; an unlabelled one (or
 * a label equal to the value) is just the value, never an empty choice.
 */
function optionText(option: FormOption): string {
  const label = typeof option.label === 'string' ? option.label.trim() : '';
  return label !== '' && label !== option.value ? `${label} (${option.value})` : option.value;
}

/**
 * The read-only "Options for this send" list: per field, the value→label mapping this
 * send offered — the control renders the values, so this block names what each means.
 * A field whose per-send list is empty is omitted; with no field carrying one the whole
 * block is absent.
 */
function FormSendOptions({
  options,
}: {
  readonly options: Record<string, readonly FormOption[]>;
}): ReactNode {
  const fields = Object.entries(options).filter(([, list]) => list.length > 0);
  if (fields.length === 0) return null;
  return (
    <section
      style={formContextStyle}
      data-testid="form-send-options"
      aria-label="Options for this send"
    >
      <p style={contextHeadingStyle}>Options for this send</p>
      <dl style={contextListStyle}>
        {fields.map(([field, list]) => (
          <div key={field} style={optionRowStyle}>
            <dt style={optionFieldStyle}>{field}</dt>
            <dd style={optionValuesStyle}>{list.map(optionText).join(', ')}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
