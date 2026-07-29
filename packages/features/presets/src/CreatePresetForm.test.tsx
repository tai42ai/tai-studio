/**
 * Create-form tests: the assembled POST body (extensions OMITTED when no combos,
 * tag chips → array), navigation to the new preset on success, and verbatim
 * rendering of the server's ordered 409/400 pre-check messages.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { toolsListKey } from '@tai42/studio-sdk';

import { CreatePresetForm } from './CreatePresetForm';
import { presetsListKey } from './keys';
import { renderWithProviders, type StubApiClient } from './test-utils';

const record = {
  name: 'paris_weather',
  base_tool: 'weather',
  description: '',
  active_version: 1,
  tags: ['geo'],
  extensions: [],
  output_schema: null,
  conflicted: false,
  conflicted_reason: null,
};

function baseClient(overrides: StubApiClient = {}): StubApiClient {
  return {
    listTools: vi.fn().mockResolvedValue(['weather']),
    listPresets: vi.fn().mockResolvedValue([]),
    listToolTags: vi.fn().mockResolvedValue([]),
    listExtensions: vi.fn().mockResolvedValue([]),
    listAgents: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getToolSchema: vi.fn().mockResolvedValue({
      input: { type: 'object', properties: {}, required: [] },
      output: null,
      description: null,
    }),
    ...overrides,
  };
}

async function fillNameAndBase(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByPlaceholderText('paris_weather'), 'paris_weather');
  await user.click(await screen.findByRole('combobox'));
  await user.click(await screen.findByRole('option', { name: 'weather' }));
}

describe('CreatePresetForm', () => {
  it('assembles the body with tags as an array and OMITS extensions when empty', async () => {
    const user = userEvent.setup();
    const createPreset = vi.fn().mockResolvedValue(record);
    const client = baseClient({ createPreset });
    const { navigate, queryClient } = renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
      client,
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await fillNameAndBase(user);
    await user.type(screen.getByLabelText('Tags'), 'geo');
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(screen.getByRole('button', { name: 'Create preset' }));

    expect(createPreset).toHaveBeenCalledTimes(1);
    // An exact-object match: `extensions` is OMITTED when there are no combos (an
    // extra key would fail this equality), and the tag chip became an array.
    expect(createPreset).toHaveBeenCalledWith({
      name: 'paris_weather',
      base_tool: 'weather',
      description: '',
      fixed_kwargs: {},
      tags: ['geo'],
    });
    // On success the detail navigates to the new preset.
    expect(navigate).toHaveBeenCalledWith('presets', { preset: 'paris_weather' });
    // …and the presets list + tools master list are invalidated (a create binds a
    // live tool the tools page shows).
    expect(invalidate).toHaveBeenCalledWith({ queryKey: presetsListKey });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: toolsListKey });
  });

  it('includes output_schema in the body when the author sets one', async () => {
    const user = userEvent.setup();
    const createPreset = vi.fn().mockResolvedValue(record);
    const client = baseClient({ createPreset });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await fillNameAndBase(user);
    const schema = { type: 'object', title: 'Weather', properties: {} };
    fireEvent.change(screen.getByLabelText('Output schema JSON'), {
      target: { value: JSON.stringify(schema) },
    });
    await user.click(screen.getByRole('button', { name: 'Create preset' }));

    expect(createPreset).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'paris_weather', output_schema: schema }),
    );
  });

  it('blocks submit and shows the parse error when output_schema is invalid JSON', async () => {
    const user = userEvent.setup();
    const createPreset = vi.fn().mockResolvedValue(record);
    const client = baseClient({ createPreset });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await fillNameAndBase(user);
    fireEvent.change(screen.getByLabelText('Output schema JSON'), {
      target: { value: '{ broken' },
    });
    // The editor shows the loud inline parse error and the submit stays blocked.
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create preset' }));
    expect(createPreset).not.toHaveBeenCalled();
  });

  it('renders a 400 invalid-output-schema message verbatim', async () => {
    const user = userEvent.setup();
    const createPreset = vi
      .fn()
      .mockRejectedValue(
        new Error("output_schema is not a valid JSON Schema: 'type' must be a string"),
      );
    const client = baseClient({ createPreset });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await fillNameAndBase(user);
    fireEvent.change(screen.getByLabelText('Output schema JSON'), {
      target: { value: '{"type":"object","title":"X"}' },
    });
    await user.click(screen.getByRole('button', { name: 'Create preset' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "output_schema is not a valid JSON Schema: 'type' must be a string",
    );
  });

  it('blocks submit with the parser message when fixed_kwargs is not valid JSON', async () => {
    const user = userEvent.setup();
    const createPreset = vi.fn().mockResolvedValue(record);
    const client = baseClient({ createPreset });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await fillNameAndBase(user);
    const kwargs = screen.getByLabelText('Fixed kwargs JSON');
    await user.clear(kwargs);
    await user.type(kwargs, '123');
    await user.click(screen.getByRole('button', { name: 'Create preset' }));

    expect(createPreset).not.toHaveBeenCalled();
    // A non-object body is a loud, verbatim field error rather than an empty bake.
    expect(screen.getByText('Fixed kwargs must be a JSON object.')).toBeInTheDocument();
  });

  it('renders a 409 duplicate message verbatim', async () => {
    const user = userEvent.setup();
    const createPreset = vi
      .fn()
      .mockRejectedValue(new Error("preset 'paris_weather' already exists"));
    const client = baseClient({ createPreset });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await fillNameAndBase(user);
    await user.click(screen.getByRole('button', { name: 'Create preset' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "preset 'paris_weather' already exists",
    );
  });

  it('validate — clean verdict: sends the full create draft and shows a success badge', async () => {
    const user = userEvent.setup();
    const validatePreset = vi.fn().mockResolvedValue({ valid: true, error: null });
    const client = baseClient({ validatePreset });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await fillNameAndBase(user);
    await user.click(screen.getByRole('button', { name: 'Validate' }));

    // The draft is sent exactly as submit would send it (full field set, no combos).
    expect(validatePreset).toHaveBeenCalledWith({
      name: 'paris_weather',
      base_tool: 'weather',
      description: '',
      fixed_kwargs: {},
      tags: [],
    });
    expect(await screen.findByText('Draft binds cleanly')).toBeInTheDocument();
  });

  it('validate — invalid verdict: a rejected draft is a verdict, never an error state', async () => {
    // The server ran the pre-store check and answered "no". That is a deliberate
    // answer, so it reads as the counterpart of the clean verdict — a badge plus
    // the reason verbatim — not as the crossed-circle surface that says the system
    // broke. It still ANNOUNCES: the verdict lands after the press.
    const user = userEvent.setup();
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
    const user = userEvent.setup();
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

  it('labels an agent run tool in the base picker with a " (agent)" suffix', async () => {
    const user = userEvent.setup();
    const client = baseClient({
      listTools: vi.fn().mockResolvedValue(['weather', 'writer_agent']),
      listAgents: vi
        .fn()
        .mockResolvedValue({ items: [{ name: 'writer', tool_name: 'writer_agent' }], total: 1 }),
    });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await user.click(await screen.findByRole('combobox'));
    expect(await screen.findByRole('option', { name: 'writer_agent (agent)' })).toBeInTheDocument();
    // A non-agent tool keeps its bare label.
    expect(screen.getByRole('option', { name: 'weather' })).toBeInTheDocument();
  });

  it('renders a 400 base-is-a-preset message verbatim', async () => {
    const user = userEvent.setup();
    const createPreset = vi
      .fn()
      .mockRejectedValue(new Error("base tool 'weather' is itself a preset"));
    const client = baseClient({ createPreset });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await fillNameAndBase(user);
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
      // the deployment: an unlabelled agent base looks like a plain tool.
      renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
        client: baseClient(override),
      });

      expect(await screen.findByRole('alert')).toHaveTextContent(expected);
      // The picker is still there and still usable.
      expect(await screen.findByRole('combobox')).toBeEnabled();
    },
  );

  it('says so when the base-tool SCHEMA read fails, without walling the kwargs field', async () => {
    // The schema supplies only the "Base tool inputs: …" hint. A failure used to
    // delete that sentence with nothing in its place, so a hintless kwargs box read
    // as "this base declares no inputs".
    const user = userEvent.setup();
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
      client: baseClient({ getToolSchema: vi.fn().mockRejectedValue(new Error('schema down')) }),
    });

    await fillNameAndBase(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Base tool input names are unavailable: schema down',
    );
    expect(screen.getByLabelText('Fixed kwargs JSON')).toBeEnabled();
  });

  it('gives each failed enrichment read its OWN line, never one run-together sentence', async () => {
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
      client: baseClient({
        listToolTags: vi.fn().mockRejectedValue(new Error('tags down')),
        listAgents: vi.fn().mockRejectedValue(new Error('agents down')),
      }),
    });

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
});
