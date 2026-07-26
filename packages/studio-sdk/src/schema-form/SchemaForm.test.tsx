import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultValueForSchema } from './default-value';
import { SchemaForm, type CompletionProvider } from './SchemaForm';
import type { JsonSchema } from './types';
import { validateAgainstSchema } from './validate';

/**
 * A controlled harness: it owns the value the way a real caller (the tools run
 * panel) does, and mirrors it into an <output> so tests can assert the exact
 * emitted JS value after each edit.
 */
function Harness({
  schema,
  initial,
  completionProvider,
}: {
  schema: JsonSchema;
  initial: unknown;
  completionProvider?: CompletionProvider;
}) {
  const [value, setValue] = useState<unknown>(initial);
  return (
    <>
      <SchemaForm
        schema={schema}
        value={value}
        onChange={setValue}
        completionProvider={completionProvider}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

function emitted(): string {
  return screen.getByTestId('value').textContent;
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('SchemaForm — primitives', () => {
  it('edits a string and emits the typed string', async () => {
    const user = userEvent.setup();
    const schema: JsonSchema = {
      type: 'object',
      properties: { name: { type: 'string', title: 'Name' } },
      required: ['name'],
    };
    render(<Harness schema={schema} initial={{}} />);
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'ada');
    expect(emitted()).toBe('{"name":"ada"}');
  });

  it('coerces an integer field to a number', async () => {
    const user = userEvent.setup();
    const schema: JsonSchema = {
      type: 'object',
      properties: { age: { type: 'integer', title: 'Age' } },
      required: ['age'],
    };
    render(<Harness schema={schema} initial={{}} />);
    await user.type(screen.getByRole('spinbutton', { name: 'Age' }), '7');
    expect(emitted()).toBe('{"age":7}');
  });

  it('emits a boolean from a checkbox', async () => {
    const user = userEvent.setup();
    const schema: JsonSchema = {
      type: 'object',
      properties: { active: { type: 'boolean', title: 'Active' } },
      required: ['active'],
    };
    render(<Harness schema={schema} initial={{}} />);
    await user.click(screen.getByRole('checkbox', { name: 'Active' }));
    expect(emitted()).toBe('{"active":true}');
  });

  it('renders a const field as a fixed, disabled value', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { kind: { const: 'widget', title: 'Kind' } },
      required: ['kind'],
    };
    render(<Harness schema={schema} initial={defaultValueForSchema(schema)} />);
    const input = screen.getByRole('textbox', { name: 'Kind' });
    expect(input).toHaveValue('widget');
    expect(input).toBeDisabled();
  });
});

describe('SchemaForm — enum', () => {
  it('renders a small enum as selectable radios and emits the real value', async () => {
    const user = userEvent.setup();
    const schema: JsonSchema = {
      type: 'object',
      properties: { color: { enum: ['red', 'green'], title: 'Color' } },
      required: ['color'],
    };
    render(<Harness schema={schema} initial={{}} />);
    await user.click(screen.getByRole('radio', { name: 'green' }));
    expect(emitted()).toBe('{"color":"green"}');
  });

  it('renders a large enum as a Select', async () => {
    const user = userEvent.setup();
    const schema: JsonSchema = {
      type: 'object',
      properties: { size: { enum: ['xs', 's', 'm', 'l'], title: 'Size' } },
      required: ['size'],
    };
    render(<Harness schema={schema} initial={{}} />);
    await user.click(screen.getByRole('combobox', { name: 'Size' }));
    await user.click(await screen.findByRole('option', { name: 'l' }));
    expect(emitted()).toBe('{"size":"l"}');
  });
});

describe('SchemaForm — composite', () => {
  it('resolves a $ref and renders the referenced object', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { address: { $ref: '#/$defs/Address' } },
      $defs: {
        Address: { type: 'object', properties: { street: { type: 'string', title: 'Street' } } },
      },
    };
    render(<Harness schema={schema} initial={{}} />);
    expect(screen.getByRole('textbox', { name: 'Street' })).toBeInTheDocument();
  });

  it('treats a null-union as an optional field that is valid empty', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        nickname: { anyOf: [{ type: 'string' }, { type: 'null' }], title: 'Nickname' },
      },
    };
    render(<Harness schema={schema} initial={defaultValueForSchema(schema)} />);
    expect(screen.getByRole('textbox', { name: 'Nickname' })).toBeInTheDocument();
    // No value seeded for the optional field.
    expect(emitted()).toBe('{}');
  });

  it('edits a nested object', async () => {
    const user = userEvent.setup();
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          title: 'User',
          properties: { name: { type: 'string', title: 'Full name' } },
          required: ['name'],
        },
      },
      required: ['user'],
    };
    render(<Harness schema={schema} initial={{}} />);
    await user.type(screen.getByRole('textbox', { name: 'Full name' }), 'x');
    expect(emitted()).toBe('{"user":{"name":"x"}}');
  });

  it('adds and removes array items, updating the value array', async () => {
    const user = userEvent.setup();
    const schema: JsonSchema = {
      type: 'object',
      properties: { tags: { type: 'array', items: { type: 'string' }, title: 'Tags' } },
    };
    render(<Harness schema={schema} initial={{}} />);

    await user.click(screen.getByRole('button', { name: 'Add item' }));
    expect(emitted()).toBe('{"tags":[""]}');

    await user.type(screen.getByRole('textbox', { name: 'Item 1' }), 'z');
    expect(emitted()).toBe('{"tags":["z"]}');

    await user.click(screen.getByRole('button', { name: 'Remove item 1' }));
    expect(emitted()).toBe('{"tags":[]}');
  });
});

describe('SchemaForm — unions', () => {
  const petSchema: JsonSchema = {
    $defs: {
      Cat: {
        type: 'object',
        title: 'Cat',
        properties: { kind: { const: 'cat' }, meow: { type: 'boolean', title: 'meow' } },
        required: ['kind', 'meow'],
      },
      Dog: {
        type: 'object',
        title: 'Dog',
        properties: { kind: { const: 'dog' }, bark: { type: 'boolean', title: 'bark' } },
        required: ['kind', 'bark'],
      },
    },
    discriminator: { propertyName: 'kind' },
    oneOf: [{ $ref: '#/$defs/Cat' }, { $ref: '#/$defs/Dog' }],
  };

  it('switches a discriminated union sub-form and the value shape', async () => {
    const user = userEvent.setup();
    render(<Harness schema={petSchema} initial={undefined} />);

    await user.click(screen.getByRole('combobox', { name: 'Variant' }));
    await user.click(await screen.findByRole('option', { name: 'dog' }));

    expect(emitted()).toBe('{"kind":"dog"}');
    expect(screen.getByRole('checkbox', { name: 'bark' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'meow' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'bark' }));
    expect(emitted()).toBe('{"kind":"dog","bark":true}');
  });

  it('offers a best-effort variant selector for a plain (non-discriminated) union', async () => {
    const user = userEvent.setup();
    const schema: JsonSchema = {
      anyOf: [
        {
          type: 'object',
          title: 'A',
          properties: { a: { type: 'string', default: 'x', title: 'a' } },
          required: ['a'],
        },
        {
          type: 'object',
          title: 'B',
          properties: { b: { type: 'string', default: 'y', title: 'b' } },
          required: ['b'],
        },
      ],
    };
    render(<Harness schema={schema} initial={undefined} />);

    await user.click(screen.getByRole('combobox', { name: 'Variant' }));
    await user.click(await screen.findByRole('option', { name: 'B' }));

    expect(emitted()).toBe('{"b":"y"}');
    expect(screen.getByRole('textbox', { name: 'b' })).toHaveValue('y');
  });
});

describe('SchemaForm — scalar unions', () => {
  // A non-discriminated `Union[str, int]` as Pydantic emits it.
  const scalarUnion: JsonSchema = { anyOf: [{ type: 'string' }, { type: 'integer' }] };

  it('validates a held string value without a "no matching variant" error', () => {
    expect(validateAgainstSchema(scalarUnion, 'hello')).toEqual({});
    expect(validateAgainstSchema(scalarUnion, 7)).toEqual({});
  });

  it('keeps the string variant active while a string value is held', () => {
    render(<Harness schema={scalarUnion} initial="hello" />);
    // The string variant renders its text input seeded with the held value —
    // the picker does not snap back to the empty placeholder.
    expect(screen.getByRole('textbox')).toHaveValue('hello');
    expect(emitted()).toBe('"hello"');
  });

  it('seeds a concrete 0 and renders the numeric input when the integer variant is picked', async () => {
    const user = userEvent.setup();
    render(<Harness schema={scalarUnion} initial={undefined} />);

    await user.click(screen.getByRole('combobox', { name: 'Variant' }));
    await user.click(await screen.findByRole('option', { name: 'Option 2' }));

    expect(emitted()).toBe('0');
    expect(screen.getByRole('spinbutton')).toHaveValue(0);
  });
});

describe('SchemaForm — completion provider', () => {
  const nameSchema: JsonSchema = {
    type: 'object',
    properties: { name: { type: 'string', title: 'Name' } },
    required: ['name'],
  };

  it('routes a string field through CompletionInput when a provider is supplied', async () => {
    const user = userEvent.setup();
    const completionProvider = vi.fn((_argName: string, partial: string) =>
      Promise.resolve([`${partial}-one`, `${partial}-two`]),
    );
    render(<Harness schema={nameSchema} initial={{}} completionProvider={completionProvider} />);

    const input = screen.getByRole('combobox', { name: 'Name' });
    await user.type(input, 'a');

    const options = await screen.findAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual(['a-one', 'a-two']);
    expect(completionProvider).toHaveBeenCalledWith('name', 'a');

    await user.click(screen.getByRole('option', { name: 'a-two' }));
    expect(emitted()).toBe('{"name":"a-two"}');
  });

  it('renders a plain text input (no combobox) when no provider is supplied', () => {
    render(<Harness schema={nameSchema} initial={{}} />);
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('surfaces a completion-fetch failure instead of swallowing it', async () => {
    const user = userEvent.setup();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const completionProvider = vi.fn(() => Promise.reject(new Error('completions boom')));
    render(<Harness schema={nameSchema} initial={{}} completionProvider={completionProvider} />);

    await user.type(screen.getByRole('combobox', { name: 'Name' }), 'a');

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining('completion fetch failed for field "name"'),
        expect.any(Error),
      );
    });
    // No suggestions surface from a failed fetch.
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('does not re-fetch completions when an unrelated field re-renders', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    const completionProvider = vi.fn((_argName: string, partial: string) => {
      calls.push(partial);
      return Promise.resolve([`${partial}-x`]);
    });
    const twoFieldSchema: JsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', title: 'Name' },
        count: { type: 'integer', title: 'Count' },
      },
    };
    render(
      <Harness schema={twoFieldSchema} initial={{}} completionProvider={completionProvider} />,
    );

    await user.type(screen.getByRole('combobox', { name: 'Name' }), 'a');
    await screen.findByRole('option', { name: 'a-x' });
    expect(calls.filter((partial) => partial === 'a')).toHaveLength(1);

    // Editing an unrelated field re-renders the whole form. The name field's
    // value is unchanged, so the memoised bridge must NOT trigger a fresh fetch.
    await user.type(screen.getByRole('spinbutton', { name: 'Count' }), '3');

    expect(calls.filter((partial) => partial === 'a')).toHaveLength(1);
  });
});

describe('SchemaForm — media upload', () => {
  const avatarSchema: JsonSchema = {
    type: 'object',
    properties: {
      avatar: { type: 'string', title: 'Avatar', format: 'data-url', contentMediaType: 'image/*' },
    },
    required: ['avatar'],
  };

  const pdfSchema: JsonSchema = {
    type: 'object',
    properties: {
      doc: {
        type: 'string',
        title: 'Doc',
        contentEncoding: 'base64',
        contentMediaType: 'application/pdf',
      },
    },
    required: ['doc'],
  };

  it('renders an upload control for an image field and emits a data-url with a preview', async () => {
    const user = userEvent.setup();
    render(<Harness schema={avatarSchema} initial={{}} />);

    const input = screen.getByLabelText('Avatar');
    expect(input).toHaveAttribute('type', 'file');

    await user.upload(input, new File(['hello'], 'a.png', { type: 'image/png' }));

    await waitFor(() => {
      expect(emitted()).toBe('{"avatar":"data:image/png;base64,aGVsbG8="}');
    });
    // An image type previews as a thumbnail sourced from the data-url.
    expect(screen.getByRole('img', { name: 'a.png' })).toHaveAttribute(
      'src',
      'data:image/png;base64,aGVsbG8=',
    );
  });

  it('emits a bare base64 body (no data: prefix) for a contentEncoding:base64 field', async () => {
    const user = userEvent.setup();
    render(<Harness schema={pdfSchema} initial={{}} />);

    await user.upload(
      screen.getByLabelText('Doc'),
      new File(['hello'], 'a.pdf', { type: 'application/pdf' }),
    );

    await waitFor(() => {
      expect(emitted()).toBe('{"doc":"aGVsbG8="}');
    });
    // A non-image type shows a filename chip, not a thumbnail.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('a.pdf')).toBeInTheDocument();
  });

  it('keeps a plain (unannotated) string field as a text input — no upload control', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { name: { type: 'string', title: 'Name' } },
    };
    const { container } = render(<Harness schema={schema} initial={{}} />);
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  it('renders the upload control for an OPTIONAL media field (annotations on the null-union wrapper)', async () => {
    const user = userEvent.setup();
    // Pydantic places media keywords on the OUTER anyOf wrapper of an optional
    // (`str | None`) field, not the inner string member.
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        avatar: {
          anyOf: [{ type: 'string' }, { type: 'null' }],
          title: 'Avatar',
          format: 'data-url',
          contentMediaType: 'image/*',
        },
      },
    };
    render(<Harness schema={schema} initial={{}} />);

    const input = screen.getByLabelText('Avatar');
    expect(input).toHaveAttribute('type', 'file');

    await user.upload(input, new File(['hello'], 'a.png', { type: 'image/png' }));
    await waitFor(() => {
      expect(emitted()).toBe('{"avatar":"data:image/png;base64,aGVsbG8="}');
    });
  });

  it('rejects an over-cap file loudly and never truncates the value', async () => {
    const user = userEvent.setup();
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        avatar: {
          type: 'string',
          title: 'Avatar',
          format: 'data-url',
          contentMediaType: 'image/*',
          contentMaxBytes: 4,
        },
      },
      required: ['avatar'],
    };
    render(<Harness schema={schema} initial={{}} />);

    await user.upload(
      screen.getByLabelText('Avatar'),
      new File(['hello world'], 'big.png', { type: 'image/png' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/over the/i);
    });
    // Nothing was accepted — the value stays empty, never a truncated blob.
    expect(emitted()).toBe('{}');
  });

  it('enforces the maxUploadBytes prop as the default cap when the schema declares none', async () => {
    const user = userEvent.setup();
    // `avatarSchema` carries no `contentMaxBytes`, so the component-level prop cap
    // (drilled through context) is the limit an over-cap file must trip.
    function CapHarness() {
      const [value, setValue] = useState<unknown>({});
      return (
        <>
          <SchemaForm schema={avatarSchema} value={value} onChange={setValue} maxUploadBytes={4} />
          <output data-testid="value">{JSON.stringify(value)}</output>
        </>
      );
    }
    render(<CapHarness />);

    await user.upload(
      screen.getByLabelText('Avatar'),
      new File(['hello world'], 'big.png', { type: 'image/png' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/over the/i);
    });
    expect(screen.getByTestId('value')).toHaveTextContent('{}');
  });

  const cappedAvatarSchema: JsonSchema = {
    type: 'object',
    properties: {
      avatar: {
        type: 'string',
        title: 'Avatar',
        format: 'data-url',
        contentMediaType: 'image/*',
        contentMaxBytes: 4,
      },
    },
    required: ['avatar'],
  };

  it('rejects an over-cap PASTED value loudly and never accepts it', async () => {
    const user = userEvent.setup();
    render(<Harness schema={cappedAvatarSchema} initial={{}} />);

    const paste = screen.getByLabelText('Or paste a value');
    await user.click(paste);
    // "aGVsbG8gd29ybGQ=" decodes to 11 bytes, over the 4-byte cap.
    await user.paste('aGVsbG8gd29ybGQ=');

    expect(screen.getByRole('alert')).toHaveTextContent(/over the/i);
    // Nothing accepted — the value stays empty, never a truncated blob.
    expect(emitted()).toBe('{}');
  });

  it('accepts an under-cap PASTED value', async () => {
    const user = userEvent.setup();
    render(<Harness schema={cappedAvatarSchema} initial={{}} />);

    const paste = screen.getByLabelText('Or paste a value');
    await user.click(paste);
    // "aGk=" decodes to 2 bytes, under the 4-byte cap.
    await user.paste('aGk=');

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(emitted()).toBe('{"avatar":"aGk="}');
  });

  it('paste path: the field contentMaxBytes overrides a larger maxUploadBytes prop', async () => {
    const user = userEvent.setup();
    // Field cap 4, generous prop cap 1000 → the 11-byte paste must trip the FIELD cap.
    function CapHarness() {
      const [value, setValue] = useState<unknown>({});
      return (
        <>
          <SchemaForm
            schema={cappedAvatarSchema}
            value={value}
            onChange={setValue}
            maxUploadBytes={1000}
          />
          <output data-testid="value">{JSON.stringify(value)}</output>
        </>
      );
    }
    render(<CapHarness />);

    const paste = screen.getByLabelText('Or paste a value');
    await user.click(paste);
    await user.paste('aGVsbG8gd29ybGQ=');

    expect(screen.getByRole('alert')).toHaveTextContent(/over the/i);
    expect(screen.getByTestId('value')).toHaveTextContent('{}');
  });

  it('paste path: the maxUploadBytes prop overrides the default when the schema pins no cap', async () => {
    const user = userEvent.setup();
    // `avatarSchema` carries no `contentMaxBytes`; the prop cap of 4 is the limit.
    function CapHarness() {
      const [value, setValue] = useState<unknown>({});
      return (
        <>
          <SchemaForm schema={avatarSchema} value={value} onChange={setValue} maxUploadBytes={4} />
          <output data-testid="value">{JSON.stringify(value)}</output>
        </>
      );
    }
    render(<CapHarness />);

    const paste = screen.getByLabelText('Or paste a value');
    await user.click(paste);
    await user.paste('aGVsbG8gd29ybGQ=');

    expect(screen.getByRole('alert')).toHaveTextContent(/over the/i);
    expect(screen.getByTestId('value')).toHaveTextContent('{}');
  });

  it('rejects a MIME-mismatched file loudly', async () => {
    // `applyAccept: false` bypasses the browser accept filter so the component's
    // own MIME check is what rejects the file.
    const user = userEvent.setup({ applyAccept: false });
    render(<Harness schema={avatarSchema} initial={{}} />);

    await user.upload(
      screen.getByLabelText('Avatar'),
      new File(['hello'], 'note.txt', { type: 'text/plain' }),
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/does not match/i);
    });
    expect(emitted()).toBe('{}');
  });

  it('renders the uploaded filename as escaped text, never as HTML', async () => {
    const user = userEvent.setup();
    const payload = '<img src=x onerror=alert(1)>.pdf';
    const { container } = render(<Harness schema={pdfSchema} initial={{}} />);

    await user.upload(
      screen.getByLabelText('Doc'),
      new File(['hello'], payload, { type: 'application/pdf' }),
    );

    await waitFor(() => {
      expect(screen.getByText(payload)).toBeInTheDocument();
    });
    // The filename is a text node — no element was ever created from it.
    expect(container.querySelector('img')).toBeNull();
  });

  it('drops a stale attachment chip when the field value is reset externally', async () => {
    const user = userEvent.setup();
    function ResetHarness() {
      const [value, setValue] = useState<unknown>({});
      return (
        <>
          <SchemaForm schema={avatarSchema} value={value} onChange={setValue} />
          <button
            type="button"
            onClick={() => {
              setValue({});
            }}
          >
            Reset
          </button>
          <output data-testid="value">{JSON.stringify(value)}</output>
        </>
      );
    }
    render(<ResetHarness />);

    await user.upload(
      screen.getByLabelText('Avatar'),
      new File(['hello'], 'a.png', { type: 'image/png' }),
    );
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'a.png' })).toBeInTheDocument();
    });

    // The parent resets the field value out-of-band; the stale chip/thumbnail must go.
    await user.click(screen.getByRole('button', { name: 'Reset' }));
    expect(screen.queryByRole('img', { name: 'a.png' })).not.toBeInTheDocument();
    expect(screen.getByTestId('value')).toHaveTextContent('{}');
  });

  it('round-trips the produced value through a SchemaForm submit', async () => {
    const user = userEvent.setup();
    function SubmitHarness() {
      const [value, setValue] = useState<unknown>({});
      const [submitted, setSubmitted] = useState<string | undefined>(undefined);
      return (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(JSON.stringify(value));
          }}
        >
          <SchemaForm schema={avatarSchema} value={value} onChange={setValue} />
          <button type="submit">Run</button>
          <output data-testid="submitted">{submitted}</output>
        </form>
      );
    }
    render(<SubmitHarness />);

    await user.upload(
      screen.getByLabelText('Avatar'),
      new File(['hello'], 'a.png', { type: 'image/png' }),
    );
    await user.click(screen.getByRole('button', { name: 'Run' }));

    expect(screen.getByTestId('submitted')).toHaveTextContent(
      '{"avatar":"data:image/png;base64,aGVsbG8="}',
    );
  });
});

describe('SchemaForm — safety', () => {
  it('renders an unsupported construct loudly without dropping the field', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { anything: { title: 'anything' } },
      required: ['anything'],
    };
    render(<Harness schema={schema} initial={{}} />);
    expect(screen.getByText('Unsupported')).toBeInTheDocument();
    expect(screen.getByText(/unsupported field: anything/)).toBeInTheDocument();
  });

  it('renders schema-supplied title/description as escaped text, never as HTML', () => {
    const payload = '<script>alert(1)</script>';
    const schema: JsonSchema = { type: 'string', title: payload, description: payload };
    const { container } = render(
      <SchemaForm schema={schema} value="" onChange={() => undefined} />,
    );

    // The literal text is present (React escaped it into text nodes)…
    expect(within(container).getAllByText(payload).length).toBeGreaterThan(0);
    // …and no <script> element was ever created from the schema string.
    expect(container.querySelector('script')).toBeNull();
  });
});

describe('SchemaForm — design system', () => {
  const nestedSchema: JsonSchema = {
    type: 'object',
    properties: {
      user: {
        type: 'object',
        title: 'User',
        description: 'Who is asking',
        properties: { name: { type: 'string', title: 'Full name' } },
      },
    },
  };

  it('lays the form root out on the shared stack class', () => {
    render(<Harness schema={nestedSchema} initial={{}} />);
    expect(screen.getByTestId('schema-form')).toHaveClass('tai-stack');
  });

  it('renders a nested group on the card surface with a field label and hint', () => {
    const { container } = render(<Harness schema={nestedSchema} initial={{}} />);

    expect(screen.getByText('User')).toHaveClass('tai-field-label');
    expect(screen.getByText('Who is asking')).toHaveClass('tai-field-hint');

    const group = container.querySelector('.tai-card');
    expect(group).not.toBeNull();
    expect(group).toHaveClass('tai-stack', 'tai-stack-3');
    expect(within(group as HTMLElement).getByRole('textbox', { name: 'Full name' })).toBeVisible();
  });

  it('pairs a group-level error with an icon AND the message, never a hue alone', () => {
    render(
      <SchemaForm
        schema={nestedSchema}
        value={{}}
        onChange={() => undefined}
        errors={{ user: 'User is incomplete' }}
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('tai-field-error');
    expect(alert).toHaveTextContent('User is incomplete');
    expect(alert.querySelector('svg')).toHaveClass('tai-icon');
  });

  it('gives the array remove control an icon, the icon-button class and a real name', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { tags: { type: 'array', items: { type: 'string' }, title: 'Tags' } },
    };
    render(<Harness schema={schema} initial={{ tags: ['a'] }} />);

    const remove = screen.getByRole('button', { name: 'Remove item 1' });
    expect(remove).toHaveClass('tai-icon-btn');
    expect(remove.querySelector('svg')).toHaveClass('tai-icon');
    // The mark is the whole control — no Unicode glyph stands in for it.
    expect(remove.textContent).toBe('');
  });

  it('renders the empty array state as a field hint', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { tags: { type: 'array', items: { type: 'string' }, title: 'Tags' } },
    };
    render(<Harness schema={schema} initial={{}} />);
    expect(screen.getByText('No items')).toHaveClass('tai-field-hint');
  });

  it('renders the union variant picker and its object fields on the group surface', async () => {
    const user = userEvent.setup();
    const schema: JsonSchema = {
      anyOf: [
        {
          type: 'object',
          title: 'A',
          properties: { a: { type: 'string', default: 'x', title: 'a' } },
          required: ['a'],
        },
        {
          type: 'object',
          title: 'B',
          properties: { b: { type: 'string', default: 'y', title: 'b' } },
          required: ['b'],
        },
      ],
    };
    const { container } = render(<Harness schema={schema} initial={undefined} />);

    await user.click(screen.getByRole('combobox', { name: 'Variant' }));
    await user.click(await screen.findByRole('option', { name: 'B' }));

    const cards = container.querySelectorAll('.tai-card');
    const variantFields = cards[cards.length - 1] as HTMLElement;
    expect(variantFields).toHaveClass('tai-stack', 'tai-stack-3');
    expect(within(variantFields).getByRole('textbox', { name: 'b' })).toBeVisible();
  });

  it('renders the unsupported notice as a warning badge: a mark plus a label', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: { anything: { title: 'anything' } },
      required: ['anything'],
    };
    render(<Harness schema={schema} initial={{}} />);

    const badge = screen.getByText('Unsupported');
    expect(badge).toHaveAttribute('data-variant', 'warning');
    expect(badge.querySelector('svg')).toHaveClass('tai-icon');
    expect(screen.getByText(/unsupported field: anything/)).toHaveClass('tai-field-hint');
  });

  it('renders the media drop zone, its hint and the paste fallback on DS classes', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        avatar: {
          type: 'string',
          title: 'Avatar',
          format: 'data-url',
          contentMediaType: 'image/*',
        },
      },
    };
    render(<Harness schema={schema} initial={{}} />);

    const file = screen.getByLabelText('Avatar');
    expect(file.parentElement).toHaveClass('tai-card', 'tai-stack', 'tai-stack-2');
    expect(screen.getByText(/Drag & drop a file here/)).toHaveClass('tai-field-hint');
    expect(screen.getByText('Or paste a value')).toHaveClass('tai-field-hint');
    expect(screen.getByLabelText('Or paste a value')).toHaveAttribute('type', 'text');
  });

  it('pairs a rejected upload with an icon AND the message', async () => {
    const user = userEvent.setup();
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        avatar: {
          type: 'string',
          title: 'Avatar',
          format: 'data-url',
          contentMediaType: 'image/*',
          contentMaxBytes: 4,
        },
      },
      required: ['avatar'],
    };
    render(<Harness schema={schema} initial={{}} />);

    await user.upload(
      screen.getByLabelText('Avatar'),
      new File(['hello world'], 'big.png', { type: 'image/png' }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveClass('tai-field-error');
    expect(alert).toHaveTextContent(/over the/i);
    expect(alert.querySelector('svg')).toHaveClass('tai-icon');
  });

  it('caps an image preview at the width it is given', async () => {
    const user = userEvent.setup();
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        avatar: {
          type: 'string',
          title: 'Avatar',
          format: 'data-url',
          contentMediaType: 'image/*',
        },
      },
    };
    render(<Harness schema={schema} initial={{}} />);

    await user.upload(
      screen.getByLabelText('Avatar'),
      new File(['hello'], 'a.png', { type: 'image/png' }),
    );

    const preview = await screen.findByRole('img', { name: 'a.png' });
    expect(preview).toHaveStyle({ maxWidth: '100%' });
  });

  it('renders its fields and keeps their accessible names under both themes', () => {
    for (const theme of ['light', 'dark'] as const) {
      document.documentElement.setAttribute('data-theme', theme);
      const { unmount } = render(<Harness schema={nestedSchema} initial={{}} />);

      expect(screen.getByTestId('schema-form')).toHaveClass('tai-stack');
      expect(screen.getByText('User')).toHaveClass('tai-field-label');
      expect(screen.getByRole('textbox', { name: 'Full name' })).toBeVisible();

      unmount();
    }
  });
});
