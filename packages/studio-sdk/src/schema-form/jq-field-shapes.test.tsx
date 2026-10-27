/**
 * Every shape a jq-marked field arrives in from the server gets the expression door
 * and is labelled by the property's own words only: the inlined type merged into a
 * required property, the optional `anyOf[<type>, null]`, the `anyOf[<type>, string,
 * null]` union (with the type inlined or behind a `$ref`), and marked fields inside
 * array items and record values. The schemas are the server's own (see
 * `test-jq-field-schemas.ts`).
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ExpressionFieldProps } from './context';
import { ExpressionFieldContext } from './context';
import { SchemaForm } from './SchemaForm';
import {
  CHAIN_TOOL_FORM,
  CONTAINERS_TOOL_FORM,
  HOOK_CONDITION_TOOL_FORM,
  PRESET_MAPS_MODEL,
  PRESET_MAPS_TOOL_FORM,
  STATE_BINDING_TOOL_FORM,
} from './test-jq-field-schemas';
import type { JsonSchema } from './types';

const doors: ExpressionFieldProps[] = [];

function DoorDouble(props: ExpressionFieldProps) {
  doors.push(props);
  return (
    <textarea
      data-testid="jq-door"
      aria-label={props.label}
      value={props.value}
      onChange={(event) => {
        props.onChange(event.target.value);
      }}
    />
  );
}

/** The last door drawn for an argument path, e.g. `input_map` or `state_binding.states[0].subject_expr`. */
function doorFor(argName: string): ExpressionFieldProps {
  const last = doors.filter((props) => props.shape?.id === `tai42.schema-form.${argName}`).at(-1);
  if (last === undefined) throw new Error(`no door drawn for ${argName}`);
  return last;
}

beforeEach(() => {
  doors.length = 0;
});

function Harness({ schema, initial }: { schema: JsonSchema; initial: unknown }) {
  const [value, setValue] = useState<unknown>(initial);
  return (
    <ExpressionFieldContext.Provider value={DoorDouble}>
      <SchemaForm schema={schema} value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </ExpressionFieldContext.Provider>
  );
}

function formValue(): unknown {
  return JSON.parse(screen.getByTestId('value').textContent);
}

/** The type's own docstring, which the inlined tool form carries as `description`. */
const TYPE_DOCSTRING = /A renderable text|EXACTLY ONE source/;

describe('SchemaForm — a required templated property merged into the inlined type', () => {
  it('opens the door and never shows the type docstring as the field help', async () => {
    render(
      <Harness
        schema={CHAIN_TOOL_FORM}
        initial={{ query: 'q', jq_expression: { content: '.items' }, next_tool_name: 'echo' }}
      />,
    );

    await screen.findAllByTestId('jq-door');
    expect(doorFor('jq_expression').value).toBe('.items');
    expect(doorFor('jq_expression').shape?.label).toBe('expression');
    expect(screen.getByRole('group', { name: 'jq_expression' })).toBeInTheDocument();
    expect(screen.queryByText(TYPE_DOCSTRING)).not.toBeInTheDocument();
  });
});

describe('SchemaForm — an optional anyOf[<inlined type>, null] property', () => {
  it('opens the door and never shows the type docstring as the field help', async () => {
    render(<Harness schema={HOOK_CONDITION_TOOL_FORM} initial={{}} />);

    await screen.findAllByTestId('jq-door');
    expect(doorFor('condition').shape?.label).toBe('condition');
    expect(screen.queryByText(TYPE_DOCSTRING)).not.toBeInTheDocument();
  });
});

describe.each([
  ['inlined in the tool form', PRESET_MAPS_TOOL_FORM],
  ['behind a $ref in the request model', PRESET_MAPS_MODEL],
])('SchemaForm — an anyOf[TemplatedText, string, null] property, the type %s', (_, schema) => {
  it('opens the door on the string member', async () => {
    render(<Harness schema={schema} initial={{ input_map: '{query: .q}' }} />);

    await screen.findAllByTestId('jq-door');
    expect(doorFor('input_map').value).toBe('{query: .q}');
    expect(doorFor('input_map').shape?.label).toBe('input map');
    fireEvent.change(screen.getByRole('textbox', { name: doorFor('input_map').label }), {
      target: { value: '{query: .text}' },
    });
    expect(formValue()).toEqual({ input_map: '{query: .text}' });
  });

  it('opens the door on the templated member', async () => {
    render(<Harness schema={schema} initial={{ output_map: { content: '.items' } }} />);

    await screen.findAllByTestId('jq-door');
    expect(doorFor('output_map').value).toBe('.items');
    expect(doorFor('output_map').shape?.label).toBe('output map');
    fireEvent.change(screen.getByRole('textbox', { name: doorFor('output_map').label }), {
      target: { value: '.items[0]' },
    });
    expect(formValue()).toEqual({ output_map: { content: '.items[0]' } });
    expect(screen.queryByText(TYPE_DOCSTRING)).not.toBeInTheDocument();
  });

  it('keeps the templated member chosen and opens its door', async () => {
    const user = userEvent.setup();
    render(<Harness schema={schema} initial={{}} />);

    const [inputMapPicker] = screen.getAllByRole('combobox', { name: 'Variant' });
    if (inputMapPicker === undefined) throw new Error('no variant picker');
    await user.click(inputMapPicker);
    const [templatedOption] = await screen.findAllByRole('option');
    if (templatedOption === undefined) throw new Error('no variant option');
    await user.click(templatedOption);

    expect(formValue()).toEqual({ input_map: { content: '' } });
    const door = doorFor('input_map');
    fireEvent.change(screen.getByRole('textbox', { name: door.label }), {
      target: { value: '.q' },
    });
    expect(formValue()).toEqual({ input_map: { content: '.q' } });
    fireEvent.change(screen.getByRole('textbox', { name: door.label }), {
      target: { value: '' },
    });
    expect(formValue()).toEqual({ input_map: { content: '' } });
    expect(screen.getByRole('textbox', { name: door.label })).toBeInTheDocument();
  });
});

describe('SchemaForm — marked fields inside array items', () => {
  it('opens the door on a merged-required and an optional field of each item', async () => {
    render(
      <Harness
        schema={STATE_BINDING_TOOL_FORM}
        initial={{
          state_binding: {
            states: [
              {
                state: 'counters',
                subject_expr: { content: '{id: .id}' },
                updates: [{ jq: { content: '[{op: "inc"}]' } }],
              },
            ],
          },
        }}
      />,
    );

    await screen.findAllByTestId('jq-door');
    expect(doorFor('state_binding.states[0].subject_expr').value).toBe('{id: .id}');
    expect(doorFor('state_binding.states[0].updates[0].jq').value).toBe('[{op: "inc"}]');
    expect(doorFor('state_binding.states[0].updates[0].jq').shape?.label).toBe('custom update jq');
    expect(screen.queryByText(TYPE_DOCSTRING)).not.toBeInTheDocument();
  });
});

describe('SchemaForm — marked templated text as list items and record values', () => {
  it('opens the door on each list item and each record value', async () => {
    render(
      <Harness
        schema={CONTAINERS_TOOL_FORM}
        initial={{ listed: [{ content: '.a' }], named: { ready: { content: '.b' } } }}
      />,
    );

    await screen.findAllByTestId('jq-door');
    const values = doors.filter((props) => props.shape?.label === 'check').map((p) => p.value);
    expect(values).toContain('.a');
    expect(values).toContain('.b');
    const listed = screen.getByRole('group', { name: 'listed' });
    expect(within(listed).queryByText(TYPE_DOCSTRING)).not.toBeInTheDocument();
  });
});

describe('SchemaForm — a jq-marked string field behind a $ref', () => {
  const mark = { language: 'jq', label: 'selector' };
  const schema: JsonSchema = {
    $defs: { Jq: { type: 'string' } },
    type: 'object',
    properties: {
      required_expr: { $ref: '#/$defs/Jq', 'x-tai42-expression': mark },
      optional_expr: {
        anyOf: [{ $ref: '#/$defs/Jq' }, { type: 'null' }],
        'x-tai42-expression': mark,
      },
    },
    required: ['required_expr'],
  };

  it('opens the door on the required and the optional field', async () => {
    render(<Harness schema={schema} initial={{ required_expr: '.a', optional_expr: '.b' }} />);

    await screen.findAllByTestId('jq-door');
    expect(doorFor('required_expr').value).toBe('.a');
    expect(doorFor('required_expr').shape?.label).toBe('selector');
    expect(doorFor('optional_expr').value).toBe('.b');
    expect(doorFor('optional_expr').shape?.label).toBe('selector');
  });
});
