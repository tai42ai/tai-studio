/**
 * The create-preset form — the dry-run validate verdict, the base-picker labelling
 * (agent suffix, overlay display names), and the enrichment/state-binding read
 * resilience (a failed enrichment read is stated per-line without walling the form).
 */
import { ApiError } from '@tai42/api-client';
import { StaticToolDisplayNamesProvider } from '@tai42/studio-sdk/testing';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CreatePresetForm } from './CreatePresetForm';
import {
  baseClient,
  fillCreatable,
  fillNameAndBase,
  openBasePicker,
  pickBase,
  record,
  renderWithProviders,
} from './test-utils';

describe('CreatePresetForm — validate + base labelling + enrichment', () => {
  it('validate — a store-off 501 is the muted OFF note, never an error state', async () => {
    const user = userEvent.setup({ delay: null });
    const validatePreset = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          'versioning is not configured: set TAI_DATABASE_DEFAULT_PG_PASSWORD',
          501,
          'versioning-not-configured',
        ),
      );
    const client = baseClient({ validatePreset });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await fillNameAndBase(user);
    await user.click(screen.getByRole('button', { name: 'Validate' }));

    const note = await screen.findByTestId('feature-disabled');
    expect(note).toHaveTextContent(
      'versioning is not configured: set TAI_DATABASE_DEFAULT_PG_PASSWORD',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Validate' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Create preset' })).toBeDisabled();
  });

  it('validate — clean verdict: sends the full create draft and shows a success badge', async () => {
    const user = userEvent.setup({ delay: null });
    const validatePreset = vi.fn().mockResolvedValue({ valid: true, error: null });
    const client = baseClient({ validatePreset });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await fillNameAndBase(user);
    await user.click(screen.getByRole('button', { name: 'Validate' }));

    // The draft is sent exactly as submit would send it (full field set, no combos,
    // no tags — tags are the overlay's, never the create/validate body).
    expect(validatePreset).toHaveBeenCalledWith({
      name: 'paris_weather',
      base_tool: 'weather',
      description: '',
      fixed_kwargs: {},
    });
    expect(await screen.findByText('Draft binds cleanly')).toBeInTheDocument();
  });

  it('validate — invalid verdict: a rejected draft is a verdict, never an error state', async () => {
    // The server ran the pre-store check and answered "no". That is a deliberate
    // answer, so it reads as the counterpart of the clean verdict — a badge plus
    // the reason verbatim — not as the crossed-circle surface that says the system
    // broke. It still ANNOUNCES: the verdict lands after the press.
    const user = userEvent.setup({ delay: null });
    const validatePreset = vi
      .fn()
      .mockResolvedValue({ valid: false, error: "base tool 'weather' is not a registered tool" });
    const client = baseClient({ validatePreset });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await fillNameAndBase(user);
    await user.click(screen.getByRole('button', { name: 'Validate' }));

    const verdict = await screen.findByText("base tool 'weather' is not a registered tool");
    expect(verdict.closest('[role="status"]')).not.toBeNull();
    expect(screen.getByText('Draft is invalid')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('Something went wrong')).toBeNull();
  });

  it('validate — a stale verdict clears on further edits', async () => {
    const user = userEvent.setup({ delay: null });
    const validatePreset = vi.fn().mockResolvedValue({ valid: true, error: null });
    const client = baseClient({ validatePreset });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await fillNameAndBase(user);
    await user.click(screen.getByRole('button', { name: 'Validate' }));
    expect(await screen.findByText('Draft binds cleanly')).toBeInTheDocument();

    // Any further edit invalidates the verdict (a stale verdict lies).
    await user.type(screen.getByPlaceholderText('paris_weather'), '_v2');
    expect(screen.queryByText('Draft binds cleanly')).toBeNull();
  });

  it('labels an agent run tool in the base picker with a " (agent)" suffix once a base is selected', async () => {
    const user = userEvent.setup({ delay: null });
    const client = baseClient({
      listTools: vi.fn().mockResolvedValue(['weather', 'writer_agent']),
      listAgents: vi
        .fn()
        .mockResolvedValue({ items: [{ name: 'writer', tool_name: 'writer_agent' }], total: 1 }),
    });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    // The agents read that supplies the " (agent)" suffix runs only for a selected
    // base: pick a base, then reopen the picker to read the labelled options.
    await pickBase(user, 'weather');
    await openBasePicker(user);
    expect(await screen.findByRole('option', { name: 'writer_agent (agent)' })).toBeInTheDocument();
    // A non-agent tool keeps its bare label.
    expect(screen.getByRole('option', { name: 'weather' })).toBeInTheDocument();
  });

  it('labels a base-picker option "Display (raw)" from the tool-meta overlay', async () => {
    const user = userEvent.setup({ delay: null });
    const client = baseClient({ listTools: vi.fn().mockResolvedValue(['weather']) });
    renderWithProviders(
      <StaticToolDisplayNamesProvider names={{ weather: 'Weather' }}>
        <CreatePresetForm onClose={vi.fn()} />
      </StaticToolDisplayNamesProvider>,
      { client },
    );

    await openBasePicker(user);
    expect(await screen.findByRole('option', { name: 'Weather (weather)' })).toBeInTheDocument();
  });

  it('renders a 400 base-is-a-preset message verbatim', async () => {
    const user = userEvent.setup({ delay: null });
    const createPreset = vi
      .fn()
      .mockRejectedValue(new Error("base tool 'weather' is itself a preset"));
    const client = baseClient({ createPreset });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await fillCreatable(user);
    await user.click(screen.getByRole('button', { name: 'Create preset' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "base tool 'weather' is itself a preset",
    );
  });

  it.each([
    [
      'listToolTags',
      { listToolTags: vi.fn().mockRejectedValue(new Error('tags down')) },
      'Tag grouping is unavailable: tags down',
    ],
    [
      'listAgents',
      { listAgents: vi.fn().mockRejectedValue(new Error('agents down')) },
      'Agent labelling is unavailable: agents down',
    ],
  ])(
    'says so when the %s enrichment read fails, without walling the base picker',
    async (_label, override, expected) => {
      // These two only ENRICH the picker (grouping, the " (agent)" suffix), so they
      // must not wall the form — but a silent degradation reads as the truth about
      // the deployment: an unlabelled agent base looks like a plain tool. The tag read
      // fires on the empty form and the agent read on a pick, so picking a base has
      // both fired regardless of which one this case fails.
      const user = userEvent.setup({ delay: null });
      renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
        client: baseClient(override),
      });

      await pickBase(user, 'weather');
      expect(await screen.findByRole('alert')).toHaveTextContent(expected);
      // The picker is still there and still usable.
      expect(await screen.findByRole('combobox')).toBeEnabled();
    },
  );

  it('says so when the base-tool SCHEMA read fails, without walling the kwargs field', async () => {
    // The schema supplies only the "Base tool inputs: …" hint. On a failure the
    // code must keep a sentence in that slot, so a hintless kwargs box never reads
    // as "this base declares no inputs".
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
      client: baseClient({ getToolSchema: vi.fn().mockRejectedValue(new Error('schema down')) }),
    });

    await fillNameAndBase(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Base tool input names are unavailable: schema down',
    );
    // The kwargs editor stays usable — its "Add kwarg" affordance is live, not walled.
    expect(screen.getByRole('button', { name: 'Add kwarg' })).toBeEnabled();
  });

  it('gives each failed enrichment read its OWN line, never one run-together sentence', async () => {
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
      client: baseClient({
        listToolTags: vi.fn().mockRejectedValue(new Error('tags down')),
        listAgents: vi.fn().mockRejectedValue(new Error('agents down')),
      }),
    });

    // The tag read fires on the empty form and the agent read on a pick: picking a
    // base has fired both, so both failure lines are present.
    await pickBase(user, 'weather');
    const alert = await screen.findByRole('alert');
    const lines = [...alert.querySelectorAll('p')];
    expect(lines.map((line) => line.textContent)).toEqual([
      'Tag grouping is unavailable: tags down',
      'Agent labelling is unavailable: agents down',
    ]);
    // Each line is the published wrapping carrier, so a 320 px viewport never
    // widens on a long server message — and each carries the ERROR mark, so the
    // hue is never the only thing saying the read failed.
    for (const line of lines) {
      expect(line).toHaveClass('tai-field-error');
      expect(line.querySelector('svg')).toHaveClass('tai-icon');
    }
  });

  it('issues the tag + overlay reads on the empty form but NOT the agent/base-schema reads, so the empty form never shows the agent-labelling note', async () => {
    const listToolTags = vi.fn().mockResolvedValue([]);
    const listToolMeta = vi.fn().mockResolvedValue({ folders: [], meta: [] });
    const listAgents = vi.fn().mockRejectedValue(new Error('agents down'));
    const getToolSchema = vi.fn().mockRejectedValue(new Error('schema down'));
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
      client: baseClient({ listToolTags, listToolMeta, listAgents, getToolSchema }),
    });

    // The tag + overlay reads run on the empty form — they group, label and hide-filter
    // the picker before any pick. The agent-labelling and base-schema reads wait for a
    // pick, so neither fires here even though both would reject: the empty form carries
    // no enrichment error and never the "Agent labelling is unavailable" note.
    await waitFor(() => {
      expect(screen.getByRole('combobox')).toBeEnabled();
    });
    await waitFor(() => {
      expect(listToolTags).toHaveBeenCalled();
    });
    expect(listToolMeta).toHaveBeenCalled();
    expect(listAgents).not.toHaveBeenCalled();
    expect(getToolSchema).not.toHaveBeenCalled();
    expect(screen.queryByText(/Agent labelling is unavailable/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('CreatePresetForm — state binding source resolution', () => {
  it("resolves the base tool's schema into the binding field pickers", async () => {
    const user = userEvent.setup({ delay: null });
    const getToolSchema = vi.fn().mockResolvedValue({
      input: { type: 'object', properties: { memo: { type: 'string' } } },
      output: { type: 'object', properties: { total: { type: 'number' } } },
      description: null,
    });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
      client: baseClient({
        getToolSchema,
        listStates: vi.fn().mockResolvedValue([]),
        listStateTemplates: vi.fn().mockResolvedValue([]),
      }),
    });
    await fillNameAndBase(user);
    await waitFor(() => {
      expect(getToolSchema.mock.calls.some((call) => call[0] === 'weather')).toBe(true);
    });
  });
});

describe('CreatePresetForm — binding serialization', () => {
  it('serializes a SET binding into the create body', async () => {
    const user = userEvent.setup({ delay: null });
    const createPreset = vi.fn().mockResolvedValue(record);
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
      client: baseClient({
        createPreset,
        listStates: vi.fn().mockResolvedValue([{ name: 'counters' }]),
        listStateTemplates: vi.fn().mockResolvedValue([]),
      }),
    });
    await fillCreatable(user);

    await user.click(screen.getByRole('button', { name: 'Bind state (optional)' }));
    await user.click(screen.getByRole('button', { name: 'Attach a state' }));
    await user.click(screen.getByRole('combobox', { name: 'State' }));
    await user.click(await screen.findByRole('option', { name: 'counters' }));

    await user.click(screen.getByRole('button', { name: 'Create preset' }));
    await waitFor(() => {
      expect(createPreset).toHaveBeenCalled();
    });
    const body = createPreset.mock.calls[0]?.[0] as { state_binding?: unknown };
    expect(body.state_binding).toEqual({
      states: [
        {
          state: 'counters',
          templates: [],
          subject_expr: { content: '' },
          scope_expr: null,
          input_injections: [],
          updates: [],
        },
      ],
    });
  });
});

describe('CreatePresetForm — binding validation', () => {
  it('validate — sends the current binding editor value in the draft body', async () => {
    const user = userEvent.setup({ delay: null });
    const validatePreset = vi.fn().mockResolvedValue({ valid: true, error: null });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
      client: baseClient({
        validatePreset,
        listStates: vi.fn().mockResolvedValue([{ name: 'counters' }]),
        listStateTemplates: vi.fn().mockResolvedValue([]),
      }),
    });
    await fillNameAndBase(user);

    await user.click(screen.getByRole('button', { name: 'Bind state (optional)' }));
    await user.click(screen.getByRole('button', { name: 'Attach a state' }));
    await user.click(screen.getByRole('combobox', { name: 'State' }));
    await user.click(await screen.findByRole('option', { name: 'counters' }));

    await user.click(screen.getByRole('button', { name: 'Validate' }));
    await waitFor(() => {
      expect(validatePreset).toHaveBeenCalled();
    });
    const body = validatePreset.mock.calls[0]?.[0] as { state_binding?: unknown };
    expect(body.state_binding).toEqual({
      states: [
        {
          state: 'counters',
          templates: [],
          subject_expr: { content: '' },
          scope_expr: null,
          input_injections: [],
          updates: [],
        },
      ],
    });
  });

  it('validate — renders a state_binding verdict issue verbatim', async () => {
    const user = userEvent.setup({ delay: null });
    const validatePreset = vi.fn().mockResolvedValue({
      valid: false,
      error: 'invalid state_binding: state "counters" is not declared',
    });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
      client: baseClient({ validatePreset }),
    });

    await fillNameAndBase(user);
    await user.click(screen.getByRole('button', { name: 'Validate' }));

    const verdict = await screen.findByText(
      'invalid state_binding: state "counters" is not declared',
    );
    expect(verdict.closest('[role="status"]')).not.toBeNull();
    expect(screen.getByText('Draft is invalid')).toBeInTheDocument();
  });
});
