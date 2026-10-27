import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, type Mock, vi } from 'vitest';

import { type ToolListQuery, ToolPicker } from './tool-picker';

const TOOLS = ['alpha', 'beta', 'gamma'];
const EMPTY = 'No tools are registered on this deployment.';

function loaded(data: readonly string[]): ToolListQuery {
  return { data, isPending: false, isError: false, isSuccess: true, error: null, refetch: vi.fn() };
}

function failed(error: unknown): ToolListQuery & { refetch: Mock<() => void> } {
  return {
    data: undefined,
    isPending: false,
    isError: true,
    isSuccess: false,
    error,
    refetch: vi.fn<() => void>(),
  };
}

const PENDING: ToolListQuery = {
  data: undefined,
  isPending: true,
  isError: false,
  isSuccess: false,
  error: null,
  refetch: () => undefined,
};

/**
 * The tag filter's accessible name. It comes from the `Field` that wraps it —
 * the control carries no `aria-label` of its own, because one would override
 * that visible label and leave the on-screen text out of the computed name.
 */
const FILTER_NAME = 'Filter by tag';

/** The tool listbox: the combobox that is not the tag filter. */
function toolCombobox(): HTMLElement {
  const filter = screen.getByRole('combobox', { name: FILTER_NAME });
  const found = screen.getAllByRole('combobox').find((element) => element !== filter);
  if (found === undefined) throw new Error('tool combobox not found');
  return found;
}

describe('ToolPicker', () => {
  it('renders a combobox showing the placeholder when nothing is selected', () => {
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        placeholder="Pick a tool"
      />,
    );
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveTextContent('Pick a tool');
  });

  it('renders one option per tool name', async () => {
    const user = userEvent.setup();
    render(<ToolPicker query={loaded(TOOLS)} emptyNote={EMPTY} value={null} onChange={vi.fn()} />);

    await user.click(screen.getByRole('combobox'));
    for (const name of TOOLS) {
      expect(await screen.findByRole('option', { name })).toBeInTheDocument();
    }
  });

  it('fires onChange with the chosen tool name', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ToolPicker query={loaded(TOOLS)} emptyNote={EMPTY} value={null} onChange={onChange} />);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'beta' }));

    expect(onChange).toHaveBeenCalledWith('beta');
  });

  it('does not open when disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={onChange}
        disabled
      />,
    );

    await user.click(screen.getByRole('combobox'));

    expect(screen.queryByRole('option')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('renders a tool name containing <script> as escaped TEXT, never an element (XSS pin)', async () => {
    const user = userEvent.setup();
    const payload = '<script>alert(1)</script>';
    const { container } = render(
      <ToolPicker query={loaded([payload])} emptyNote={EMPTY} value={payload} onChange={vi.fn()} />,
    );

    await user.click(screen.getByRole('combobox'));

    expect(screen.getAllByText(payload).length).toBeGreaterThan(0);
    expect(container.querySelector('script')).toBeNull();
  });

  it('reads "Loading tools…" while pending over a host placeholder, which shows once loaded', () => {
    const { rerender } = render(
      <ToolPicker
        query={PENDING}
        value={null}
        onChange={vi.fn()}
        emptyNote={EMPTY}
        placeholder="Pick a tool"
      />,
    );
    expect(screen.getByRole('combobox')).toHaveTextContent('Loading tools…');
    expect(screen.getByRole('combobox')).toBeDisabled();
    rerender(
      <ToolPicker
        query={loaded(TOOLS)}
        value={null}
        onChange={vi.fn()}
        emptyNote={EMPTY}
        placeholder="Pick a tool"
      />,
    );
    expect(screen.getByRole('combobox')).toHaveTextContent('Pick a tool');
    expect(screen.getByRole('combobox')).toBeEnabled();
  });

  it('draws the empty note and action in place of the control for an empty list', () => {
    render(
      <ToolPicker
        query={loaded([])}
        value={null}
        onChange={vi.fn()}
        emptyNote={EMPTY}
        emptyAction={<a href="/marketplace">Browse plugins</a>}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(EMPTY);
    expect(screen.getByRole('link', { name: 'Browse plugins' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('draws the empty note when excludeNames removes every name', () => {
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        value={null}
        onChange={vi.fn()}
        emptyNote={EMPTY}
        excludeNames={TOOLS}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(EMPTY);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('draws a failed read as an ErrorState with Retry inside the group Field, the error text hidden', async () => {
    const user = userEvent.setup();
    const query = failed(new Error('boom'));
    render(
      <ToolPicker
        query={query}
        value={null}
        onChange={vi.fn()}
        emptyNote={EMPTY}
        label="Tool"
        error="A tool is required."
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
    expect(screen.queryByText('A tool is required.')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByRole('group', { name: 'Tool' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(query.refetch).toHaveBeenCalledTimes(1);
  });

  it('draws errorNote as a status line with no Retry, no ErrorState and no control', () => {
    render(
      <ToolPicker
        query={failed(new Error('boom'))}
        value={null}
        onChange={vi.fn()}
        emptyNote={EMPTY}
        label="Tool"
        errorNote="The tool list could not be read; the error is shown above."
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'The tool list could not be read; the error is shown above.',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('takes a typed tool name on a 403, labelled by its Field, with the reason and the host error shown', async () => {
    const onChange = vi.fn();
    render(
      <ToolPicker
        query={failed({ status: 403 })}
        value={null}
        onChange={onChange}
        emptyNote={EMPTY}
        label="Tool"
        error="A tool is required."
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Tool' });
    expect(input).toHaveAccessibleDescription(/cannot list tools, so type the tool's exact name/);
    expect(screen.getByText('A tool is required.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
    await userEvent.type(input, '  echo  ');
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(onChange).toHaveBeenCalledExactlyOnceWith('echo');
  });

  it('draws the host errorNote on a 403, with no typed entry, where the host draws the failure', () => {
    render(
      <ToolPicker
        query={failed({ status: 403 })}
        value={null}
        onChange={vi.fn()}
        emptyNote={EMPTY}
        errorNote="This server's tools could not be read."
        aria-label="Tool name"
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent("This server's tools could not be read.");
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('commits a typed name on Enter without submitting the enclosing form', async () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn((event: { preventDefault: () => void }) => {
      event.preventDefault();
    });
    render(
      <form onSubmit={onSubmit}>
        <ToolPicker
          query={failed({ status: 403 })}
          value={null}
          onChange={onChange}
          emptyNote={EMPTY}
          aria-label="Tool name"
        />
        <button type="submit">Save</button>
      </form>,
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Tool name' }), 'echo{Enter}');
    expect(onChange).toHaveBeenCalledExactlyOnceWith('echo');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the stored name in the typed entry and emits nothing for a blank or unchanged draft', async () => {
    const onChange = vi.fn();
    render(
      <ToolPicker
        query={failed({ status: 403 })}
        value="kept"
        onChange={onChange}
        emptyNote={EMPTY}
        unlistedLabel="not registered"
        aria-label="Tool name"
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Tool name' });
    expect(input).toHaveValue('kept');
    expect(screen.queryByText(/not registered/)).toBeNull();
    await userEvent.clear(input);
    await userEvent.tab();
    expect(input).toHaveValue('kept');
    await userEvent.click(input);
    await userEvent.tab();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('hands label, description and error to its Field while the select renders', () => {
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        value={null}
        onChange={vi.fn()}
        emptyNote={EMPTY}
        label="Tool"
        description="The tool the route runs."
        error="A tool is required."
      />,
    );
    const trigger = screen.getByRole('combobox', { name: 'Tool' });
    expect(trigger).toHaveAccessibleDescription(/The tool the route runs\..*A tool is required\./);
  });

  it('renders every state bare without a label', () => {
    const { rerender } = render(
      <ToolPicker
        query={loaded([])}
        value={null}
        onChange={vi.fn()}
        emptyNote={EMPTY}
        aria-label="Add a tool"
      />,
    );
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(EMPTY);
    rerender(
      <ToolPicker
        query={failed(new Error('boom'))}
        value={null}
        onChange={vi.fn()}
        emptyNote={EMPTY}
        aria-label="Add a tool"
      />,
    );
    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('flags a stored value the loaded list does not carry, only once loaded', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ToolPicker
        query={PENDING}
        value="gone"
        onChange={vi.fn()}
        emptyNote={EMPTY}
        unlistedLabel="not registered"
      />,
    );
    expect(screen.queryByText(/not registered/)).toBeNull();
    rerender(
      <ToolPicker
        query={loaded(TOOLS)}
        value="gone"
        onChange={vi.fn()}
        emptyNote={EMPTY}
        unlistedLabel="not registered"
      />,
    );
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAccessibleDescription(
      'not registered gone is not registered. Pick another, or saving is refused.',
    );
    expect(trigger).toBeEnabled();
    await user.click(trigger);
    const options = await screen.findAllByRole('option');
    expect(options[0]).toHaveAccessibleName('gone (not registered)');
  });

  it('draws the flagged sole option beside the empty note over an empty list', () => {
    render(
      <ToolPicker
        query={loaded([])}
        value="gone"
        onChange={vi.fn()}
        emptyNote={EMPTY}
        unlistedLabel="not registered"
      />,
    );
    expect(screen.getByRole('combobox')).toHaveTextContent('gone (not registered)');
    expect(screen.getByRole('status')).toHaveTextContent(EMPTY);
  });

  it('excludes names in excludeNames from the options', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        excludeNames={['beta']}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'alpha' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'gamma' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'beta' })).toBeNull();
  });

  it('with tagsByTool, shows a tag filter that narrows the options to the chosen tag', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        tagsByTool={{ alpha: ['geo'], beta: ['geo'], gamma: ['scratch'] }}
      />,
    );

    // Two comboboxes: the tag filter and the tool picker.
    const filter = screen.getByRole('combobox', { name: FILTER_NAME });
    await user.click(filter);
    await user.click(await screen.findByRole('option', { name: 'scratch' }));

    // Now open the tool picker — only the 'scratch'-tagged tool remains.
    const tool = toolCombobox();
    await user.click(tool);

    expect(await screen.findByRole('option', { name: 'gamma' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'alpha' })).toBeNull();
    expect(screen.queryByRole('option', { name: 'beta' })).toBeNull();
  });

  it('suffixes agent run tool option labels with " (agent)" (flat rendering)', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        agentToolNames={new Set(['beta'])}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    // The agent tool's label carries the suffix; a non-agent tool does not.
    expect(await screen.findByRole('option', { name: 'beta (agent)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'alpha' })).toBeInTheDocument();
  });

  it('suffixes agent run tool option labels with " (agent)" (grouped rendering)', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        tagsByTool={{ alpha: ['geo'], beta: ['geo'], gamma: ['scratch'] }}
        agentToolNames={new Set(['beta'])}
      />,
    );

    const tool = toolCombobox();
    await user.click(tool);

    expect(await screen.findByRole('option', { name: 'beta (agent)' })).toBeInTheDocument();
  });

  it('with tagsByTool, groups options under their tag labels', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        tagsByTool={{ alpha: ['geo'], beta: ['geo'], gamma: ['scratch'] }}
      />,
    );

    const tool = toolCombobox();
    await user.click(tool);

    // Each tag is a role="group" section named by its label.
    expect(await screen.findByText('geo')).toBeInTheDocument();
    expect(screen.getByText('scratch')).toBeInTheDocument();
  });

  it('labels a mapped option "Display Name (raw)" (flat rendering)', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        displayNames={{ beta: 'Beta Tool' }}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    // The mapped tool shows its human name with the raw name in parentheses; an
    // unmapped tool shows the bare raw name.
    expect(await screen.findByRole('option', { name: 'Beta Tool (beta)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'alpha' })).toBeInTheDocument();
  });

  it('labels a mapped option "Display Name (raw)" (grouped rendering)', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        tagsByTool={{ alpha: ['geo'], beta: ['geo'], gamma: ['scratch'] }}
        displayNames={{ beta: 'Beta Tool' }}
      />,
    );

    const tool = toolCombobox();
    await user.click(tool);

    expect(await screen.findByRole('option', { name: 'Beta Tool (beta)' })).toBeInTheDocument();
  });

  it('searches the display name and the raw name, ignoring case', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        displayNames={{ beta: 'Beta Tool' }}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    const search = screen.getByRole('combobox', { name: 'Search tools' });
    const shown = (): string[] => screen.getAllByRole('option').map((option) => option.textContent);

    await user.type(search, 'TOOL');
    expect(shown()).toEqual(['Beta Tool (beta)']);
    await user.clear(search);
    await user.type(search, 'gam');
    expect(shown()).toEqual(['gamma']);
  });

  it('searches within the tag groups, dropping a group the search empties', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        tagsByTool={{ alpha: ['one'], beta: ['two'] }}
      />,
    );
    await user.click(toolCombobox());
    await user.type(screen.getByRole('combobox', { name: 'Search tools' }), 'alp');
    expect(screen.getByRole('group', { name: 'one' })).toHaveTextContent('alpha');
    expect(screen.queryByRole('group', { name: 'two' })).not.toBeInTheDocument();
  });

  it('falls back to the bare raw name for an unmapped tool', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        displayNames={{ beta: 'Beta Tool' }}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'gamma' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /gamma \(/ })).toBeNull();
  });

  it('renders the bare raw name when the mapping equals the raw name', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        displayNames={{ beta: 'beta' }}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'beta' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'beta (beta)' })).toBeNull();
  });

  it('renders the bare raw name when the mapping is an empty string', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        displayNames={{ beta: '' }}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    // An empty display name is not a label: the option reads the bare raw name, never
    // the " (beta)" a naive `${display} (raw)` would emit.
    expect(await screen.findByRole('option', { name: 'beta' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: ' (beta)' })).toBeNull();
  });

  it('composes the display name and the agent suffix as "Display (raw) (agent)"', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        displayNames={{ beta: 'Beta Tool' }}
        agentToolNames={new Set(['beta'])}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    expect(
      await screen.findByRole('option', { name: 'Beta Tool (beta) (agent)' }),
    ).toBeInTheDocument();
  });

  it('fires onChange with the raw name when a display-labeled option is chosen', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={onChange}
        displayNames={{ beta: 'Beta Tool' }}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'Beta Tool (beta)' }));

    expect(onChange).toHaveBeenCalledWith('beta');
  });

  it('renders a display name containing <script> as escaped TEXT, never an element (XSS pin)', async () => {
    const user = userEvent.setup();
    const payload = '<script>alert(1)</script>';
    const { container } = render(
      <ToolPicker
        query={loaded(['beta'])}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        displayNames={{ beta: payload }}
      />,
    );

    await user.click(screen.getByRole('combobox'));

    expect(screen.getAllByText(`${payload} (beta)`).length).toBeGreaterThan(0);
    expect(container.querySelector('script')).toBeNull();
  });

  it('lays the filter and the picker out on the design-system stack, not an inline style', () => {
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        tagsByTool={{ alpha: ['geo'] }}
      />,
    );

    const root = screen.getByTestId('tool-picker');
    expect(root).toHaveClass('tai-stack', 'tai-stack-2');
    expect(root.getAttribute('style')).toBeNull();
  });

  it('renders its options and keeps the filter accessible name', async () => {
    const user = userEvent.setup();
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        placeholder="Pick a tool"
        tagsByTool={{ alpha: ['geo'], beta: ['geo'], gamma: ['scratch'] }}
      />,
    );

    expect(screen.getByRole('combobox', { name: FILTER_NAME })).toBeInTheDocument();
    expect(screen.getByTestId('tool-picker')).toHaveClass('tai-stack');

    const tool = toolCombobox();
    expect(tool).toHaveTextContent('Pick a tool');

    await user.click(tool);
    expect(await screen.findByRole('option', { name: 'alpha' })).toBeInTheDocument();
  });

  it("names the tag filter from its Field's visible label, with no aria-label over it", () => {
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        tagsByTool={{ alpha: ['geo'], gamma: ['scratch'] }}
      />,
    );

    // WCAG 2.5.3: the visible text IS the accessible name here. An `aria-label`
    // on the trigger outranks the field's `<label for>`, so the on-screen
    // "Filter by tag" would not appear in the computed name at all.
    const filter = screen.getByRole('combobox', { name: FILTER_NAME });
    expect(filter).toHaveAccessibleName(FILTER_NAME);
    expect(filter).not.toHaveAttribute('aria-label');
    expect(screen.getByText(FILTER_NAME).tagName).toBe('LABEL');
  });

  it('names a bare picker from aria-label, and lets a label out-rank it', () => {
    const { unmount } = render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        aria-label="Base tool"
        placeholder="Pick a tool"
      />,
    );

    // No Field around it, so the caller's name is the only one there is.
    expect(screen.getByRole('combobox')).toHaveAccessibleName('Base tool');
    unmount();

    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        label="Base tool label"
        aria-label="Base tool"
        placeholder="Pick a tool"
      />,
    );

    // `label` renders a Field, and the field's visible label is the name.
    expect(screen.getByRole('combobox')).toHaveAccessibleName('Base tool label');
  });

  it('renders the SELECTED tool declared badges as read-only chips', () => {
    render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value="beta"
        onChange={vi.fn()}
        badgesByTool={{ beta: ['network', 'audited'] }}
      />,
    );
    const badges = screen.getByTestId('tool-picker-badges');
    expect(badges).toHaveTextContent('network');
    expect(badges).toHaveTextContent('audited');
  });

  it('shows no badge chips when nothing is selected or the tool declares none', () => {
    const { rerender } = render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value={null}
        onChange={vi.fn()}
        badgesByTool={{ beta: ['network'] }}
      />,
    );
    expect(screen.queryByTestId('tool-picker-badges')).toBeNull();

    rerender(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value="alpha"
        onChange={vi.fn()}
        badgesByTool={{ beta: ['network'] }}
      />,
    );
    expect(screen.queryByTestId('tool-picker-badges')).toBeNull();
  });

  it('renders a badge containing <script> as escaped TEXT, never an element (XSS pin)', () => {
    const payload = '<script>alert(1)</script>';
    const { container } = render(
      <ToolPicker
        query={loaded(TOOLS)}
        emptyNote={EMPTY}
        value="beta"
        onChange={vi.fn()}
        badgesByTool={{ beta: [payload] }}
      />,
    );
    expect(screen.getByTestId('tool-picker-badges')).toHaveTextContent(payload);
    expect(container.querySelector('script')).toBeNull();
  });
});
