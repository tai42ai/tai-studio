/**
 * Save-version tests: submit is disabled until a field is dirty; only changed
 * fields are sent (untouched fields omitted → carry-forward); a cleared extensions
 * builder sends an explicit `[]`; and a 409 renders verbatim.
 */
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { toolsListKey } from '@tai42/studio-sdk';

import { SaveVersionDialog } from './SaveVersionDialog';
import { presetDetailKey, presetVersionsKey, presetsListKey } from './keys';
import { renderWithProviders, type StubApiClient } from './test-utils';

const detail = {
  name: 'paris_weather',
  base_tool: 'weather',
  description: '',
  active_version: 2,
  tags: ['geo'],
  extensions: [['chain']],
  output_schema: null,
  conflicted: false,
  conflicted_reason: null,
  fixed_kwargs: { city: 'Paris' },
};

function client(overrides: StubApiClient = {}): StubApiClient {
  return {
    listExtensions: vi.fn().mockResolvedValue([{ name: 'chain', kind: 'wrapper' }]),
    savePresetVersion: vi.fn().mockResolvedValue({
      version: 3,
      body: { ...detail, output_schema: null },
      tags: [],
      created_at: 'now',
      is_current: true,
    }),
    ...overrides,
  };
}

describe('SaveVersionDialog', () => {
  it('disables submit until at least one field is dirty', () => {
    renderWithProviders(<SaveVersionDialog detail={detail} onClose={vi.fn()} />, {
      client: client(),
    });
    expect(screen.getByRole('button', { name: 'Save as new version' })).toBeDisabled();
  });

  it('sends ONLY the changed tags field (untouched fields carry forward)', async () => {
    const user = userEvent.setup();
    const savePresetVersion = vi.fn().mockResolvedValue({
      version: 3,
      body: { ...detail, output_schema: null },
      tags: [],
      created_at: 'now',
      is_current: true,
    });
    const { queryClient } = renderWithProviders(
      <SaveVersionDialog detail={detail} onClose={vi.fn()} />,
      { client: client({ savePresetVersion }) },
    );
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await user.type(screen.getByLabelText('Add a tag'), 'eu');
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(screen.getByRole('button', { name: 'Save as new version' }));

    expect(savePresetVersion).toHaveBeenCalledWith('paris_weather', { tags: ['geo', 'eu'] });
    // A successful save invalidates the list, this preset's detail + versions, and
    // the tools master list (the reload rebinds the live tool).
    expect(invalidate).toHaveBeenCalledWith({ queryKey: presetsListKey });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: presetDetailKey('paris_weather') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: presetVersionsKey('paris_weather') });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: toolsListKey });
  });

  it('sends an explicit [] when the extensions builder is cleared', async () => {
    const user = userEvent.setup();
    const savePresetVersion = vi.fn().mockResolvedValue({
      version: 3,
      body: { ...detail, output_schema: null },
      tags: [],
      created_at: 'now',
      is_current: true,
    });
    renderWithProviders(<SaveVersionDialog detail={detail} onClose={vi.fn()} />, {
      client: client({ savePresetVersion }),
    });

    // The seeded combo renders with a Remove; clearing it makes extensions dirty.
    await user.click(await screen.findByRole('button', { name: 'Remove combo chain' }));
    await user.click(screen.getByRole('button', { name: 'Save as new version' }));

    expect(savePresetVersion).toHaveBeenCalledWith('paris_weather', { extensions: [] });
  });

  it("preserves an untouched combo's author config when a sibling combo is edited", async () => {
    const user = userEvent.setup();
    const savePresetVersion = vi.fn().mockResolvedValue({
      version: 3,
      body: { ...detail, output_schema: null },
      tags: [],
      created_at: 'now',
      is_current: true,
    });
    // Two combos, the first config-bearing; the name-only builder shows both as names.
    const configDetail = {
      ...detail,
      extensions: [[{ name: 'chain', config: { verifier: 'x' } }], ['batch']],
    };
    renderWithProviders(<SaveVersionDialog detail={configDetail} onClose={vi.fn()} />, {
      client: client({
        savePresetVersion,
        listExtensions: vi.fn().mockResolvedValue([
          { name: 'chain', kind: 'wrapper' },
          { name: 'batch', kind: 'wrapper' },
        ]),
      }),
    });

    // Remove the SECOND combo; the first (config-bearing) combo is untouched.
    await user.click(await screen.findByRole('button', { name: 'Remove combo batch' }));
    await user.click(screen.getByRole('button', { name: 'Save as new version' }));

    // The untouched combo keeps its `{ name, config }` element, not a bare name.
    expect(savePresetVersion).toHaveBeenCalledWith('paris_weather', {
      extensions: [[{ name: 'chain', config: { verifier: 'x' } }]],
    });
  });

  const withSchema = {
    ...detail,
    output_schema: { type: 'object', title: 'Weather', properties: {} },
  };

  it('carry-forward — EXPLICIT set: sends a newly-authored output_schema', async () => {
    const user = userEvent.setup();
    const savePresetVersion = vi.fn().mockResolvedValue({
      version: 3,
      body: { ...detail, output_schema: null },
      tags: [],
      created_at: 'now',
      is_current: true,
    });
    renderWithProviders(<SaveVersionDialog detail={detail} onClose={vi.fn()} />, {
      client: client({ savePresetVersion }),
    });

    const schema = { type: 'object', title: 'Weather', properties: {} };
    fireEvent.change(screen.getByLabelText('Output schema JSON'), {
      target: { value: JSON.stringify(schema) },
    });
    await user.click(screen.getByRole('button', { name: 'Save as new version' }));

    expect(savePresetVersion).toHaveBeenCalledWith('paris_weather', { output_schema: schema });
  });

  it('carry-forward — ABSENT: an untouched output_schema is omitted (carries forward)', async () => {
    const user = userEvent.setup();
    const savePresetVersion = vi.fn().mockResolvedValue({
      version: 3,
      body: { ...withSchema },
      tags: [],
      created_at: 'now',
      is_current: true,
    });
    renderWithProviders(<SaveVersionDialog detail={withSchema} onClose={vi.fn()} />, {
      client: client({ savePresetVersion }),
    });

    // Change only tags; the seeded output_schema is untouched, so it is NOT sent.
    await user.type(screen.getByLabelText('Add a tag'), 'eu');
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(screen.getByRole('button', { name: 'Save as new version' }));

    expect(savePresetVersion).toHaveBeenCalledWith('paris_weather', { tags: ['geo', 'eu'] });
    expect(savePresetVersion.mock.lastCall?.[1]).not.toHaveProperty('output_schema');
  });

  it('carry-forward — EXPLICIT clear: clearing the editor sends output_schema: null', async () => {
    const user = userEvent.setup();
    const savePresetVersion = vi.fn().mockResolvedValue({
      version: 3,
      body: { ...detail, output_schema: null },
      tags: [],
      created_at: 'now',
      is_current: true,
    });
    renderWithProviders(<SaveVersionDialog detail={withSchema} onClose={vi.fn()} />, {
      client: client({ savePresetVersion }),
    });

    // Clear the seeded schema → an explicit clear, sent as null.
    fireEvent.change(screen.getByLabelText('Output schema JSON'), { target: { value: '' } });
    await user.click(screen.getByRole('button', { name: 'Save as new version' }));

    expect(savePresetVersion).toHaveBeenCalledWith('paris_weather', { output_schema: null });
  });

  it('renders the field-vs-extension conflict 400 verbatim inline', async () => {
    const user = userEvent.setup();
    const message =
      'output_schema cannot be set both as a field and as an explicit output_schema extension';
    const savePresetVersion = vi.fn().mockRejectedValue(new Error(message));
    renderWithProviders(<SaveVersionDialog detail={detail} onClose={vi.fn()} />, {
      client: client({ savePresetVersion }),
    });

    fireEvent.change(screen.getByLabelText('Output schema JSON'), {
      target: { value: '{"type":"object","title":"X"}' },
    });
    await user.click(screen.getByRole('button', { name: 'Save as new version' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('blocks submit and shows the parser message on malformed fixed_kwargs JSON', async () => {
    const user = userEvent.setup();
    const savePresetVersion = vi.fn();
    renderWithProviders(<SaveVersionDialog detail={detail} onClose={vi.fn()} />, {
      client: client({ savePresetVersion }),
    });

    const textarea = screen.getByLabelText('Fixed kwargs JSON');
    await user.clear(textarea);
    // Not valid JSON (no braces — `{` is a userEvent key descriptor).
    await user.type(textarea, 'not json');
    await user.click(screen.getByRole('button', { name: 'Save as new version' }));

    // A malformed body never reaches the server and surfaces a loud field error.
    expect(savePresetVersion).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('renders a 409 conflicted message verbatim', async () => {
    const user = userEvent.setup();
    const savePresetVersion = vi
      .fn()
      .mockRejectedValue(new Error("preset 'paris_weather' is conflicted and is delete-only"));
    renderWithProviders(<SaveVersionDialog detail={detail} onClose={vi.fn()} />, {
      client: client({ savePresetVersion }),
    });

    await user.type(screen.getByLabelText('Add a tag'), 'eu');
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(screen.getByRole('button', { name: 'Save as new version' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "preset 'paris_weather' is conflicted and is delete-only",
    );
  });

  it('validate — sends the MERGED editable draft (seed + edits, no base_tool/description)', async () => {
    const user = userEvent.setup();
    const validatePreset = vi.fn().mockResolvedValue({ valid: true, error: null });
    renderWithProviders(<SaveVersionDialog detail={detail} onClose={vi.fn()} />, {
      client: client({ validatePreset }),
    });

    // Validate is enabled even before any edit; it sends the current editable set.
    await user.click(await screen.findByRole('button', { name: 'Validate' }));

    expect(validatePreset).toHaveBeenCalledWith({
      name: 'paris_weather',
      fixed_kwargs: { city: 'Paris' },
      tags: ['geo'],
      extensions: [['chain']],
      output_schema: null,
    });
    expect(await screen.findByText('Draft binds cleanly')).toBeInTheDocument();
  });

  it('flags a seeded stale combo (unknown name) with ZERO edits and blocks submit', async () => {
    const user = userEvent.setup();
    // The catalog resolves WITHOUT `chain`, so the seeded `[['chain']]` is stale.
    const savePresetVersion = vi.fn();
    renderWithProviders(<SaveVersionDialog detail={detail} onClose={vi.fn()} />, {
      client: client({
        listExtensions: vi.fn().mockResolvedValue([{ name: 'other', kind: 'wrapper' }]),
        savePresetVersion,
      }),
    });

    // The unknown-name note surfaces with no combo edit at all.
    expect(await screen.findByText('Unknown extension: chain.')).toBeInTheDocument();

    // Make the form dirty; submit still stays blocked while a name is unknown.
    await user.type(screen.getByLabelText('Add a tag'), 'eu');
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    expect(screen.getByRole('button', { name: 'Save as new version' })).toBeDisabled();
    expect(savePresetVersion).not.toHaveBeenCalled();
  });

  it('stays quiet (no unknown-name note) while the extension catalog is still loading', () => {
    // A never-resolving catalog keeps the builder in its loading state.
    renderWithProviders(<SaveVersionDialog detail={detail} onClose={vi.fn()} />, {
      client: client({
        listExtensions: vi.fn().mockReturnValue(new Promise<never>(() => undefined)),
      }),
    });

    expect(screen.queryByText(/unknown extension/i)).toBeNull();
  });
});
