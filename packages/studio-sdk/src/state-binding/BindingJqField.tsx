/**
 * The jq input every field a binding owns renders through — the Subject/Scope
 * expressions, a custom injection or update jq, an adapter escape hatch, an op-id.
 *
 * It reuses the form door pattern: when a host has injected an expression editor
 * through {@link ExpressionFieldContext} (the visual jq editor from
 * `@tai42/jq-studio`), that door renders here; with no door it falls back to a
 * plain multiline textarea, so this package keeps NO edge to the jq subgraph.
 *
 * The attached templates' template jq are offered as an autocomplete source: an
 * `Insert` control per jq name appends the call `tjq_<name>({…})` to the
 * expression — the attachment-qualified `tjq_<attachment>__<name>` form when a name is
 * ambiguous across attachments.
 */
import { useContext, type ReactNode } from 'react';

import { Button } from '../components/primitives';
import { PlusIcon } from '../components/icons';
import { Field } from '../components/field';
import { Textarea } from '../components/inputs';
import { ExpressionFieldContext } from '../schema-form/context';
import { generateTemplateCall } from './adapter';

/** One template jq offered as an insertable autocomplete entry. */
export interface TemplateJqSuggestion {
  /** The jq reference, e.g. `active` or the attachment-qualified `tally.bump`. */
  readonly ref: string;
  readonly purpose: 'input' | 'update';
  readonly description?: string;
}

export interface BindingJqFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly description?: ReactNode;
  readonly error?: string;
  readonly placeholder?: string;
  /** Template jq offered as `tjq_<name>({…})` inserts under the field. */
  readonly suggestions?: readonly TemplateJqSuggestion[];
}

/** Append a `tjq_<name>({…})` template call to the current expression (space-separated when non-empty). */
export function appendTjq(current: string, ref: string): string {
  const call = generateTemplateCall(ref, []);
  const trimmed = current.trim();
  return trimmed === '' ? call : `${trimmed} ${call}`;
}

export function BindingJqField({
  label,
  value,
  onChange,
  description,
  error,
  placeholder,
  suggestions = [],
}: BindingJqFieldProps): ReactNode {
  const Door = useContext(ExpressionFieldContext);
  // A stable hook for e2e: the injected jq editor owns its own DOM, so the wrapper
  // carries the field's identity (`binding-jq-<label>`) for the driver to locate.
  const testId = `binding-jq-${label.trim().replace(/\s+/g, '-').toLowerCase()}`;
  // Only `input`-purpose jq are callable from an expression; an `update` jq returns an
  // op batch and is picked solely by an update's own select — never offered as an insert.
  const inputSuggestions = suggestions.filter((suggestion) => suggestion.purpose === 'input');

  return (
    <div
      data-testid={testId}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-1)' }}
    >
      {Door !== undefined ? (
        <Door
          label={label}
          value={value}
          onChange={onChange}
          description={description}
          error={error}
          multiline
        />
      ) : (
        <Field
          label={label}
          description={typeof description === 'string' ? description : undefined}
          error={error}
        >
          <Textarea
            value={value}
            placeholder={placeholder}
            onChange={(event) => {
              onChange(event.target.value);
            }}
            aria-invalid={error !== undefined ? true : undefined}
          />
        </Field>
      )}
      {inputSuggestions.length > 0 ? (
        <div
          role="group"
          aria-label={`Insert template jq into ${label}`}
          style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--tai-space-1)' }}
        >
          {inputSuggestions.map((suggestion) => (
            <Button
              key={suggestion.ref}
              type="button"
              variant="secondary"
              // A compact outlined pill: the leading plus reads it as an insert
              // affordance so the monospace call text is a control, not stray code.
              style={{
                minHeight: 'auto',
                padding: 'var(--tai-space-1) var(--tai-space-2)',
                borderRadius: 'var(--tai-radius-full)',
                fontFamily: 'var(--tai-font-mono)',
                fontSize: 'var(--tai-text-sm)',
              }}
              title={
                suggestion.description !== undefined && suggestion.description !== ''
                  ? `${suggestion.purpose} — ${suggestion.description}`
                  : suggestion.purpose
              }
              onClick={() => {
                onChange(appendTjq(value, suggestion.ref));
              }}
            >
              <PlusIcon />
              {generateTemplateCall(suggestion.ref, [])}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
