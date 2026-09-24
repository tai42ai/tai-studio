/**
 * The fixed-kwargs editor component: building each kind of row through the DOM, the
 * Fields ⇄ JSON view switch, reading a stored marker back as a reference row, and the
 * validity signal that blocks a submit while a row is half-edited.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { PresetKwargsEditor } from './PresetKwargsEditor';

/** A controlled harness holding the text state the real doors hold, exposing the callbacks. */
function Harness({
  initial = '{}',
  availableKeys = [],
  keyPickingAvailable = false,
  onText = () => undefined,
  onValid = () => undefined,
}: {
  readonly initial?: string;
  readonly availableKeys?: readonly string[];
  readonly keyPickingAvailable?: boolean;
  readonly onText?: (text: string) => void;
  readonly onValid?: (valid: boolean) => void;
}) {
  const [text, setText] = useState(initial);
  return (
    <>
      <PresetKwargsEditor
        value={text}
        onChange={(next) => {
          setText(next);
          onText(next);
        }}
        onValidityChange={onValid}
        error={undefined}
        hints={[]}
        availableKeys={availableKeys}
        keyPickingAvailable={keyPickingAvailable}
      />
      <output data-testid="text">{text}</output>
    </>
  );
}

function currentText(): unknown {
  return JSON.parse(screen.getByTestId('text').textContent);
}

describe('PresetKwargsEditor', () => {
  it('builds a text row and emits it as a JSON object', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Add kwarg' }));
    await user.type(screen.getByLabelText('Key'), 'units');
    await user.type(screen.getByLabelText('Value'), 'metric');
    await waitFor(() => {
      expect(currentText()).toEqual({ units: 'metric' });
    });
  });

  it('emits a reference row as the exact marker, and a default as ${VAR:default}', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness availableKeys={['API_TOKEN']} keyPickingAvailable />);
    await user.click(screen.getByRole('button', { name: 'Add kwarg' }));
    await user.type(screen.getByLabelText('Key'), 'token');
    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(await screen.findByRole('option', { name: 'Secret reference' }));
    // A fresh reference row opens straight on the key picker (initialMode="key").
    await user.click(await screen.findByRole('combobox', { name: 'Secret reference' }));
    await user.click(await screen.findByRole('option', { name: 'API_TOKEN' }));
    await waitFor(() => {
      expect(currentText()).toEqual({ token: '!ENV ${API_TOKEN}' });
    });

    await user.type(screen.getByLabelText('Default (stored in the clear)'), 'dev');
    await waitFor(() => {
      expect(currentText()).toEqual({ token: '!ENV ${API_TOKEN:dev}' });
    });
  });

  it('opens a new reference row on the key picker, without the paste-disabled error', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness availableKeys={['API_TOKEN']} keyPickingAvailable />);
    await user.click(screen.getByRole('button', { name: 'Add kwarg' }));
    await user.type(screen.getByLabelText('Key'), 'token');
    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(await screen.findByRole('option', { name: 'Secret reference' }));
    // The key picker is shown immediately; the "add the secret on System" paste error is not.
    expect(await screen.findByRole('combobox', { name: 'Secret reference' })).toBeInTheDocument();
    expect(
      screen.queryByText('Add the secret on System › Environment, then reference it here.'),
    ).toBeNull();
  });

  it('flags a reference default containing a brace and keeps submit blocked', async () => {
    const user = userEvent.setup({ delay: null });
    const onValid = vi.fn();
    render(<Harness availableKeys={['API_TOKEN']} keyPickingAvailable onValid={onValid} />);
    await user.click(screen.getByRole('button', { name: 'Add kwarg' }));
    await user.type(screen.getByLabelText('Key'), 'token');
    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(await screen.findByRole('option', { name: 'Secret reference' }));
    await user.click(await screen.findByRole('combobox', { name: 'Secret reference' }));
    await user.click(await screen.findByRole('option', { name: 'API_TOKEN' }));
    // `{{` types a literal `{` (user-event treats a lone `{` as a key descriptor).
    await user.type(screen.getByLabelText('Default (stored in the clear)'), 'a{{b');
    await waitFor(() => {
      expect(screen.getByText('Default must not contain { or }')).toBeInTheDocument();
    });
    expect(onValid).toHaveBeenLastCalledWith(false);
  });

  it('reads a stored marker back as a reference row', () => {
    render(
      <Harness
        initial={JSON.stringify({ token: '!ENV ${API_TOKEN}' })}
        availableKeys={['API_TOKEN']}
        keyPickingAvailable
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent('Secret reference');
    // A committed key renders as a revealable chip (its reveal toggle proves the commit).
    expect(screen.getByRole('button', { name: 'Show value' })).toBeInTheDocument();
  });

  it('degrades a reference row to a plain variable input when key picking is unavailable', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness keyPickingAvailable={false} />);
    await user.click(screen.getByRole('button', { name: 'Add kwarg' }));
    await user.type(screen.getByLabelText('Key'), 'token');
    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(await screen.findByRole('option', { name: 'Secret reference' }));
    await user.type(screen.getByLabelText('Environment variable'), 'API_TOKEN');
    await waitFor(() => {
      expect(currentText()).toEqual({ token: '!ENV ${API_TOKEN}' });
    });
  });

  it('edits a number and toggles a boolean, and renders a null row', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness initial={JSON.stringify({ n: 1, flag: true, cleared: null })} />);
    expect(screen.getByText('null')).toBeInTheDocument();
    const numberInput = screen.getAllByLabelText('Value')[0];
    if (numberInput === undefined) throw new Error('expected a number value input');
    await user.clear(numberInput);
    await user.type(numberInput, '7');
    await waitFor(() => {
      expect((currentText() as { n: number }).n).toBe(7);
    });
    await user.click(screen.getByRole('combobox', { name: 'Value' }));
    await user.click(await screen.findByRole('option', { name: 'false' }));
    await waitFor(() => {
      expect((currentText() as { flag: boolean }).flag).toBe(false);
    });
  });

  it('shows a non-scalar as a JSON row whose "Edit as JSON" opens the raw view', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness initial={JSON.stringify({ shape: { a: 1 } })} />);
    expect(screen.queryByLabelText('Fixed kwargs JSON')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Edit as JSON' }));
    expect(screen.getByLabelText('Fixed kwargs JSON')).toBeInTheDocument();
  });

  it('forces the JSON view and reports invalid on malformed seed text', () => {
    const onValid = vi.fn();
    render(<Harness initial="not json" onValid={onValid} />);
    expect(screen.getByLabelText('Fixed kwargs JSON')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Fields' })).toBeDisabled();
    expect(onValid).toHaveBeenLastCalledWith(false);
  });

  it('holds the last valid text and reports invalid while a duplicate key is half-edited', async () => {
    const user = userEvent.setup({ delay: null });
    const onText = vi.fn();
    const onValid = vi.fn();
    render(<Harness initial={JSON.stringify({ a: '1' })} onText={onText} onValid={onValid} />);
    await user.click(screen.getByRole('button', { name: 'Add kwarg' }));
    const keys = screen.getAllByLabelText('Key');
    const lastKey = keys[keys.length - 1];
    if (lastKey === undefined) throw new Error('expected a key input');
    await user.type(lastKey, 'a');
    await waitFor(() => {
      expect(onValid).toHaveBeenLastCalledWith(false);
    });
    // The stale last-valid text is never overwritten by the half-edited duplicate.
    expect(currentText()).toEqual({ a: '1' });
    expect(onText).not.toHaveBeenCalled();
    // Both duplicate rows name the fault beside the field-level alert.
    expect(screen.getAllByText('Duplicate key')).toHaveLength(2);
  });

  it('round-trips Fields → JSON → Fields through the view switch', async () => {
    const user = userEvent.setup({ delay: null });
    render(<Harness initial={JSON.stringify({ units: 'metric' })} />);
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    expect(screen.getByLabelText('Fixed kwargs JSON')).toHaveValue('{\n  "units": "metric"\n}');
    await user.click(screen.getByRole('button', { name: 'Fields' }));
    expect(screen.getByLabelText('Key')).toHaveValue('units');
  });
});
