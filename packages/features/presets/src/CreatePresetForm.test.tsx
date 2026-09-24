/**
 * The create-preset form — assembling and submitting the body: identity + base
 * picker, the tagless create body (tags written to the overlay after), the
 * conflicted/hidden exclusions, output-schema + kwargs parsing, and the store-off
 * behaviour.
 */
import { ApiError } from '@tai42/api-client';
import { toolsListKey } from '@tai42/studio-sdk';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CreatePresetForm } from './CreatePresetForm';
import { presetsListKey } from './keys';
import {
  baseClient,
  fillCreatable,
  fillNameAndBase,
  openBasePicker,
  pickBase,
  record,
  renderWithProviders,
} from './test-utils';

describe('CreatePresetForm', () => {
  it('assembles a TAGLESS body, writes the tags to the overlay AFTER create, and OMITS extensions', async () => {
    const user = userEvent.setup({ delay: null });
    const createPreset = vi.fn().mockResolvedValue(record);
    const upsertToolMeta = vi.fn().mockResolvedValue({
      tool_name: 'paris_weather',
      display_name: null,
      folder_id: null,
      tags: ['geo'],
      hidden: null,
    });
    const client = baseClient({ createPreset, upsertToolMeta });
    const { navigate, queryClient } = renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
      client,
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await fillCreatable(user);
    await user.type(screen.getByLabelText('Tags'), 'geo');
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(screen.getByRole('button', { name: 'Create preset' }));

    // The create runs a CHAIN: createPreset → overlay upsertToolMeta → onSuccess
    // (invalidate ×2, then navigate). Synchronize on the navigate the chain ENDS on,
    // so every earlier step is already recorded when read — asserting on the middle
    // (upsertToolMeta) instead lets the tail (navigate/invalidate) race behind it.
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('presets', { preset: 'paris_weather' });
    });

    expect(createPreset).toHaveBeenCalledTimes(1);
    // An exact-object match: `extensions` is OMITTED when there are no combos, and
    // NO `tags` key rides the create body — tags are the overlay's, not the record's.
    expect(createPreset).toHaveBeenCalledWith({
      name: 'paris_weather',
      base_tool: 'weather',
      description: 'Paris weather',
      fixed_kwargs: {},
    });
    // The entered tags land in the tool_meta overlay, keyed by the new preset's tool
    // name, AFTER the create returns and BEFORE the success navigate.
    expect(upsertToolMeta).toHaveBeenCalledWith('paris_weather', { tags: ['geo'] });
    // …and the presets list + tools master list are invalidated (a create binds a
    // live tool the tools page shows).
    expect(invalidate).toHaveBeenCalledWith({ queryKey: presetsListKey });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: toolsListKey });
  });

  it('completes the create even when the overlay tag write is refused as not-configured', async () => {
    const user = userEvent.setup({ delay: null });
    const createPreset = vi.fn().mockResolvedValue(record);
    const upsertToolMeta = vi
      .fn()
      .mockRejectedValue(new ApiError('not configured', 501, 'tool-meta-not-configured'));
    const { navigate } = renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
      client: baseClient({ createPreset, upsertToolMeta }),
    });

    await fillCreatable(user);
    await user.type(screen.getByLabelText('Tags'), 'geo');
    await user.click(screen.getByRole('button', { name: 'Add tag' }));
    await user.click(screen.getByRole('button', { name: 'Create preset' }));

    // The create succeeds and navigates: the store-off tag write is a no-op, never a
    // failure that turns a successful create red.
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('presets', { preset: 'paris_weather' });
    });
    expect(createPreset).toHaveBeenCalledTimes(1);
    expect(upsertToolMeta).toHaveBeenCalledWith('paris_weather', { tags: ['geo'] });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does NOT write the overlay when no tags were entered', async () => {
    const user = userEvent.setup({ delay: null });
    const createPreset = vi.fn().mockResolvedValue(record);
    const upsertToolMeta = vi.fn();
    const { navigate } = renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
      client: baseClient({ createPreset, upsertToolMeta }),
    });

    await fillCreatable(user);
    await user.click(screen.getByRole('button', { name: 'Create preset' }));

    // Synchronize on the navigate the whole create chain ENDS on, so the negative
    // below proves the overlay is never written across the FULL flow — not merely
    // that it has not been written YET, mid-chain.
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('presets', { preset: 'paris_weather' });
    });
    expect(createPreset).toHaveBeenCalledTimes(1);
    // An empty overlay merge-patch is rejected by the API, so it is never sent.
    expect(upsertToolMeta).not.toHaveBeenCalled();
  });

  it('HIDES the tags input when the tool_meta kind is OFF, and still creates', async () => {
    const user = userEvent.setup({ delay: null });
    const createPreset = vi.fn().mockResolvedValue(record);
    const upsertToolMeta = vi.fn();
    const { navigate } = renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
      client: baseClient({ createPreset, upsertToolMeta }),
      // The kind-status table reports the overlay store OFF, so the tags input is
      // withdrawn PROACTIVELY — an author can never type tags the OFF overlay drops.
      systemKinds: [{ kind: 'tool_meta', state: 'off', plugin: null, detail: '' }],
    });

    // Once the table resolves to `ready`, the Tags field is gone (it renders until the
    // proactive read lands — not-off is the loading default).
    await waitFor(() => {
      expect(screen.queryByLabelText('Tags')).toBeNull();
    });

    // The create still works with the input hidden, and never writes the overlay.
    await fillCreatable(user);
    await user.click(screen.getByRole('button', { name: 'Create preset' }));
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('presets', { preset: 'paris_weather' });
    });
    expect(createPreset).toHaveBeenCalledTimes(1);
    expect(upsertToolMeta).not.toHaveBeenCalled();
  });

  it('KEEPS the tags input when the tool_meta kind is active', async () => {
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
      client: baseClient(),
      systemKinds: [{ kind: 'tool_meta', state: 'active', plugin: 'overlay', detail: '' }],
    });
    // The input is present from the first render and stays present after the table
    // resolves to a non-off state.
    expect(screen.getByLabelText('Tags')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Tags')).toBeInTheDocument();
    });
  });

  it('blocks submit and shows the field error when the description is empty', async () => {
    const user = userEvent.setup({ delay: null });
    const createPreset = vi.fn().mockResolvedValue(record);
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
      client: baseClient({ createPreset }),
    });

    // Name + base are set but the description is left blank — submit is blocked
    // exactly like a missing name (the API rejects an empty description with a 422).
    await fillNameAndBase(user);
    await user.click(screen.getByRole('button', { name: 'Create preset' }));

    expect(screen.getByText('A description is required.')).toBeInTheDocument();
    expect(createPreset).not.toHaveBeenCalled();
  });

  it('groups the base picker on the MERGED native + overlay tag map once a base is selected', async () => {
    const user = userEvent.setup({ delay: null });
    // `weather` carries a NATIVE tag; `radar` carries only an OVERLAY tag. The tag
    // filter lists the UNION, so a tag from either read proves the map is merged.
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
      client: baseClient({
        listTools: vi.fn().mockResolvedValue(['weather', 'radar']),
        listToolTags: vi
          .fn()
          .mockResolvedValue([{ name: 'weather', tags: ['native-geo'], hidden: false }]),
        listToolMeta: vi.fn().mockResolvedValue({
          folders: [],
          meta: [
            {
              tool_name: 'radar',
              display_name: null,
              folder_id: null,
              tags: ['overlay-geo'],
              hidden: null,
            },
          ],
        }),
      }),
    });

    // The enrichment reads run only for a selected base, so grouping lights up once a
    // base is picked: the tag filter appears and its options are the merged tag set.
    await pickBase(user, 'weather');
    const filter = await screen.findByRole('combobox', { name: 'Filter by tag' });
    await user.click(filter);
    expect(await screen.findByRole('option', { name: 'native-geo' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'overlay-geo' })).toBeInTheDocument();
  });

  it('excludes an EFFECTIVE-hidden base tool once a base is selected, keeping an overlay-`false` unhidden one', async () => {
    // `secret` is plugin-hidden with no overlay opinion → excluded. `radar` is
    // plugin-hidden but the overlay forces it visible (`hidden: false`) → offered.
    // `weather` is a plain visible tool → offered.
    const user = userEvent.setup({ delay: null });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, {
      client: baseClient({
        listTools: vi.fn().mockResolvedValue(['weather', 'secret', 'radar']),
        listToolTags: vi.fn().mockResolvedValue([
          { name: 'weather', tags: [], hidden: false },
          { name: 'secret', tags: [], hidden: true },
          { name: 'radar', tags: [], hidden: true },
        ]),
        listToolMeta: vi.fn().mockResolvedValue({
          folders: [],
          meta: [
            { tool_name: 'radar', display_name: null, folder_id: null, tags: [], hidden: false },
          ],
        }),
      }),
    });

    // The effective-hidden exclusion reads the tags/overlay, which run only for a
    // selected base: pick a base, then reopen the picker to read the enriched options.
    await pickBase(user, 'weather');
    await openBasePicker(user);
    expect(screen.getByRole('option', { name: 'weather' })).toBeInTheDocument();
    // Once the tool-meta read applies, the effective-hidden `secret` leaves the picker
    // while the overlay-unhidden `radar` stays.
    await waitFor(() => {
      expect(screen.queryByRole('option', { name: 'secret' })).toBeNull();
    });
    expect(screen.getByRole('option', { name: 'radar' })).toBeInTheDocument();
  });

  it('includes output_schema in the body when the author sets one', async () => {
    const user = userEvent.setup({ delay: null });
    const createPreset = vi.fn().mockResolvedValue(record);
    const client = baseClient({ createPreset });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await fillCreatable(user);
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
    const user = userEvent.setup({ delay: null });
    const createPreset = vi.fn().mockResolvedValue(record);
    const client = baseClient({ createPreset });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await fillCreatable(user);
    fireEvent.change(screen.getByLabelText('Output schema JSON'), {
      target: { value: '{ broken' },
    });
    // The editor shows the loud inline parse error and the submit stays blocked.
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create preset' }));
    expect(createPreset).not.toHaveBeenCalled();
  });

  it('renders a 400 invalid-output-schema message verbatim', async () => {
    const user = userEvent.setup({ delay: null });
    const createPreset = vi
      .fn()
      .mockRejectedValue(
        new Error("output_schema is not a valid JSON Schema: 'type' must be a string"),
      );
    const client = baseClient({ createPreset });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await fillCreatable(user);
    fireEvent.change(screen.getByLabelText('Output schema JSON'), {
      target: { value: '{"type":"object","title":"X"}' },
    });
    await user.click(screen.getByRole('button', { name: 'Create preset' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "output_schema is not a valid JSON Schema: 'type' must be a string",
    );
  });

  it('blocks submit with the parser message when fixed_kwargs is not valid JSON', async () => {
    const user = userEvent.setup({ delay: null });
    const createPreset = vi.fn().mockResolvedValue(record);
    const client = baseClient({ createPreset });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await fillCreatable(user);
    // The raw-JSON view is where a malformed body can be authored; switch to it first.
    await user.click(screen.getByRole('button', { name: 'JSON' }));
    const kwargs = screen.getByLabelText('Fixed kwargs JSON');
    await user.clear(kwargs);
    await user.type(kwargs, '123');
    await user.click(screen.getByRole('button', { name: 'Create preset' }));

    expect(createPreset).not.toHaveBeenCalled();
    // A non-object body is a loud, verbatim field error rather than an empty bake.
    expect(screen.getByText('Fixed kwargs must be a JSON object.')).toBeInTheDocument();
  });

  it('carries a !ENV secret reference built on the fields editor to the create body verbatim', async () => {
    const user = userEvent.setup({ delay: null });
    const createPreset = vi.fn().mockResolvedValue(record);
    const client = baseClient({ createPreset });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await fillCreatable(user);
    // Build a reference row: a key, the "Secret reference" type, and an existing env key
    // picked from the list. The editor emits the exact marker the server resolves at bind.
    await user.click(screen.getByRole('button', { name: 'Add kwarg' }));
    await user.type(screen.getByLabelText('Key'), 'api_token');
    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(await screen.findByRole('option', { name: 'Secret reference' }));
    // The env read resolves for the picked base, so the key list lights up; the reference
    // row opens straight on the key picker (initialMode="key").
    await user.click(await screen.findByRole('combobox', { name: 'Secret reference' }));
    await user.click(await screen.findByRole('option', { name: 'SERVICE_API_TOKEN' }));
    await user.click(screen.getByRole('button', { name: 'Create preset' }));

    // A marker is an ordinary string to the client: it reaches the create body unchanged —
    // the server resolves it at bind; the client never resolves it.
    await waitFor(() => {
      expect(createPreset).toHaveBeenCalledWith(
        expect.objectContaining({ fixed_kwargs: { api_token: '!ENV ${SERVICE_API_TOKEN}' } }),
      );
    });
  });

  it('states in the Fixed kwargs help that a secret reference stores only the variable name', () => {
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client: baseClient() });
    const help = screen.getByText(/stores only the environment variable's name/i);
    expect(help).toHaveTextContent('stored in the clear');
  });

  it('renders a 409 duplicate message verbatim', async () => {
    const user = userEvent.setup({ delay: null });
    const createPreset = vi
      .fn()
      .mockRejectedValue(new Error("preset 'paris_weather' already exists"));
    const client = baseClient({ createPreset });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await fillCreatable(user);
    await user.click(screen.getByRole('button', { name: 'Create preset' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "preset 'paris_weather' already exists",
    );
  });

  it('create — a store-off 501 shows the muted OFF note and withdraws both writes', async () => {
    // A store-less deploy: the CREATE refuses with a 501 `versioning-not-configured`.
    // OFF is a state, not an error — the muted note replaces the red alert, and both
    // Create and Validate (they write the same store) are withdrawn so the
    // certain-to-refuse writes cannot re-fire.
    const user = userEvent.setup({ delay: null });
    const createPreset = vi
      .fn()
      .mockRejectedValue(
        new ApiError(
          'versioning is not configured: set TAI_DATABASE_DEFAULT_PG_PASSWORD',
          501,
          'versioning-not-configured',
        ),
      );
    const client = baseClient({ createPreset });
    renderWithProviders(<CreatePresetForm onClose={vi.fn()} />, { client });

    await fillCreatable(user);
    await user.click(screen.getByRole('button', { name: 'Create preset' }));

    const note = await screen.findByTestId('feature-disabled');
    expect(note).toHaveTextContent(
      'versioning is not configured: set TAI_DATABASE_DEFAULT_PG_PASSWORD',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Create preset' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Validate' })).toBeDisabled();
  });
});
