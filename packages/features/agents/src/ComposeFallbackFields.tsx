/**
 * The "Fix additional inputs" opt-in bake checklist: the base agent's renderable
 * non-spec fields, each a checkbox that, when checked, surfaces a required subset-form
 * input. A checked field is baked into `fixed_kwargs`; an unchecked one stays a
 * run-time input. Owns the checklist state and exposes the checked values plus a
 * validate handle to the dialog's submit through a ref.
 */
import type { AgentSummary } from '@tai42/api-client';
import {
  Checkbox,
  defaultValueForSchema,
  type JsonSchema,
  SchemaForm,
  type SchemaFormErrors,
  validateAgainstSchema,
} from '@tai42/studio-sdk';
import {
  forwardRef,
  type ReactNode,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';

import { fallbackFieldNames, schemaProps, subsetSchema } from './authoring-schema';

/** The checked bake fields plus a validate handle, read by the dialog's submit. */
export interface ComposeFallbackHandle {
  readonly checkedFallbacks: ReadonlySet<string>;
  readonly fallbackValue: unknown;
  /** Validate the checked fields; sets inline errors and returns whether all pass. */
  readonly validate: () => boolean;
}

export const ComposeFallbackFields = forwardRef<
  ComposeFallbackHandle,
  { readonly baseAgent: AgentSummary | null; readonly baseSchema: JsonSchema }
>(function ComposeFallbackFields({ baseAgent, baseSchema }, ref): ReactNode {
  const [checkedFallbacks, setCheckedFallbacks] = useState<ReadonlySet<string>>(() => new Set());
  const [fallbackValue, setFallbackValue] = useState<unknown>({});
  const [fallbackErrors, setFallbackErrors] = useState<SchemaFormErrors | undefined>(undefined);

  const fallbackNames = useMemo(
    () => (baseAgent ? fallbackFieldNames(baseSchema) : []),
    [baseAgent, baseSchema],
  );
  const fallbackSchema = useMemo(
    () => (baseAgent ? subsetSchema(baseSchema, checkedFallbacks) : null),
    [baseAgent, baseSchema, checkedFallbacks],
  );

  // A new base agent has a different field set — clear the opt-in bake checklist.
  useEffect(() => {
    setCheckedFallbacks(new Set());
    setFallbackValue({});
    setFallbackErrors(undefined);
  }, [baseAgent]);

  // Toggling a checklist field seeds (on check) or drops (on uncheck) its value, so
  // the SchemaForm below edits exactly the checked fields and an unchecked field
  // never carries a value into `fixed_kwargs`.
  const toggleFallback = (field: string, checked: boolean): void => {
    setCheckedFallbacks((prev) => {
      const next = new Set(prev);
      if (checked) next.add(field);
      else next.delete(field);
      return next;
    });
    setFallbackValue((prev: unknown) => {
      const obj: Record<string, unknown> =
        prev !== null && typeof prev === 'object' ? { ...(prev as Record<string, unknown>) } : {};
      const node = schemaProps(baseSchema)[field];
      if (checked && node) {
        // Resolve against the base schema so a `$ref`-typed field seeds correctly.
        const seed = defaultValueForSchema(
          { type: 'object', properties: { [field]: node } },
          baseSchema,
        ) as Record<string, unknown>;
        obj[field] = seed[field];
        return obj;
      }
      return Object.fromEntries(Object.entries(obj).filter(([key]) => key !== field));
    });
  };

  useImperativeHandle(
    ref,
    () => ({
      checkedFallbacks,
      fallbackValue,
      validate: () => {
        // Every checked bake field must carry a valid value: the subset schema marks
        // them all required, so an unset one blocks submit (loud, in-form errors).
        if (!fallbackSchema) return true;
        const found = validateAgainstSchema(fallbackSchema, fallbackValue);
        setFallbackErrors(found);
        return Object.keys(found).length === 0;
      },
    }),
    [checkedFallbacks, fallbackValue, fallbackSchema],
  );

  if (fallbackNames.length === 0) return null;

  return (
    // Each Checkbox owns its own id, so this group is NOT a single `Field` (that would
    // share one id across every box); it is a labelled group.
    <div
      className="tai-stack-2"
      role="group"
      aria-labelledby="compose-fallback-heading"
      aria-describedby="compose-fallback-desc"
    >
      <span id="compose-fallback-heading" className="tai-label">
        Fix additional inputs
      </span>
      <span id="compose-fallback-desc" className="tai-muted">
        Checked fields are baked into the agent and cannot be set at run time.
      </span>
      <div className="tai-stack-2" data-testid="compose-fallback-fields">
        {fallbackNames.map((field) => {
          const description = schemaProps(baseSchema)[field]?.description;
          return (
            <Checkbox
              key={field}
              checked={checkedFallbacks.has(field)}
              onCheckedChange={(next) => {
                toggleFallback(field, next);
              }}
              label={description ? `${field} — ${description}` : field}
            />
          );
        })}
        {/* The subset form over the checked fields — each required. */}
        {fallbackSchema !== null ? (
          <SchemaForm
            schema={fallbackSchema}
            value={fallbackValue}
            onChange={setFallbackValue}
            errors={fallbackErrors}
          />
        ) : null}
      </div>
    </div>
  );
});
