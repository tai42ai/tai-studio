/**
 * SchemaForm's jq expression door: a string property carrying a well-formed
 * `x-tai42-expression` annotation renders the SDK's `JqField` (resting control +
 * visual-editor door) with the annotation mapped onto the field declaration; an
 * absent or malformed annotation renders the plain string input BYTE-IDENTICALLY
 * to today's form.
 *
 * The real `JqField` editor is WASM/worker-backed and not drivable in jsdom, so
 * these tests replace it with a props-capturing double (spread-actual, so every
 * other `../jq` export is preserved). The double is faithful on the one contract
 * that matters here: `onChange` reports the edited expression string, exactly as
 * the real resting control and editor Save do.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { JqFieldProps } from '../jq';
import { SchemaForm } from './SchemaForm';
import type { JsonSchema } from './types';

/** Every props object the door double rendered with, in render order. The type
 *  annotation is erased at compile time, so referencing it from hoisted code is
 *  safe. */
const captured = vi.hoisted(() => ({ door: [] as JqFieldProps[] }));

// Replace ONLY JqField; every other export of the SDK's jq module is preserved.
vi.mock('../jq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../jq')>();
  const DoorDouble = (props: JqFieldProps) => {
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
  };
  return { ...actual, JqField: DoorDouble };
});

/** The last props the door double rendered with (it re-renders per form edit). */
function lastDoorProps(): JqFieldProps {
  const last = captured.door.at(-1);
  if (last === undefined) throw new Error('the jq door double never rendered');
  return last;
}

beforeEach(() => {
  captured.door.length = 0;
});

/** A controlled harness mirroring the emitted value, as the run panel owns it. */
function Harness({
  schema,
  initial,
  errors,
}: {
  schema: JsonSchema;
  initial: unknown;
  errors?: Readonly<Record<string, string>>;
}) {
  const [value, setValue] = useState<unknown>(initial);
  return (
    <>
      <SchemaForm schema={schema} value={value} onChange={setValue} errors={errors} />
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
  it('renders the annotated field as a JqField with the annotation mapped onto the declaration', () => {
    render(<Harness schema={annotatedSchema(FULL_ANNOTATION)} initial={{ condition: '.meta' }} />);

    expect(screen.getByTestId('jq-door')).toBeInTheDocument();
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
    // Deliberately unwired: no author-time validator applies to a schema field,
    // the hosts register no global shortcuts to mute, and the form's sibling
    // fields all show visible labels (no compact variant).
    expect(props.serverValidate).toBeUndefined();
    expect(props.onEditorOpenChange).toBeUndefined();
    expect(props.compact).toBeUndefined();
  });

  it('maps a bare { language: "jq" } annotation to NO shape descriptor', () => {
    render(<Harness schema={annotatedSchema({ language: 'jq' })} initial={{}} />);
    expect(screen.getByTestId('jq-door')).toBeInTheDocument();
    expect(lastDoorProps().shape).toBeUndefined();
  });

  it('flows an edit from the jq field into the emitted form value', () => {
    render(<Harness schema={annotatedSchema(FULL_ANNOTATION)} initial={{}} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Route condition' }), {
      target: { value: '.payload | length > 0' },
    });
    expect(screen.getByTestId('value').textContent).toBe('{"condition":".payload | length > 0"}');
  });

  it('drops the key when an OPTIONAL jq field is cleared, like every string field', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        shaper: { type: 'string', title: 'Shaper', 'x-tai42-expression': { language: 'jq' } },
      },
    };
    render(<Harness schema={schema} initial={{ shaper: '.meta' }} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Shaper' }), {
      target: { value: '' },
    });
    expect(screen.getByTestId('value').textContent).toBe('{}');
  });

  it("wires the form's per-field error into the JqField error prop", () => {
    render(
      <Harness
        schema={annotatedSchema(FULL_ANNOTATION)}
        initial={{ condition: '' }}
        errors={{ condition: 'This field is required.' }}
      />,
    );
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
