import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { RecordEntryRendererContext } from './context';
import type { RecordEntryRenderer } from './context';
import { RecordField } from './record-field';
import { SecretRefField } from './SecretRefField';
import type { SecretRef } from './SecretRefField';
import type { JsonSchema } from './types';

const PLAINTEXT = 's3cr3t-PLAINTEXT-value';

/** A controlled harness so committing paste/pick reflects back as `value`. */
function Harness({
  availableKeys,
  keyPickingAvailable,
  initial,
  onChange,
}: {
  availableKeys: readonly string[];
  keyPickingAvailable?: boolean;
  initial?: SecretRef;
  onChange?: (value: SecretRef) => void;
}) {
  const [value, setValue] = useState<SecretRef | undefined>(initial);
  return (
    <SecretRefField
      label="API key"
      value={value}
      availableKeys={availableKeys}
      keyPickingAvailable={keyPickingAvailable}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('SecretRefField', () => {
  it('emits a paste new-secret and never renders the plaintext to the DOM', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(<Harness availableKeys={[]} onChange={onChange} />);

    const input = screen.getByLabelText('API key');
    expect(input).toHaveAttribute('type', 'password');
    await user.type(input, PLAINTEXT);
    await user.click(screen.getByRole('button', { name: 'Use secret' }));

    expect(onChange).toHaveBeenCalledWith({ source: 'paste', secret: PLAINTEXT });
    // After commit the chip is shown and the plaintext is gone from the DOM.
    expect(screen.getByText('New secret')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain(PLAINTEXT);
    expect(screen.queryByDisplayValue(PLAINTEXT)).toBeNull();
  });

  it('offers no reveal for a committed pasted secret', () => {
    const { container } = render(
      <SecretRefField
        label="API key"
        value={{ source: 'paste', secret: PLAINTEXT }}
        availableKeys={[]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Show value' })).toBeNull();
    expect(container.innerHTML).not.toContain(PLAINTEXT);
  });

  it('emits a key-reference when a key is picked from the dropdown', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Harness
        availableKeys={['OPENAI_API_KEY', 'ANTHROPIC_API_KEY']}
        keyPickingAvailable
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Reference existing key' }));
    await user.click(screen.getByRole('combobox', { name: 'API key' }));
    await user.click(screen.getByRole('option', { name: 'OPENAI_API_KEY' }));

    expect(onChange).toHaveBeenCalledWith({ source: 'key', key: 'OPENAI_API_KEY' });
  });

  it('renders a masked reference chip after selection, revealing the key name on click', async () => {
    const user = userEvent.setup();
    render(
      <SecretRefField
        label="API key"
        value={{ source: 'key', key: 'OPENAI_API_KEY' }}
        availableKeys={['OPENAI_API_KEY']}
        keyPickingAvailable
        onChange={vi.fn()}
      />,
    );

    // Masked by default: the key name is not shown until revealed.
    expect(screen.queryByText('OPENAI_API_KEY')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show value' }));
    expect(screen.getByText('OPENAI_API_KEY')).toBeInTheDocument();
  });

  it('falls closed to paste-only when key picking is unavailable', () => {
    render(
      <SecretRefField
        label="API key"
        value={undefined}
        availableKeys={['OPENAI_API_KEY']}
        onChange={vi.fn()}
      />,
    );
    // No mode toggle, no dropdown — only the paste input.
    expect(screen.queryByRole('button', { name: 'Reference existing key' })).toBeNull();
    expect(screen.getByLabelText('API key')).toHaveAttribute('type', 'password');
  });

  it('mounts cleanly as a RecordEntryRenderer, mapping to/from the raw record value', async () => {
    const user = userEvent.setup();
    const emitted: Record<string, unknown>[] = [];

    // The host owns the marker format; the field stays data-agnostic.
    const parse = (raw: unknown): SecretRef | undefined => {
      const match = typeof raw === 'string' ? /^!ENV \$\{([^}]+)\}$/.exec(raw) : null;
      return match === null ? undefined : { source: 'key', key: match[1] ?? '' };
    };
    const renderEntry: RecordEntryRenderer = (entry) => (
      <SecretRefField
        label={entry.keyName}
        value={parse(entry.value)}
        availableKeys={['OPENAI_API_KEY']}
        keyPickingAvailable
        onChange={(next) => {
          entry.onChange(next.source === 'key' ? `!ENV \${${next.key}}` : { staged: next.secret });
        }}
      />
    );

    const valueSchema: JsonSchema = { type: 'string' };
    const root: JsonSchema = {
      type: 'object',
      additionalProperties: valueSchema,
    };

    render(
      <RecordEntryRendererContext.Provider value={renderEntry}>
        <RecordField
          heading="Headers"
          description={undefined}
          error={undefined}
          values={valueSchema}
          root={root}
          value={{ Authorization: '!ENV ${OPENAI_API_KEY}' }}
          onChange={(next) => {
            emitted.push(next as Record<string, unknown>);
          }}
          path=""
          errors={undefined}
          idPrefix="rec"
        />
      </RecordEntryRendererContext.Provider>,
    );

    // The seeded key-ref renders masked, not as its default text input.
    expect(screen.getByRole('button', { name: 'Change reference' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Show value' }));
    expect(screen.getByText('OPENAI_API_KEY')).toBeInTheDocument();
  });

  it('keeps an open reveal across a fresh-but-equal value object', async () => {
    const user = userEvent.setup();
    const key = 'OPENAI_API_KEY';
    const { rerender } = render(
      <SecretRefField
        label="API key"
        value={{ source: 'key', key }}
        availableKeys={[key]}
        keyPickingAvailable
        onChange={vi.fn()}
      />,
    );

    // Reveal the key name.
    await user.click(screen.getByRole('button', { name: 'Show value' }));
    expect(screen.getByText(key)).toBeInTheDocument();

    // A host that re-creates an EQUAL `value` object each render must not collapse the
    // reveal: the reset keys on a stable value signature, not object identity.
    rerender(
      <SecretRefField
        label="API key"
        value={{ source: 'key', key }}
        availableKeys={[key]}
        keyPickingAvailable
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(key)).toBeInTheDocument();
  });

  it('resets the reveal when the referenced key genuinely changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SecretRefField
        label="API key"
        value={{ source: 'key', key: 'OPENAI_API_KEY' }}
        availableKeys={['OPENAI_API_KEY', 'ANTHROPIC_API_KEY']}
        keyPickingAvailable
        onChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Show value' }));
    expect(screen.getByText('OPENAI_API_KEY')).toBeInTheDocument();

    // A DIFFERENT committed key must re-mask: revealing the prior name after the value
    // moved on would name the wrong key.
    rerender(
      <SecretRefField
        label="API key"
        value={{ source: 'key', key: 'ANTHROPIC_API_KEY' }}
        availableKeys={['OPENAI_API_KEY', 'ANTHROPIC_API_KEY']}
        keyPickingAvailable
        onChange={vi.fn()}
      />,
    );
    // The reveal collapsed: neither key name is shown until it is revealed again.
    expect(screen.queryByText('OPENAI_API_KEY')).toBeNull();
    expect(screen.queryByText('ANTHROPIC_API_KEY')).toBeNull();
  });
});
