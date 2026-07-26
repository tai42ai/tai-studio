import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Field } from './field';
import { MoonIcon, MonitorIcon, SunIcon } from './icons';
import { RadioGroup } from './radio-group';

const OPTIONS = [
  { value: 'a', label: 'Apple' },
  { value: 'b', label: 'Banana' },
];

const THEME_OPTIONS = [
  { value: 'light', label: 'Light', icon: <SunIcon />, visuallyHiddenLabel: true },
  { value: 'dark', label: 'Dark', icon: <MoonIcon />, visuallyHiddenLabel: true },
  { value: 'system', label: 'System', icon: <MonitorIcon />, visuallyHiddenLabel: true },
];

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
});

describe('RadioGroup', () => {
  it('renders a radiogroup with a radio per option', () => {
    render(<RadioGroup options={OPTIONS} />);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Apple' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Banana' })).toBeInTheDocument();
  });

  it('selecting a radio fires onValueChange with its value', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<RadioGroup options={OPTIONS} onValueChange={onValueChange} />);

    await user.click(screen.getByRole('radio', { name: 'Banana' }));
    expect(onValueChange).toHaveBeenCalledWith('b');
    expect(screen.getByRole('radio', { name: 'Banana' })).toBeChecked();
  });

  it('takes the enclosing Field label as its accessible group name', () => {
    render(
      <Field label="Fruit">
        <RadioGroup options={OPTIONS} />
      </Field>,
    );
    expect(screen.getByRole('radiogroup', { name: 'Fruit' })).toBeInTheDocument();
  });

  it('defaults to a vertical list of tai-radio items with a tai-choice label row', async () => {
    const user = userEvent.setup();
    render(<RadioGroup options={OPTIONS} />);

    const group = screen.getByRole('radiogroup');
    expect(group).toHaveClass('tai-stack', 'tai-stack-2');
    expect(group).toHaveAttribute('aria-orientation', 'vertical');

    const apple = screen.getByRole('radio', { name: 'Apple' });
    expect(apple).toHaveClass('tai-radio');
    expect(screen.getByText('Apple').closest('label')).toHaveClass('tai-choice');
    // The dot is only mounted for the checked option.
    expect(apple.querySelector('.tai-radio-indicator')).toBeNull();

    await user.click(apple);
    expect(apple.querySelector('.tai-radio-indicator')).not.toBeNull();
  });

  it('lays a horizontal list out as a row and says so in aria-orientation', () => {
    render(<RadioGroup options={OPTIONS} orientation="horizontal" />);
    const group = screen.getByRole('radiogroup');
    expect(group).toHaveClass('tai-row');
    expect(group).toHaveAttribute('aria-orientation', 'horizontal');
  });

  it('names a standalone group from its own label', () => {
    render(<RadioGroup options={OPTIONS} label="Fruit" />);
    expect(screen.getByRole('radiogroup', { name: 'Fruit' })).toBeInTheDocument();
    expect(screen.getByText('Fruit')).toHaveClass('tai-field-label');
  });

  it('names a standalone group from aria-label when it renders no visible label', () => {
    render(<RadioGroup options={OPTIONS} aria-label="Fruit choice" />);
    expect(screen.getByRole('radiogroup', { name: 'Fruit choice' })).toBeInTheDocument();
  });

  it('prefers the enclosing Field label over its own label prop', () => {
    render(
      <Field label="Fruit">
        <RadioGroup options={OPTIONS} label="Ignored" />
      </Field>,
    );
    expect(screen.getByRole('radiogroup', { name: 'Fruit' })).toBeInTheDocument();
  });
});

describe('RadioGroup (segmented)', () => {
  it('renders each option AS a segment: no dot, icon plus label, name preserved', () => {
    render(
      <RadioGroup options={THEME_OPTIONS} variant="segmented" aria-label="Theme" value="light" />,
    );

    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(group).toHaveClass('tai-segmented');
    expect(group).toHaveAttribute('data-orientation', 'vertical');
    expect(group.querySelector('.tai-radio-indicator')).toBeNull();

    for (const name of ['Light', 'Dark', 'System']) {
      const segment = screen.getByRole('radio', { name });
      expect(segment).toHaveClass('tai-segment');
      expect(segment.querySelector('svg')).not.toBeNull();
      // The name survives being visually hidden — it is still real text.
      expect(screen.getByText(name)).toHaveClass('tai-visually-hidden');
    }

    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('data-state', 'checked');
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('data-state', 'unchecked');
  });

  it('keeps a visible label when visuallyHiddenLabel is not set', () => {
    render(
      <RadioGroup
        options={[{ value: 'a', label: 'Apple', icon: <SunIcon /> }]}
        variant="segmented"
        aria-label="Fruit"
      />,
    );
    expect(screen.getByText('Apple')).not.toHaveClass('tai-visually-hidden');
  });

  it('selects through the same Radix machinery as the list variant', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <RadioGroup
        options={THEME_OPTIONS}
        variant="segmented"
        aria-label="Theme"
        onValueChange={onValueChange}
      />,
    );

    await user.click(screen.getByRole('radio', { name: 'System' }));
    expect(onValueChange).toHaveBeenCalledWith('system');
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
  });

  it('carries the horizontal orientation on the root for the strip layout', () => {
    render(
      <RadioGroup
        options={THEME_OPTIONS}
        variant="segmented"
        orientation="horizontal"
        aria-label="Theme"
      />,
    );
    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(group).toHaveClass('tai-segmented');
    expect(group).toHaveAttribute('data-orientation', 'horizontal');
  });

  it('honours a disabled option', () => {
    render(
      <RadioGroup
        options={[{ value: 'a', label: 'Apple', disabled: true }]}
        variant="segmented"
        aria-label="Fruit"
      />,
    );
    expect(screen.getByRole('radio', { name: 'Apple' })).toBeDisabled();
  });
});

describe.each(['light', 'dark'] as const)('RadioGroup under the %s theme', (theme) => {
  it('renders the list variant and keeps every accessible name', () => {
    document.documentElement.setAttribute('data-theme', theme);
    render(<RadioGroup options={OPTIONS} label="Fruit" />);

    expect(screen.getByRole('radiogroup', { name: 'Fruit' })).toHaveClass('tai-stack');
    expect(screen.getByRole('radio', { name: 'Apple' })).toHaveClass('tai-radio');
    expect(screen.getByRole('radio', { name: 'Banana' })).toBeInTheDocument();
  });

  it('renders the segmented variant and keeps every accessible name', () => {
    document.documentElement.setAttribute('data-theme', theme);
    render(<RadioGroup options={THEME_OPTIONS} variant="segmented" aria-label="Theme" />);

    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toHaveClass('tai-segmented');
    for (const name of ['Light', 'Dark', 'System']) {
      expect(screen.getByRole('radio', { name })).toHaveClass('tai-segment');
    }
  });
});
