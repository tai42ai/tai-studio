/**
 * SchemaForm's templated-text fields: a property typed as the platform's
 * `TemplatedText` (its schema carries `x-tai42-templated-text`) is authored through
 * the shared `TemplatedTextField` — inline content or a stored template id, plus the
 * render kwargs — and, when the property also carries `x-tai42-expression`, the
 * inline editor is the host's injected expression door, exactly as on a jq string.
 *
 * The schemas below are the shapes the server emits for a jq-typed `TemplatedText`
 * property: a required `$ref` with the expression annotation beside it, and an
 * optional `anyOf[$ref, null]` with the annotation on the wrapper.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { TemplatedTextCatalog } from '../state-binding/types';
import type { ExpressionFieldProps } from './context';
import { ExpressionFieldContext, TemplatedTextCatalogContext } from './context';
import { SchemaForm } from './SchemaForm';
import type { JsonSchema } from './types';
import { validateAgainstSchema } from './validate';

const TEMPLATED_TEXT_DEF: JsonSchema = {
  additionalProperties: false,
  description: 'A renderable text: its source plus the parameters its render takes.',
  properties: {
    content: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null, title: 'Content' },
    id: { anyOf: [{ type: 'string' }, { type: 'null' }], default: null, title: 'Id' },
    kwargs: { additionalProperties: true, title: 'Kwargs', type: 'object' },
  },
  title: 'TemplatedText',
  type: 'object',
  'x-tai42-templated-text': { language: 'jinja' },
};

const CHAIN_SCHEMA: JsonSchema = {
  $defs: { TemplatedText: TEMPLATED_TEXT_DEF },
  type: 'object',
  title: 'ChainArgs',
  properties: {
    condition: {
      anyOf: [{ $ref: '#/$defs/TemplatedText' }, { type: 'null' }],
      default: null,
      'x-tai42-expression': {
        blurb: "the declaring surface's input document",
        label: 'condition',
        language: 'jq',
        returns: "truthy to proceed; a falsy result gates the surface's action off",
      },
    },
    jq_expression: {
      $ref: '#/$defs/TemplatedText',
      'x-tai42-expression': {
        blurb: "the first tool's raw output",
        label: 'expression',
        language: 'jq',
        returns: "the second tool's kwargs object",
      },
    },
    next_tool_name: { title: 'Next Tool Name', type: 'string' },
  },
  required: ['jq_expression', 'next_tool_name'],
};

const PROMPT_SCHEMA: JsonSchema = {
  $defs: { TemplatedText: TEMPLATED_TEXT_DEF },
  type: 'object',
  properties: { prompt: { $ref: '#/$defs/TemplatedText', title: 'Prompt' } },
};

const captured: { door: ExpressionFieldProps[] } = { door: [] };

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

function doorProps(label: string): ExpressionFieldProps {
  const last = captured.door.filter((props) => props.label === label).at(-1);
  if (last === undefined) throw new Error(`no door rendered for ${label}`);
  return last;
}

beforeEach(() => {
  captured.door.length = 0;
});

const CATALOG: TemplatedTextCatalog = { templates: [{ id: 'prompts/greeting' }] };
const useTestCatalog = (): TemplatedTextCatalog => CATALOG;

function Harness({
  schema,
  initial,
  catalog = false,
}: {
  schema: JsonSchema;
  initial: unknown;
  catalog?: boolean;
}) {
  const [value, setValue] = useState<unknown>(initial);
  const form = <SchemaForm schema={schema} value={value} onChange={setValue} />;
  return (
    <ExpressionFieldContext.Provider value={DoorDouble}>
      {catalog ? (
        <TemplatedTextCatalogContext.Provider value={useTestCatalog}>
          {form}
        </TemplatedTextCatalogContext.Provider>
      ) : (
        form
      )}
      <output data-testid="value">{JSON.stringify(value)}</output>
    </ExpressionFieldContext.Provider>
  );
}

describe('SchemaForm — templated-text fields', () => {
  it('opens the expression door for a required jq-typed TemplatedText property', async () => {
    render(<Harness schema={CHAIN_SCHEMA} initial={{ jq_expression: { content: '.items' } }} />);

    await screen.findAllByTestId('jq-door');
    const props = doorProps('jq_expression');
    expect(props.value).toBe('.items');
    expect(props.shape).toEqual({
      id: 'tai42.schema-form.jq_expression',
      label: 'expression',
      blurb: "the first tool's raw output",
      keys: [],
      returns: "the second tool's kwargs object",
    });
  });

  it('opens the expression door for an optional anyOf[TemplatedText, null] property', async () => {
    render(<Harness schema={CHAIN_SCHEMA} initial={{}} />);

    await screen.findAllByTestId('jq-door');
    expect(doorProps('condition').shape?.label).toBe('condition');
  });

  it('labels the field by its property, never by the TemplatedText type', async () => {
    render(<Harness schema={CHAIN_SCHEMA} initial={{}} />);

    await screen.findAllByTestId('jq-door');
    expect(screen.queryByText('TemplatedText')).not.toBeInTheDocument();
    expect(screen.queryByText(/A renderable text/)).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'jq_expression' })).toBeInTheDocument();
  });

  it('emits an edit in the door as the inline TemplatedText value', async () => {
    render(<Harness schema={CHAIN_SCHEMA} initial={{ next_tool_name: 'echo' }} />);

    await screen.findAllByTestId('jq-door');
    fireEvent.change(screen.getByRole('textbox', { name: 'jq_expression' }), {
      target: { value: '{text: .title}' },
    });
    expect(JSON.parse(screen.getByTestId('value').textContent)).toEqual({
      next_tool_name: 'echo',
      jq_expression: { content: '{text: .title}' },
    });
  });

  it('drops an optional field whose source is cleared', async () => {
    render(<Harness schema={CHAIN_SCHEMA} initial={{ condition: { content: '.ok' } }} />);

    await screen.findAllByTestId('jq-door');
    fireEvent.change(screen.getByRole('textbox', { name: 'condition' }), {
      target: { value: '' },
    });
    expect(screen.getByTestId('value').textContent).toBe('{}');
  });

  it('opens a stored id in the stored mode, offering the host catalog', async () => {
    render(
      <Harness
        schema={CHAIN_SCHEMA}
        initial={{ jq_expression: { id: 'prompts/greeting', kwargs: { tone: 'plain' } } }}
        catalog
      />,
    );

    const group = await screen.findByRole('group', { name: 'jq_expression' });
    expect(within(group).getByRole('radio', { name: 'Stored template' })).toBeChecked();
    expect(within(group).getByText('prompts/greeting')).toBeInTheDocument();
  });

  it('authors a TemplatedText property with no expression mark as plain inline text', () => {
    render(<Harness schema={PROMPT_SCHEMA} initial={{}} />);

    expect(screen.queryByTestId('jq-door')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Prompt' }), {
      target: { value: 'Hello {{ name }}' },
    });
    expect(JSON.parse(screen.getByTestId('value').textContent)).toEqual({
      prompt: { content: 'Hello {{ name }}' },
    });
  });

  it('follows a value the caller replaces after mount', async () => {
    function Replacing() {
      const [value, setValue] = useState<unknown>({ jq_expression: { content: '.a' } });
      return (
        <ExpressionFieldContext.Provider value={DoorDouble}>
          <SchemaForm schema={CHAIN_SCHEMA} value={value} onChange={setValue} />
          <button
            type="button"
            onClick={() => {
              setValue({ jq_expression: { content: '.b' } });
            }}
          >
            replace
          </button>
        </ExpressionFieldContext.Provider>
      );
    }
    render(<Replacing />);

    await screen.findAllByTestId('jq-door');
    fireEvent.click(screen.getByRole('button', { name: 'replace' }));
    expect(doorProps('jq_expression').value).toBe('.b');
  });
});

describe('validateAgainstSchema — templated-text fields', () => {
  it('accepts an inline or a stored source', () => {
    expect(
      validateAgainstSchema(CHAIN_SCHEMA, {
        jq_expression: { content: '.a' },
        condition: { id: 'checks/ready', kwargs: { limit: 3 } },
        next_tool_name: 'echo',
      }),
    ).toEqual({});
  });

  it('flags a missing required templated field', () => {
    expect(validateAgainstSchema(CHAIN_SCHEMA, { next_tool_name: 'echo' })).toEqual({
      jq_expression: '"jq_expression" is required',
    });
  });

  it('refuses a value that sets both sources, or neither', () => {
    expect(
      validateAgainstSchema(CHAIN_SCHEMA, {
        jq_expression: { content: '.a', id: 'b' },
        condition: {},
        next_tool_name: 'echo',
      }),
    ).toEqual({
      jq_expression: 'must set exactly one of inline content or a stored template id',
      condition: 'must set exactly one of inline content or a stored template id',
    });
  });

  it('refuses an empty source', () => {
    expect(
      validateAgainstSchema(CHAIN_SCHEMA, {
        jq_expression: { content: '' },
        next_tool_name: 'echo',
      }),
    ).toEqual({ jq_expression: 'needs inline content or a stored template' });
  });

  it('refuses a non-object value and non-object kwargs', () => {
    expect(
      validateAgainstSchema(CHAIN_SCHEMA, {
        jq_expression: '.a',
        condition: { content: '.b', kwargs: [] },
        next_tool_name: 'echo',
      }),
    ).toEqual({
      jq_expression: 'must be an object',
      condition: 'kwargs must be an object',
    });
  });
});
