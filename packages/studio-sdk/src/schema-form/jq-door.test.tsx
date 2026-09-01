/**
 * SchemaForm's expression door: a string property carrying a well-formed
 * `x-tai42-expression` annotation renders the door the HOST injected (the SDK's
 * `JqField` in the shell) with the annotation mapped onto the input-shape
 * descriptor; an absent or malformed annotation — and an annotated field with no
 * injected door — renders the plain string input.
 *
 * The real `JqField` editor is WASM/worker-backed and not drivable in jsdom, so
 * these tests inject a props-capturing double instead. Injection is the production
 * path, so no module mock is needed (and none is possible: the form holds no edge
 * to `../jq`). The double is faithful on the one contract that matters here:
 * `onChange` reports the edited expression string, exactly as the real resting
 * control and editor Save do.
 *
 * Both wirings are exercised — the `expressionField` prop and the ambient
 * `ExpressionFieldContext` a host mounts above its tree — because the shell uses
 * the second and a form-level caller uses the first.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { act, lazy, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ExpressionFieldComponent, ExpressionFieldProps } from './context';
import { ExpressionFieldContext } from './context';
import { SchemaForm } from './SchemaForm';
import type { JsonSchema } from './types';

/** Every props object the door double rendered with, in render order. */
const captured: { door: ExpressionFieldProps[] } = { door: [] };

/** The injected door: captures its props and edits through `onChange`. */
function DoorDouble(props: ExpressionFieldProps) {
  captured.door.push(props);
  return (
    <div data-testid="jq-door">
      <textarea
        aria-label={props.label}
        value={props.value}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
    </div>
  );
}

/** The last props the door double rendered with (it re-renders per form edit). */
function lastDoorProps(): ExpressionFieldProps {
  const last = captured.door.at(-1);
  if (last === undefined) throw new Error('the jq door double never rendered');
  return last;
}

beforeEach(() => {
  captured.door.length = 0;
});

/** A controlled harness mirroring the emitted value, as the run panel owns it.
 *  `wiring` picks how the door reaches the form; `none` injects no door. */
function Harness({
  schema,
  initial,
  errors,
  wiring = 'prop',
}: {
  schema: JsonSchema;
  initial: unknown;
  errors?: Readonly<Record<string, string>>;
  wiring?: 'prop' | 'context' | 'none';
}) {
  const [value, setValue] = useState<unknown>(initial);
  const form = (
    <SchemaForm
      schema={schema}
      value={value}
      onChange={setValue}
      errors={errors}
      {...(wiring === 'prop' ? { expressionField: DoorDouble } : {})}
    />
  );
  return (
    <>
      {wiring === 'context' ? (
        <ExpressionFieldContext.Provider value={DoorDouble}>{form}</ExpressionFieldContext.Provider>
      ) : (
        form
      )}
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

const FULL_ANNOTATION = {
  language: 'jq',
  label: 'signal envelope',
  blurb: 'The signal document the route condition inspects.',
  keys: [
    { name: 'payload', gloss: 'the emitted body' },
    { name: 'meta', gloss: 'routing metadata' },
  ],
  returns: 'true or false',
  caveats: ['.meta is absent on replayed signals'],
  sample: { payload: {}, meta: { origin: 'relay' } },
} as const;

const annotatedSchema = (annotation: unknown): JsonSchema => ({
  type: 'object',
  properties: {
    condition: {
      type: 'string',
      title: 'Route condition',
      description: 'Runs against each signal.',
      'x-tai42-expression': annotation,
    },
  },
  required: ['condition'],
});

describe('SchemaForm — jq expression door', () => {
  it('renders the annotated field through the injected door, annotation mapped onto the shape', async () => {
    render(<Harness schema={annotatedSchema(FULL_ANNOTATION)} initial={{ condition: '.meta' }} />);

    expect(await screen.findByTestId('jq-door')).toBeInTheDocument();
    const props = lastDoorProps();
    expect(props.label).toBe('Route condition');
    expect(props.description).toBe('Runs against each signal.');
    expect(props.value).toBe('.meta');
    expect(props.multiline).toBe(true);
    expect(props.shape).toEqual({
      id: 'tai42.schema-form.condition',
      label: 'signal envelope',
      blurb: 'The signal document the route condition inspects.',
      keys: [
        { name: 'payload', gloss: 'the emitted body' },
        { name: 'meta', gloss: 'routing metadata' },
      ],
      returns: 'true or false',
      caveats: ['.meta is absent on replayed signals'],
      sample: { payload: {}, meta: { origin: 'relay' } },
    });
    // Exactly the contract props, nothing more: a jq door's `serverValidate`,
    // `onEditorOpenChange`, and `compact` stay unwired, because no author-time
    // validator applies to a schema-declared field, the hosts register no global
    // shortcuts to mute, and every sibling field shows a visible label.
    expect(Object.keys(props).sort()).toEqual([
      'description',
      'error',
      'label',
      'multiline',
      'onChange',
      'shape',
      'value',
    ]);
  });

  it('renders the door injected through the ambient context, as the shell wires it', async () => {
    render(
      <Harness
        schema={annotatedSchema(FULL_ANNOTATION)}
        initial={{ condition: '.meta' }}
        wiring="context"
      />,
    );

    expect(await screen.findByTestId('jq-door')).toBeInTheDocument();
    expect(lastDoorProps().value).toBe('.meta');
  });

  it('maps a bare { language: "jq" } annotation to NO shape descriptor', async () => {
    render(<Harness schema={annotatedSchema({ language: 'jq' })} initial={{}} />);
    expect(await screen.findByTestId('jq-door')).toBeInTheDocument();
    expect(lastDoorProps().shape).toBeUndefined();
  });

  it('flows an edit from the jq field into the emitted form value', async () => {
    render(<Harness schema={annotatedSchema(FULL_ANNOTATION)} initial={{}} />);
    // Await the door itself, not merely a matching textbox: the loading fallback
    // also exposes a (read-only) `Route condition` textbox, so acting before the
    // door mounts could target the placeholder instead of the live control.
    await screen.findByTestId('jq-door');
    fireEvent.change(screen.getByRole('textbox', { name: 'Route condition' }), {
      target: { value: '.payload | length > 0' },
    });
    expect(screen.getByTestId('value').textContent).toBe('{"condition":".payload | length > 0"}');
  });

  it('drops the key when an OPTIONAL jq field is cleared, like every string field', async () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        shaper: { type: 'string', title: 'Shaper', 'x-tai42-expression': { language: 'jq' } },
      },
    };
    render(<Harness schema={schema} initial={{ shaper: '.meta' }} />);
    await screen.findByTestId('jq-door');
    fireEvent.change(screen.getByRole('textbox', { name: 'Shaper' }), {
      target: { value: '' },
    });
    expect(screen.getByTestId('value').textContent).toBe('{}');
  });

  it('paints the resting shell while a LAZILY injected door resolves, then swaps to it', async () => {
    // A host is free to code-split the door in its own bundle; the form's Suspense
    // boundary is what keeps the field's footprint and value visible meanwhile.
    let arrive: (module: { default: ExpressionFieldComponent }) => void = () => undefined;
    const LazyDoor = lazy(
      () =>
        new Promise<{ default: ExpressionFieldComponent }>((resolve) => {
          arrive = resolve;
        }),
    );
    render(
      <SchemaForm
        schema={annotatedSchema(FULL_ANNOTATION)}
        value={{ condition: '.meta' }}
        onChange={() => undefined}
        expressionField={LazyDoor}
      />,
    );

    const resting = screen.getByRole('textbox', { name: 'Route condition' });
    expect(resting.tagName).toBe('TEXTAREA');
    expect(resting).toHaveAttribute('aria-busy', 'true');
    expect(resting).toHaveValue('.meta');
    expect(screen.queryByTestId('jq-door')).not.toBeInTheDocument();

    await act(async () => {
      arrive({ default: DoorDouble });
    });
    expect(await screen.findByTestId('jq-door')).toBeInTheDocument();
    expect(lastDoorProps().value).toBe('.meta');
  });

  it("wires the form's per-field error into the injected door's error prop", async () => {
    render(
      <Harness
        schema={annotatedSchema(FULL_ANNOTATION)}
        initial={{ condition: '' }}
        errors={{ condition: 'This field is required.' }}
      />,
    );
    await screen.findByTestId('jq-door');
    expect(lastDoorProps().error).toBe('This field is required.');
  });

  it('renders a MALFORMED annotation as the plain string input — no door', () => {
    render(<Harness schema={annotatedSchema({ language: 'lorem' })} initial={{}} />);
    expect(screen.queryByTestId('jq-door')).not.toBeInTheDocument();
    expect(captured.door).toHaveLength(0);
    // The plain text input, exactly as an unannotated field renders.
    expect(screen.getByRole('textbox', { name: 'Route condition' }).tagName).toBe('INPUT');
  });

  it('renders an unannotated form with no door and BYTE-IDENTICAL to a malformed-annotation form', () => {
    // Server rendering makes `useId` position-deterministic, so two identical
    // trees produce identical bytes — the strongest available proof that a
    // malformed annotation changes NOTHING about the rendered form.
    const unannotated: JsonSchema = {
      type: 'object',
      properties: {
        condition: {
          type: 'string',
          title: 'Route condition',
          description: 'Runs against each signal.',
        },
      },
      required: ['condition'],
    };
    const noop = (): void => undefined;
    const plain = renderToStaticMarkup(
      <SchemaForm schema={unannotated} value={{ condition: '.meta' }} onChange={noop} />,
    );
    const malformed = renderToStaticMarkup(
      <SchemaForm
        schema={annotatedSchema({ language: 'jq', label: 7 })}
        value={{ condition: '.meta' }}
        onChange={noop}
      />,
    );
    expect(malformed).toBe(plain);
    expect(plain).not.toContain('jq-door');
  });
});
