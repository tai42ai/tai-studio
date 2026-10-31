import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Field } from './field';
import { SearchableSelect } from './searchable-select';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta', disabled: true },
  { value: 'c', label: 'Gamma' },
  { value: 'd', label: 'Alphabet' },
];

function Controlled({
  initial = '',
  onValueChange,
}: {
  readonly initial?: string;
  readonly onValueChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <SearchableSelect
      aria-label="Letter"
      searchLabel="Search letters"
      options={OPTIONS}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
    />
  );
}

function trigger(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Letter' });
}

function search(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Search letters' });
}

function optionNames(): string[] {
  return screen.queryAllByRole('option').map((option) => option.textContent);
}

describe('SearchableSelect', () => {
  it('shows the placeholder, then the chosen label on its trigger', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    expect(trigger()).toHaveTextContent('Select…');

    await user.click(trigger());
    await user.click(screen.getByRole('option', { name: 'Gamma' }));

    expect(trigger()).toHaveTextContent('Gamma');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('opens with the search box focused and narrows the options to labels containing the text', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(trigger());

    expect(search()).toHaveFocus();
    expect(optionNames()).toEqual(['Alpha', 'Beta', 'Gamma', 'Alphabet']);
    await user.type(search(), 'ALPH');
    expect(optionNames()).toEqual(['Alpha', 'Alphabet']);
  });

  it('says nothing matches when the query leaves no option', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(trigger());
    await user.type(search(), 'zz');

    expect(optionNames()).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent('Nothing matches “zz”.');
  });

  it('says there is nothing to choose for an empty list', async () => {
    const user = userEvent.setup();
    render(
      <SearchableSelect
        aria-label="Letter"
        searchLabel="Search letters"
        options={[]}
        value=""
        onValueChange={vi.fn()}
      />,
    );
    await user.click(trigger());
    expect(screen.getByRole('status')).toHaveTextContent('Nothing to choose.');
  });

  it('moves the highlight with the arrow keys past disabled options and chooses it with Enter', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} />);
    await user.click(trigger());

    const active = (): string | undefined =>
      document.getElementById(search().getAttribute('aria-activedescendant') ?? '')?.textContent;
    expect(active()).toBe('Alpha');
    await user.keyboard('{ArrowDown}');
    expect(active()).toBe('Gamma');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(active()).toBe('Alphabet');
    await user.keyboard('{ArrowUp}');
    expect(active()).toBe('Gamma');
    await user.keyboard('{Enter}');

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('c');
    expect(trigger()).toHaveFocus();
  });

  it('moves the highlight to the first match when the query filters it away', async () => {
    const user = userEvent.setup();
    render(<Controlled initial="c" />);
    await user.click(trigger());
    const active = (): string | undefined =>
      document.getElementById(search().getAttribute('aria-activedescendant') ?? '')?.textContent;

    expect(active()).toBe('Gamma');
    expect(screen.getByRole('option', { name: 'Gamma' })).toHaveAttribute('aria-selected', 'true');
    await user.type(search(), 'bet');
    expect(active()).toBe('Alphabet');
  });

  it('opens from the trigger with ArrowDown, and with a typed letter already searched', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    expect(search()).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();

    await user.keyboard('g');
    expect(search()).toHaveValue('g');
    expect(optionNames()).toEqual(['Gamma']);
  });

  it('opens from the trigger as Enter goes down, as a Select does', () => {
    render(<Controlled />);
    fireEvent.keyDown(trigger(), { key: 'Enter' });
    expect(search()).toHaveFocus();
  });

  it('opens and stays open on a real Enter or Space press on the trigger', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    trigger().focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.keyboard(' ');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('clears the query when it closes', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(trigger());
    await user.type(search(), 'gam');
    await user.keyboard('{Escape}');
    await user.click(trigger());
    expect(search()).toHaveValue('');
    expect(optionNames()).toHaveLength(4);
  });

  it('ignores a click on a disabled option and does not re-fire for the chosen one', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(<Controlled initial="a" onValueChange={onValueChange} />);
    await user.click(trigger());
    await user.click(screen.getByRole('option', { name: 'Beta' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Alpha' }));
    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('never submits the form it sits in when Enter chooses', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Controlled />
      </form>,
    );
    await user.click(trigger());
    await user.keyboard('{Enter}');
    expect(trigger()).toHaveTextContent('Alpha');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('renders groups as labelled groups and drops a group the query empties', async () => {
    const user = userEvent.setup();
    render(
      <SearchableSelect
        aria-label="Letter"
        searchLabel="Search letters"
        groups={[
          { label: 'Vowels', options: [{ value: 'a', label: 'Alpha' }] },
          { label: 'Others', options: [{ value: 'g', label: 'Gamma' }] },
        ]}
        value=""
        onValueChange={vi.fn()}
      />,
    );
    await user.click(trigger());
    expect(screen.getByRole('group', { name: 'Vowels' })).toBeInTheDocument();
    await user.type(search(), 'gam');
    expect(screen.queryByRole('group', { name: 'Vowels' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Others' })).toHaveTextContent('Gamma');
  });

  it("takes an enclosing Field's label, description and error", () => {
    render(
      <Field label="Letter" description="Pick one." error="Required.">
        <SearchableSelect
          searchLabel="Search letters"
          options={OPTIONS}
          value=""
          onValueChange={vi.fn()}
        />
      </Field>,
    );
    const control = screen.getByRole('combobox', { name: 'Letter' });
    expect(control).toHaveAccessibleDescription(/Pick one\./);
    expect(control).toHaveAttribute('aria-invalid', 'true');
  });

  it('does not open while disabled', async () => {
    const user = userEvent.setup();
    render(
      <SearchableSelect
        aria-label="Letter"
        searchLabel="Search letters"
        options={OPTIONS}
        value=""
        disabled
        onValueChange={vi.fn()}
      />,
    );
    await user.click(trigger());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('throws when given both options and groups', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const props = {
      'aria-label': 'Letter',
      searchLabel: 'Search letters',
      options: OPTIONS,
      groups: [],
      value: '',
      onValueChange: vi.fn(),
    } as unknown as Parameters<typeof SearchableSelect>[0];
    expect(() => render(<SearchableSelect {...props} />)).toThrow(/exactly one of/);
    vi.restoreAllMocks();
  });

  it('moves through and filters a 1,000-option list, rendering only the rows the move touched', () => {
    // Every row render reads its option's label, so the reads count the rows rendered.
    let labelReads = 0;
    const many = Array.from({ length: 1000 }, (_, index) => {
      const label = `Tool ${String(index)} (tool_${String(index)})`;
      return {
        value: `tool_${String(index)}`,
        get label() {
          labelReads += 1;
          return label;
        },
      };
    });
    render(
      <SearchableSelect
        aria-label="Letter"
        searchLabel="Search letters"
        options={many}
        value=""
        onValueChange={vi.fn()}
      />,
    );
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    expect(screen.getAllByRole('option')).toHaveLength(1000);

    labelReads = 0;
    act(() => {
      fireEvent.keyDown(search(), { key: 'ArrowDown' });
    });
    expect(screen.getByRole('option', { name: 'Tool 0 (tool_0)' })).not.toHaveAttribute(
      'data-highlighted',
    );
    expect(screen.getByRole('option', { name: 'Tool 1 (tool_1)' })).toHaveAttribute(
      'data-highlighted',
    );
    // Only the rows whose highlight changed render again; the other 998 are skipped.
    expect(labelReads).toBeLessThanOrEqual(4);

    act(() => {
      fireEvent.change(search(), { target: { value: 'tool_999' } });
    });
    expect(optionNames()).toEqual(['Tool 999 (tool_999)']);
  });

  it('opens with the chosen option highlighted and scrolled into view', () => {
    const many = Array.from({ length: 1000 }, (_, index) => ({
      value: `tool_${String(index)}`,
      label: `Tool ${String(index)}`,
    }));
    const scrolled: Element[] = [];
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(function record(this: Element) {
        scrolled.push(this);
      });
    render(
      <SearchableSelect
        aria-label="Letter"
        searchLabel="Search letters"
        options={many}
        value="tool_300"
        onValueChange={vi.fn()}
      />,
    );
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });

    const chosen = screen.getByRole('option', { name: 'Tool 300' });
    expect(search()).toHaveAttribute('aria-activedescendant', chosen.id);
    expect(scrolled).toContain(chosen);
    scrollIntoView.mockRestore();
  });

  it('shows a held value the options do not carry, not the placeholder', () => {
    render(
      <SearchableSelect
        aria-label="Letter"
        searchLabel="Search letters"
        options={OPTIONS}
        value="gone"
        onValueChange={vi.fn()}
      />,
    );
    expect(trigger()).toHaveTextContent('gone');
    expect(trigger()).not.toHaveTextContent('Select…');
  });

  it('chooses from what was typed even before the deferred list catches up', () => {
    const onValueChange = vi.fn();
    render(<Controlled onValueChange={onValueChange} />);
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    // One act scope: the urgent render carries the typed query, while the deferred
    // render of the list is still queued when Enter goes down.
    act(() => {
      fireEvent.change(search(), { target: { value: 'gam' } });
      fireEvent.keyDown(search(), { key: 'Enter' });
    });
    expect(onValueChange).toHaveBeenCalledWith('c');
  });

  it('keeps the highlight on the same option when the list gains one ahead of it', () => {
    function Growing({ options }: { readonly options: typeof OPTIONS }) {
      return (
        <SearchableSelect
          aria-label="Letter"
          searchLabel="Search letters"
          options={options}
          value=""
          onValueChange={vi.fn()}
        />
      );
    }
    const later = OPTIONS.filter((option) => option.value !== 'a');
    const { rerender } = render(<Growing options={later} />);
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    fireEvent.keyDown(search(), { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Alphabet' })).toHaveAttribute('data-highlighted');

    rerender(<Growing options={OPTIONS} />);
    expect(screen.getByRole('option', { name: 'Alphabet' })).toHaveAttribute('data-highlighted');
  });

  it('names its popup and its listbox after the field, apart from the search box', async () => {
    const user = userEvent.setup();
    render(
      <Field label="Letter">
        <SearchableSelect
          searchLabel="Search letters"
          options={OPTIONS}
          value=""
          onValueChange={vi.fn()}
        />
      </Field>,
    );
    await user.click(screen.getByRole('combobox', { name: 'Letter' }));
    expect(screen.getByRole('dialog', { name: 'Letter' })).toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'Letter' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Search letters' })).toHaveFocus();
  });

  it('names its popup and its listbox with its own aria-label outside a Field', async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    await user.click(trigger());
    expect(screen.getByRole('dialog', { name: 'Letter' })).toBeInTheDocument();
    expect(screen.getByRole('listbox', { name: 'Letter' })).toBeInTheDocument();
  });

  it('leaves the popup on Tab and moves focus to the control after the trigger', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before</button>
        <Controlled />
        <button type="button">After</button>
      </>,
    );
    await user.click(trigger());
    expect(search()).toHaveFocus();

    await user.tab();

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  it('leaves the popup on Shift+Tab and moves focus to the control before the trigger', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Before</button>
        <Controlled />
        <button type="button">After</button>
      </>,
    );
    await user.click(trigger());

    await user.tab({ shift: true });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Before' })).toHaveFocus();
  });

  it('leaves the value as it was when Tab leaves the popup', async () => {
    const onValueChange = vi.fn();
    const user = userEvent.setup();
    render(<Controlled initial="a" onValueChange={onValueChange} />);
    await user.click(trigger());
    await user.keyboard('{ArrowDown}');

    await user.tab();

    expect(onValueChange).not.toHaveBeenCalled();
    expect(trigger()).toHaveTextContent('Alpha');
  });

  it('moves the highlight to the first and last choosable option on Home and End', async () => {
    const user = userEvent.setup();
    render(<Controlled initial="c" />);
    await user.click(trigger());

    await user.keyboard('{End}');
    expect(screen.getByRole('option', { name: 'Alphabet' })).toHaveAttribute('data-highlighted');

    await user.keyboard('{Home}');
    expect(screen.getByRole('option', { name: 'Alpha' })).toHaveAttribute('data-highlighted');
  });

  describe('a new query over a long list scrolled far down', () => {
    /**
     * Open a 200-option list holding `value`, with the listbox scrolled far down and
     * every `scrollIntoView` recorded from here on.
     */
    function openScrolledList(value: string) {
      const many = Array.from({ length: 200 }, (_, index) => ({
        value: `tool_${String(index)}`,
        label: `Tool ${String(index)}`,
      }));
      const scrolled: Element[] = [];
      const scrollIntoView = vi
        .spyOn(Element.prototype, 'scrollIntoView')
        .mockImplementation(function record(this: Element) {
          scrolled.push(this);
        });
      render(
        <SearchableSelect
          aria-label="Letter"
          searchLabel="Search letters"
          options={many}
          value={value}
          onValueChange={vi.fn()}
        />,
      );
      fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
      const list = screen.getByRole('listbox');
      let scrollTop = 4000;
      Object.defineProperty(list, 'scrollTop', {
        configurable: true,
        get: () => scrollTop,
        set: (next: number) => {
          scrollTop = next;
        },
      });
      return {
        scrolled,
        scrollTop: () => scrollTop,
        type: (query: string) => {
          scrolled.length = 0;
          act(() => {
            fireEvent.change(search(), { target: { value: query } });
          });
        },
        restore: () => {
          scrollIntoView.mockRestore();
        },
      };
    }

    function expectFirstMatchShown(
      list: ReturnType<typeof openScrolledList>,
      firstLabel: string,
    ): void {
      const first = screen.getByRole('option', { name: firstLabel });
      expect(search()).toHaveAttribute('aria-activedescendant', first.id);
      expect(first).toHaveAttribute('data-highlighted');
      expect(list.scrollTop()).toBe(0);
      expect(list.scrolled).toContain(first);
    }

    it('highlights the first match from the top when the query filters the highlight away', () => {
      const list = openScrolledList('tool_180');
      list.type('tool 2');
      expectFirstMatchShown(list, 'Tool 2');
      list.restore();
    });

    it('highlights the first match from the top even when the old highlight still matches', () => {
      const list = openScrolledList('tool_180');
      list.type('1');
      expectFirstMatchShown(list, 'Tool 1');
      expect(screen.getByRole('option', { name: 'Tool 180' })).not.toHaveAttribute(
        'data-highlighted',
      );
      list.restore();
    });

    it('highlights the first match after the keyboard moved the highlight far down', () => {
      const list = openScrolledList('');
      act(() => {
        fireEvent.keyDown(search(), { key: 'End' });
      });
      expect(screen.getByRole('option', { name: 'Tool 199' })).toHaveAttribute('data-highlighted');
      list.type('1');
      expectFirstMatchShown(list, 'Tool 1');
      list.restore();
    });

    it('highlights the first match after the pointer moved the highlight far down', () => {
      const list = openScrolledList('');
      fireEvent.pointerMove(screen.getByRole('option', { name: 'Tool 180' }));
      expect(screen.getByRole('option', { name: 'Tool 180' })).toHaveAttribute('data-highlighted');
      list.type('1');
      expectFirstMatchShown(list, 'Tool 1');
      list.restore();
    });
  });

  it('draws an option description under its label and finds the option by it', () => {
    render(
      <SearchableSelect
        aria-label="Letter"
        searchLabel="Search letters"
        options={[
          { value: 'a', label: 'Alpha', description: 'Sends a greeting' },
          { value: 'c', label: 'Gamma' },
        ]}
        value=""
        onValueChange={vi.fn()}
      />,
    );
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /Alpha/ })).toHaveAccessibleDescription(
      'Sends a greeting',
    );

    act(() => {
      fireEvent.change(search(), { target: { value: 'GREETING' } });
    });

    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('option', { name: /Alpha/ })).toBeInTheDocument();
  });

  it('names a described option by its label alone and reads the description once, as its description', () => {
    render(
      <SearchableSelect
        aria-label="Letter"
        searchLabel="Search letters"
        options={[
          { value: 'a', label: 'Alpha', description: 'Sends a greeting' },
          { value: 'c', label: 'Gamma' },
        ]}
        value=""
        onValueChange={vi.fn()}
      />,
    );
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });

    const described = screen.getByRole('option', { name: /^Alpha$/ });
    expect(described).toHaveAccessibleName('Alpha');
    expect(described).toHaveAccessibleDescription('Sends a greeting');
    expect(screen.getByRole('option', { name: /^Gamma$/ })).toHaveAccessibleName('Gamma');
  });
});
