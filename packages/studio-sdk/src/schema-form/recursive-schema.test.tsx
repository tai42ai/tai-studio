import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';

import { defaultValueForSchema, skeletonValueForSchema } from './default-value';
import { SchemaForm } from './SchemaForm';
import type { JsonSchema } from './types';
import { validateAgainstSchema } from './validate';

const mark = { language: 'jq', label: 'site' };

/** A definition that holds itself under an optional `child`, behind a required root `r`. */
function selfReferencing(options: { siteMark?: boolean; childMark?: boolean } = {}): JsonSchema {
  const childRef: JsonSchema =
    options.childMark === true
      ? { $ref: '#/$defs/Rec', 'x-tai42-expression': mark }
      : { $ref: '#/$defs/Rec' };
  const rootRef: JsonSchema =
    options.siteMark === true
      ? { $ref: '#/$defs/Rec', 'x-tai42-expression': mark }
      : { $ref: '#/$defs/Rec' };
  return {
    $defs: {
      Rec: { type: 'object', properties: { child: childRef, s: { type: 'string' } } },
    },
    type: 'object',
    properties: { r: rootRef },
    required: ['r'],
  };
}

function Harness({ schema, initial }: { schema: JsonSchema; initial: unknown }) {
  const [value, setValue] = useState<unknown>(initial);
  return (
    <>
      <SchemaForm schema={schema} value={value} onChange={setValue} />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

function emitted(): unknown {
  return JSON.parse(screen.getByTestId('value').textContent) as unknown;
}

describe('SchemaForm — a self-referencing definition', () => {
  it('draws the levels the value holds and an absent nested level as an Add button', () => {
    render(<Harness schema={selfReferencing()} initial={{ r: { s: 'z' } }} />);
    const outer = screen.getByRole('group', { name: 'r' });
    expect(within(outer).getByRole('textbox')).toHaveValue('z');
    const child = within(outer).getByRole('group', { name: 'child' });
    expect(within(child).queryByRole('textbox')).toBeNull();
    expect(within(child).getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('draws every level a deeper value holds and edits the innermost one', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        schema={selfReferencing()}
        initial={{ r: { s: 'a', child: { s: 'b', child: { s: 'c' } } } }}
      />,
    );
    // `child` is declared before `s`, so each nested level draws above its parent's text box.
    const boxes = screen.getAllByRole('textbox');
    expect(boxes.map((box) => (box as HTMLInputElement).value)).toEqual(['c', 'b', 'a']);
    // Only the level below the deepest present one is collapsed.
    expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(1);
    const innermost = boxes[0];
    if (innermost === undefined) throw new Error('missing innermost text box');
    await user.type(innermost, 'd');
    expect(emitted()).toEqual({ r: { s: 'a', child: { s: 'b', child: { s: 'cd' } } } });
  });

  it('adds a nested level on Add and lets the user fill it', async () => {
    const user = userEvent.setup();
    render(<Harness schema={selfReferencing()} initial={{ r: { s: 'z' } }} />);
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(emitted()).toEqual({ r: { s: 'z', child: {} } });
    const boxes = screen.getAllByRole('textbox');
    expect(boxes).toHaveLength(2);
    const added = boxes[0];
    if (added === undefined) throw new Error('missing added text box');
    await user.type(added, 'y');
    expect(emitted()).toEqual({ r: { s: 'z', child: { s: 'y' } } });
    // The new level has its own collapsed child below it.
    expect(screen.getAllByRole('button', { name: 'Add' })).toHaveLength(1);
  });

  it('collapses the nested level when expression marks sit on the reference sites', () => {
    render(
      <Harness
        schema={selfReferencing({ siteMark: true, childMark: true })}
        initial={{ r: { s: 'z' } }}
      />,
    );
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('collapses a whole-document self reference', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { next: { $ref: '#' }, s: { type: 'string' } },
    };
    render(<Harness schema={schema} initial={{ s: 'top' }} />);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    const next = screen.getByRole('group', { name: 'next' });
    expect(within(next).getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('collapses a nullable self reference whose value is null', () => {
    const schema: JsonSchema = {
      $defs: {
        Rec: {
          type: 'object',
          properties: {
            child: { anyOf: [{ $ref: '#/$defs/Rec' }, { type: 'null' }] },
            s: { type: 'string' },
          },
          required: ['child'],
        },
      },
      type: 'object',
      properties: { r: { $ref: '#/$defs/Rec' } },
      required: ['r'],
    };
    render(<Harness schema={schema} initial={{ r: { s: 'z', child: null } }} />);
    expect(screen.getAllByRole('textbox')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});

describe('SchemaForm — adding a level that admits no finite value', () => {
  // `R` requires itself with no null anywhere on the way, so no finite `R` exists.
  const defs: Record<string, JsonSchema> = {
    R: { type: 'object', properties: { c: { $ref: '#/$defs/R' } }, required: ['c'] },
  };

  let logged: MockInstance<typeof console.error>;
  beforeEach(() => {
    logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    // Every failure shown on the field is also logged.
    expect(logged).toHaveBeenCalledWith(
      'SchemaForm: seeding a new value failed',
      expect.any(Error),
    );
    logged.mockRestore();
  });

  it('shows the seeding failure on the collapsed level and leaves the value alone', async () => {
    const user = userEvent.setup();
    const schema: JsonSchema = {
      $defs: defs,
      type: 'object',
      properties: { o: { $ref: '#/$defs/R' } },
    };
    render(<Harness schema={schema} initial={{ o: {} }} />);
    const level = screen.getByRole('group', { name: 'c' });
    await user.click(within(level).getByRole('button', { name: 'Add' }));
    // The group's error sits beside its controls and names the group's description.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/admits no finite value/);
    expect(level).toHaveAttribute('aria-describedby', alert.id);
    expect(emitted()).toEqual({ o: {} });
  });

  it('shows the seeding failure on a list whose item admits no finite value', async () => {
    const user = userEvent.setup();
    const schema: JsonSchema = {
      $defs: defs,
      type: 'object',
      properties: { list: { type: 'array', items: { $ref: '#/$defs/R' } } },
    };
    render(<Harness schema={schema} initial={{ list: [] }} />);
    const list = screen.getByRole('group', { name: 'list' });
    await user.click(within(list).getByRole('button', { name: 'Add item' }));
    // The group's error sits beside its controls and names the group's description.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/admits no finite value/);
    expect(list).toHaveAttribute('aria-describedby', alert.id);
    expect(emitted()).toEqual({ list: [] });
  });

  it('shows the seeding failure on a map whose entry admits no finite value', async () => {
    const user = userEvent.setup();
    const schema: JsonSchema = {
      $defs: defs,
      type: 'object',
      properties: { map: { type: 'object', additionalProperties: { $ref: '#/$defs/R' } } },
    };
    render(<Harness schema={schema} initial={{ map: {} }} />);
    const map = screen.getByRole('group', { name: 'map' });
    await user.click(within(map).getByRole('button', { name: 'Add entry' }));
    // The group's error sits beside its controls and names the group's description.
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/admits no finite value/);
    expect(map).toHaveAttribute('aria-describedby', alert.id);
    expect(emitted()).toEqual({ map: {} });
  });

  it('shows the seeding failure when switching to a variant that admits no finite value', async () => {
    const user = userEvent.setup();
    const schema: JsonSchema = {
      $defs: defs,
      anyOf: [
        { $ref: '#/$defs/R' },
        { type: 'object', title: 'Plain', properties: { s: { type: 'string' } } },
      ],
    };
    render(<Harness schema={schema} initial={undefined} />);
    await user.click(screen.getByRole('combobox', { name: 'Variant' }));
    await user.click(await screen.findByRole('option', { name: 'Option 1' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/admits no finite value/);
    expect(screen.getByTestId('value')).toHaveTextContent('');
  });
});

describe('SchemaForm — what a seeding button reports', () => {
  const defs: Record<string, JsonSchema> = {
    R: { type: 'object', properties: { c: { $ref: '#/$defs/R' } }, required: ['c'] },
  };

  it('lets an error thrown by the host onChange propagate untouched', () => {
    const hostBug = new TypeError('host save failed');
    const schema: JsonSchema = {
      type: 'object',
      properties: { list: { type: 'array', items: { type: 'string' } } },
    };
    const uncaught: unknown[] = [];
    const onError = (event: ErrorEvent): void => {
      event.preventDefault();
      uncaught.push(event.error);
    };
    window.addEventListener('error', onError);
    try {
      render(
        <SchemaForm
          schema={schema}
          value={{ list: [] }}
          onChange={() => {
            throw hostBug;
          }}
        />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    } finally {
      window.removeEventListener('error', onError);
    }
    expect(uncaught).toEqual([hostBug]);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lets a seeding error other than no finite value propagate from Add item', () => {
    // The item's required `x` points at a definition the document lacks: seeding an
    // item resolves it and throws, while the empty list never draws an item.
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        list: {
          type: 'array',
          items: {
            type: 'object',
            properties: { x: { $ref: '#/$defs/Missing' } },
            required: ['x'],
          },
        },
      },
    };
    const onChange = vi.fn();
    const uncaught: unknown[] = [];
    const onError = (event: ErrorEvent): void => {
      event.preventDefault();
      uncaught.push(event.error);
    };
    window.addEventListener('error', onError);
    try {
      render(<SchemaForm schema={schema} value={{ list: [] }} onChange={onChange} />);
      fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    } finally {
      window.removeEventListener('error', onError);
    }
    expect(uncaught).toEqual([new Error('SchemaForm: unresolvable $ref "#/$defs/Missing"')]);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('drops a failure once the list draws a different item schema', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const user = userEvent.setup();
      const schema: JsonSchema = {
        $defs: defs,
        oneOf: [
          {
            type: 'object',
            title: 'A',
            properties: {
              t: { const: 'a' },
              items: { type: 'array', items: { $ref: '#/$defs/R' } },
            },
            required: ['t', 'items'],
          },
          {
            type: 'object',
            title: 'B',
            properties: { t: { const: 'b' }, items: { type: 'array', items: { type: 'string' } } },
            required: ['t', 'items'],
          },
        ],
        discriminator: { propertyName: 't' },
      };
      render(<Harness schema={schema} initial={{ t: 'a', items: [] }} />);
      await user.click(screen.getByRole('button', { name: 'Add item' }));
      expect(screen.getByRole('alert')).toHaveTextContent(/admits no finite value/);
      await user.click(screen.getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: 'b' }));
      expect(emitted()).toEqual({ t: 'b', items: [] });
      expect(screen.queryByRole('alert')).toBeNull();
    } finally {
      logged.mockRestore();
    }
  });
});

describe('seeding a self-referencing definition', () => {
  it('leaves an optional self reference absent', () => {
    expect(defaultValueForSchema(selfReferencing())).toEqual({ r: {} });
  });

  it('ends a required nullable self reference at null', () => {
    const schema: JsonSchema = {
      $defs: {
        Rec: {
          type: 'object',
          properties: { child: { anyOf: [{ $ref: '#/$defs/Rec' }, { type: 'null' }] } },
          required: ['child'],
        },
      },
      type: 'object',
      properties: { r: { $ref: '#/$defs/Rec' } },
      required: ['r'],
    };
    expect(defaultValueForSchema(schema)).toEqual({ r: { child: null } });
    expect(skeletonValueForSchema(schema)).toEqual({ r: { child: null } });
  });

  it('ends a cycle through two definitions at the nullable property, from either one', () => {
    const defs: Record<string, JsonSchema> = {
      A: {
        type: 'object',
        properties: { b: { anyOf: [{ $ref: '#/$defs/B' }, { type: 'null' }] } },
        required: ['b'],
      },
      B: { type: 'object', properties: { a: { $ref: '#/$defs/A' } }, required: ['a'] },
    };
    const fromA: JsonSchema = { $defs: defs, $ref: '#/$defs/A' };
    const fromB: JsonSchema = { $defs: defs, $ref: '#/$defs/B' };
    expect(defaultValueForSchema(fromA)).toEqual({ b: null });
    expect(skeletonValueForSchema(fromA)).toEqual({ b: null });
    expect(defaultValueForSchema(fromB)).toEqual({ a: { b: null } });
    expect(skeletonValueForSchema(fromB)).toEqual({ a: { b: null } });
  });

  it('ends a cycle at a nullable property above the one that closes it', () => {
    const schema: JsonSchema = {
      $defs: {
        Rec: {
          type: 'object',
          properties: {
            w: {
              anyOf: [
                {
                  type: 'object',
                  properties: { inner: { $ref: '#/$defs/Rec' } },
                  required: ['inner'],
                },
                { type: 'null' },
              ],
            },
          },
          required: ['w'],
        },
      },
      $ref: '#/$defs/Rec',
    };
    expect(defaultValueForSchema(schema)).toEqual({ w: null });
    expect(skeletonValueForSchema(schema)).toEqual({ w: null });
  });

  it('throws for a required self reference that admits no finite value', () => {
    const schema: JsonSchema = {
      $defs: {
        Rec: {
          type: 'object',
          properties: { child: { $ref: '#/$defs/Rec' } },
          required: ['child'],
        },
      },
      $ref: '#/$defs/Rec',
    };
    expect(() => defaultValueForSchema(schema)).toThrow(/admits no finite value/);
    expect(() => skeletonValueForSchema(schema)).toThrow(/admits no finite value/);
  });
});

describe('validating a self-referencing definition', () => {
  it('walks every level the value holds and reports the nested path', () => {
    const errors = validateAgainstSchema(selfReferencing(), {
      r: { s: 'a', child: { child: { s: 5 } } },
    });
    expect(errors).toEqual({ 'r.child.child.s': expect.any(String) as unknown });
  });
});
