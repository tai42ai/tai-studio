/**
 * The templated-text field renderer: a property typed as the platform's templated
 * text is authored through the shared {@link TemplatedTextField} — inline content or
 * a stored template id, plus the render kwargs — exactly as a hand-built templated
 * field is. When the property carries an `x-tai42-expression` annotation and the host
 * injected an expression door, the inline editor IS that door (the resting control
 * plus its visual-editor button); otherwise it is the field's plain textarea.
 *
 * The stored-template catalog comes from the host's {@link TemplatedTextCatalogContext}
 * hook, called only here, so only a form that draws a templated-text field reads it.
 */
import type { TemplatedText } from '@tai42/api-client';
import { type ReactNode, useContext, useState } from 'react';

import {
  TemplatedTextField,
  type TemplatedTextInlineProps,
} from '../components/templated-text-field';
import { isRecord } from '../guards';
import { ExpressionFieldContext, TemplatedTextCatalogContext } from './context';
import { ExpressionField } from './expression-field';
import type { ExpressionAnnotation } from './field-model';

/** The form value read as a templated text: its string source(s) and its kwargs. */
function templatedTextOf(value: unknown): TemplatedText | null {
  if (!isRecord(value)) return null;
  const { content, id, kwargs } = value;
  return {
    ...(typeof content === 'string' ? { content } : {}),
    ...(typeof id === 'string' ? { id } : {}),
    ...(isRecord(kwargs) ? { kwargs } : {}),
  };
}

/**
 * Which mount of the field is current. The field seeds its editing state from the
 * value once, so a value the caller REPLACES (not one this field emitted) mounts a
 * fresh field seeded from it.
 */
interface Mount {
  readonly value: unknown;
  readonly emitted: unknown;
  readonly generation: number;
}

export function TemplatedField({
  heading,
  description,
  error,
  expression,
  argName,
  required,
  value,
  onChange,
}: {
  heading: string;
  description: string | undefined;
  error: string | undefined;
  expression: ExpressionAnnotation | undefined;
  argName: string;
  required: boolean;
  value: unknown;
  onChange: (value: unknown) => void;
}): ReactNode {
  const useCatalog = useContext(TemplatedTextCatalogContext);
  const catalog = useCatalog();
  const door = useContext(ExpressionFieldContext);
  const [mount, setMount] = useState<Mount>({ value, emitted: value, generation: 0 });
  if (mount.value !== value) {
    setMount({
      value,
      emitted: mount.emitted,
      generation: value === mount.emitted ? mount.generation : mount.generation + 1,
    });
  }

  // An emptied optional field drops its key; a required one keeps its empty source
  // (the shared field emits it), so validation names the missing source and a union
  // member stays the chosen one.
  const emit = (next: TemplatedText | null): void => {
    const formValue = next ?? undefined;
    setMount((current) => ({ ...current, emitted: formValue }));
    onChange(formValue);
  };

  const renderInline =
    expression !== undefined && door !== undefined
      ? (inline: TemplatedTextInlineProps): ReactNode => (
          // The field's group header is the single visible label; the door keeps
          // its own label element as the control's accessible name.
          <div className={inline.hideLabel ? 'tai-templated-inline--grouped' : undefined}>
            <ExpressionField
              component={door}
              heading={inline.label}
              description={undefined}
              error={inline.error}
              expression={expression}
              argName={argName}
              value={inline.value}
              onChange={inline.onChange}
            />
          </div>
        )
      : undefined;

  return (
    <TemplatedTextField
      key={mount.generation}
      label={heading}
      description={description}
      error={error}
      value={templatedTextOf(value)}
      onChange={emit}
      required={required}
      templates={catalog?.templates}
      templatesLoading={catalog?.loading}
      templatesError={catalog?.error}
      onTemplatesRetry={catalog?.onRetry}
      storageAbsent={catalog?.storageAbsent}
      storagePresenceLoading={catalog?.storagePresenceLoading}
      renderInline={renderInline}
    />
  );
}
