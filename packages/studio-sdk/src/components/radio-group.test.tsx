import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Field } from './field';
import { TextInput } from './inputs';
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

  it('sits inside the group container the enclosing Field names', () => {
    const { container } = render(
      <Field label="Fruit" group>
        <RadioGroup options={OPTIONS} />
      </Field>,
    );
    // The Field renders the named group; this component does NOT self-name from
    // the field's label. Naming by construction is the point: the previous shape
    // published a label id for the group control to read, and ten live sites
    // never read it. A radiogroup with no `label` of its own is therefore
    // unnamed, and its NAME lives on the container it sits in.
    const named = screen.getByRole('group', { name: 'Fruit' });
    expect(named).toContainElement(screen.getByRole('radiogroup'));
    expect(screen.getByRole('radiogroup')).not.toHaveAccessibleName();

    // A group Field renders NO `<label>` at all. `<label for>` names a LABELABLE
    // element, and a group is not one: pointed at a group the attribute either
    // dangles at an id no element carries or names an element the browser
    // refuses to label. A `<label>` associated with nothing is a semantics lie,
    // so the group-mode label is a `<span>` that keeps its `id` and the
    // container points `aria-labelledby` at it.
    expect(container.querySelector('label.tai-field-label')).toBeNull();
    const label = container.querySelector('span.tai-field-label');
    expect(label?.id).not.toBe('');
    expect(named).toHaveAttribute('aria-labelledby', label?.id);
  });

  it('leaves a non-group Field pointing its label at the control it wraps', () => {
    // The counterpart control: without this, dropping `for` unconditionally
    // would pass the test above and silently unlabel every text input.
    const { container } = render(
      <Field label="Name">
        <TextInput />
      </Field>,
    );
    const label = container.querySelector('label.tai-field-label');
    const target = label?.getAttribute('for');
    expect(target).not.toBeNull();
    expect(container.ownerDocument.getElementById(target ?? '')).not.toBeNull();
  });

  it('defaults to a vertical list of tai-radio items with a tai-choice label row', async () => {
    const user = userEvent.setup();
    render(<RadioGroup options={OPTIONS} />);

    const group = screen.getByRole('radiogroup');
    expect(group).toHaveClass('tai-stack', 'tai-stack-2');
    // No orientation is claimed unless a caller names one: `aria-orientation`
    // already defaults to vertical for a radiogroup, and pinning it here is what
    // would take one arrow axis away from every group that never asked.
    expect(group).not.toHaveAttribute('aria-orientation');

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

  it('pins the axis only when a caller names one', () => {
    render(<RadioGroup options={OPTIONS} orientation="vertical" />);
    const group = screen.getByRole('radiogroup');
    expect(group).toHaveClass('tai-stack', 'tai-stack-2');
    expect(group).toHaveAttribute('aria-orientation', 'vertical');
  });

  it('moves on BOTH arrow axes when no orientation is named', async () => {
    const user = userEvent.setup();
    render(<RadioGroup options={OPTIONS} aria-label="Fruit" />);

    const [apple, banana] = OPTIONS.map((option) =>
      screen.getByRole('radio', { name: option.label }),
    );
    await user.tab();
    expect(apple).toHaveFocus();

    // Down and Right are the same movement for an unpinned group; pinning the
    // axis is what turns one of the two into a dead key.
    await user.keyboard('{ArrowDown}');
    expect(banana).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(apple).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(banana).toHaveFocus();
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

  it("exposes the group Field's invalid state on the control, not on the container", () => {
    // `aria-invalid` is not supported on `role="group"` (ARIA 1.2), so if a group
    // Field withheld the flag along with the id and the description, an errored
    // group would expose its invalid state NOWHERE in the accessibility tree —
    // which is what withholding the whole context did.
    render(
      <Field label="Expiry" error="Pick when it stops." group>
        <RadioGroup options={OPTIONS} />
      </Field>,
    );
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-invalid', 'true');
    // …and the container carries the name and the description, not the flag.
    const group = screen.getByRole('group', { name: 'Expiry' });
    expect(group).toHaveAccessibleDescription(/Pick when it stops/);
    expect(group).not.toHaveAttribute('aria-invalid');
  });

  it("describes the group container from the Field's description AND its error", () => {
    render(
      <Field label="Expiry" description="Pick a month." error="Pick when it stops." group>
        <RadioGroup options={OPTIONS} />
      </Field>,
    );

    // Read as a consumer does: resolve the IDREF list to the elements it names
    // and take their text. Every id has to LAND — `aria-describedby` pointing at
    // an id no element carries computes an empty description, so the hint and
    // the error are both announced by nothing.
    const group = screen.getByRole('group', { name: 'Expiry' });
    const ids = (group.getAttribute('aria-describedby') ?? '').split(' ').filter((id) => id !== '');
    const described = ids.map((id) => document.getElementById(id)?.textContent);
    expect(described).toEqual(['Pick a month.', 'Pick when it stops.']);
    expect(group).toHaveAccessibleDescription('Pick a month. Pick when it stops.');
  });

  it('keeps its own label prop as the inner name, under the Field-named group', () => {
    render(
      <Field label="Fruit" group>
        <RadioGroup options={OPTIONS} label="Variety" />
      </Field>,
    );
    // Two names, at two levels, each true: the Field's group carries the field
    // label, the radiogroup carries the one the caller gave it. The old shape
    // had the inner group silently steal the outer name, so a caller could not
    // say anything more specific than the field label.
    expect(screen.getByRole('group', { name: 'Fruit' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Variety' })).toBeInTheDocument();
  });
});

describe('RadioGroup (segmented)', () => {
  it('renders each option AS a segment: no dot, icon plus label, name preserved', () => {
    render(
      <RadioGroup options={THEME_OPTIONS} variant="segmented" aria-label="Theme" value="light" />,
    );

    const group = screen.getByRole('radiogroup', { name: 'Theme' });
    expect(group).toHaveClass('tai-segmented');
    // `.tai-segmented` lays out as a row and turns into a column only for
    // `[data-orientation='vertical']`, so an unnamed orientation must leave the
    // attribute off — a strip is horizontal until a caller says otherwise.
    expect(group).not.toHaveAttribute('data-orientation');
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

it('renders the list variant and keeps every accessible name', () => {
  render(<RadioGroup options={OPTIONS} label="Fruit" />);

  expect(screen.getByRole('radiogroup', { name: 'Fruit' })).toHaveClass('tai-stack');
  expect(screen.getByRole('radio', { name: 'Apple' })).toHaveClass('tai-radio');
  expect(screen.getByRole('radio', { name: 'Banana' })).toBeInTheDocument();
});

it('renders the segmented variant and keeps every accessible name', () => {
  render(<RadioGroup options={THEME_OPTIONS} variant="segmented" aria-label="Theme" />);

  expect(screen.getByRole('radiogroup', { name: 'Theme' })).toHaveClass('tai-segmented');
  for (const name of ['Light', 'Dark', 'System']) {
    expect(screen.getByRole('radio', { name })).toHaveClass('tai-segment');
  }
});
