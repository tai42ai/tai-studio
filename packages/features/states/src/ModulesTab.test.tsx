/**
 * The Modules tab: the mounts table and the module-document catalog render; Mount module
 * opens a form over the module's parameter schema and PUTs the mount; Unmount confirms
 * and removes it; a module mounted elsewhere cannot be deleted; a 501 shows FeatureDisabled.
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError, type StateDetail } from '@tai42/api-client';

import { ModulesTab } from './ModulesTab';
import { lastFileInput, renderWithProviders, type StubApiClient } from './test-utils';

function detail(mounts: unknown[] = []): StateDetail {
  return {
    name: 'profile',
    description: '',
    // A nested object property so the mount path picker offers a non-root level.
    schema: { type: 'object', properties: { notes: { type: 'object' } } },
    subject_kinds: ['person'],
    default_subject_kind: 'person',
    retention_days: null,
    mounts,
    effective_schema: { type: 'object' },
    regimes: [],
  } as unknown as StateDetail;
}

function moduleDoc(over: Record<string, unknown> = {}) {
  return {
    kind: 'state-module',
    name: 'notes',
    description: 'A notes fragment',
    parameters: {},
    schema: { type: 'object' },
    regimes: [],
    declarations: null,
    trace: {},
    mounted_on: 0,
    shipped_default: false,
    ...over,
  };
}

function client(over: Partial<StubApiClient> = {}): StubApiClient {
  return {
    listStateModules: vi.fn().mockResolvedValue([moduleDoc()]),
    ...over,
  };
}

describe('ModulesTab', () => {
  it('renders the mounts table and the module catalog', async () => {
    renderWithProviders(
      <ModulesTab
        state={detail([{ module: 'notes', path: ['notes'], parameters: {}, declarations: {} }])}
      />,
      { client: client() },
    );
    expect(await screen.findByText('Mounts')).toBeInTheDocument();
    expect(screen.getAllByText('notes').length).toBeGreaterThan(0);
    expect(screen.getByText('Module documents')).toBeInTheDocument();
  });

  it('the mount action icons keep their accessible names', async () => {
    renderWithProviders(
      <ModulesTab
        state={detail([{ module: 'notes', path: ['notes'], parameters: {}, declarations: {} }])}
      />,
      { client: client() },
    );
    // The actions are icon-only buttons; their accessible name comes from `aria-label`,
    // so a screen reader (and every by-name query) still finds them.
    expect(await screen.findByRole('button', { name: 'Edit declarations' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Unmount' })).toBeInTheDocument();
  });

  it('the catalog Shipped column badges a shipped default and dashes the rest', async () => {
    renderWithProviders(<ModulesTab state={detail()} />, {
      client: client({
        listStateModules: vi
          .fn()
          .mockResolvedValue([
            moduleDoc({ name: 'seeded', shipped_default: true }),
            moduleDoc({ name: 'custom', shipped_default: false }),
          ]),
      }),
    });
    expect(await screen.findByText('Shipped')).toBeInTheDocument();
    // Exactly the shipped-default module carries the badge; the other's cell is a dash.
    expect(screen.getAllByText('shipped default')).toHaveLength(1);
    expect(screen.getAllByText('—')).toHaveLength(1);
  });

  it('Mount module PUTs the chosen module at its path', async () => {
    const user = userEvent.setup();
    const mountStateModule = vi.fn().mockResolvedValue({
      module: 'notes',
      path: ['notes'],
      parameters: {},
      declarations: {},
    });
    renderWithProviders(<ModulesTab state={detail()} />, {
      client: client({ mountStateModule }),
    });
    const [mountBtn] = await screen.findAllByRole('button', { name: 'Mount module' });
    if (mountBtn === undefined) throw new Error('no Mount module button');
    await user.click(mountBtn);
    const dialog = await screen.findByRole('dialog');
    // Pick the module (options are labelled `name — description`).
    await user.click(within(dialog).getByLabelText('Module'));
    await user.click(await screen.findByRole('option', { name: 'notes — A notes fragment' }));
    // Pick a mount path from the object-level picker.
    await user.click(within(dialog).getByLabelText('Mount path'));
    await user.click(await screen.findByRole('option', { name: 'notes' }));
    await user.click(within(dialog).getByRole('button', { name: 'Mount' }));
    await waitFor(() => {
      expect(mountStateModule).toHaveBeenCalledWith('profile', 'notes', {
        path: ['notes'],
        parameters: {},
        declarations: {},
      });
    });
  });

  it('Unmount confirms and removes the mount', async () => {
    const user = userEvent.setup();
    const unmountStateModule = vi.fn().mockResolvedValue({ name: 'notes', deleted: true });
    renderWithProviders(
      <ModulesTab
        state={detail([{ module: 'notes', path: [], parameters: {}, declarations: {} }])}
      />,
      { client: client({ unmountStateModule }) },
    );
    await user.click(await screen.findByRole('button', { name: 'Unmount' }));
    await user.click(await screen.findByRole('button', { name: 'Unmount', hidden: false }));
    await waitFor(() => {
      expect(unmountStateModule).toHaveBeenCalledWith('profile', 'notes');
    });
  });

  it('a module mounted elsewhere cannot be deleted', async () => {
    renderWithProviders(<ModulesTab state={detail()} />, {
      client: client({
        listStateModules: vi.fn().mockResolvedValue([moduleDoc({ mounted_on: 2 })]),
      }),
    });
    const del = await screen.findByRole('button', { name: 'Delete' });
    expect(del).toBeDisabled();
    expect(del).toHaveAttribute('title');
  });

  it('a 501 shows FeatureDisabled', async () => {
    renderWithProviders(<ModulesTab state={detail()} />, {
      client: client({
        listStateModules: vi.fn().mockRejectedValue(new ApiError('no store', 501)),
      }),
    });
    expect(await screen.findByTestId('feature-disabled')).toBeInTheDocument();
  });

  it('Edit declarations saves the mount when the module declares none', async () => {
    const user = userEvent.setup();
    const patchStateMount = vi.fn().mockResolvedValue({
      module: 'notes',
      path: [],
      parameters: {},
      declarations: {},
    });
    renderWithProviders(
      <ModulesTab
        state={detail([{ module: 'notes', path: [], parameters: {}, declarations: {} }])}
      />,
      { client: client({ patchStateMount }) },
    );
    await user.click(await screen.findByRole('button', { name: 'Edit declarations' }));
    expect(await screen.findByText('This module declares nothing.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(patchStateMount).toHaveBeenCalledWith('profile', 'notes', { declarations: {} });
    });
  });

  it('deletes an unmounted module behind a confirm', async () => {
    const user = userEvent.setup();
    const deleteStateModule = vi.fn().mockResolvedValue({ name: 'notes', deleted: true });
    renderWithProviders(<ModulesTab state={detail()} />, {
      client: client({ deleteStateModule }),
    });
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete module' }));
    await waitFor(() => {
      expect(deleteStateModule).toHaveBeenCalledWith('notes');
    });
  });

  it('Upload module PUTs the parsed document', async () => {
    const user = userEvent.setup();
    const putStateModule = vi.fn().mockResolvedValue(moduleDoc());
    const { container } = renderWithProviders(<ModulesTab state={detail()} />, {
      client: client({ putStateModule }),
    });
    await screen.findByText('Module documents');
    const moduleInput = lastFileInput(container);
    const file = new File(
      [JSON.stringify({ kind: 'state-module', name: 'notes', schema: {} })],
      'notes.json',
      {
        type: 'application/json',
      },
    );
    await user.upload(moduleInput, file);
    await waitFor(() => {
      expect(putStateModule).toHaveBeenCalled();
    });
    expect(putStateModule.mock.calls[0]?.[0]).toBe('notes');
  });

  it('a bad module upload surfaces a loud alert', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<ModulesTab state={detail()} />, {
      client: client(),
    });
    await screen.findByText('Module documents');
    const moduleInput = lastFileInput(container);
    await user.upload(moduleInput, new File(['[]'], 'notes.json', { type: 'application/json' }));
    expect(await screen.findByText('This file must be a JSON object.')).toBeInTheDocument();
  });

  it('the mount form renders the module parameter schema', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ModulesTab state={detail()} />, {
      client: client({
        listStateModules: vi.fn().mockResolvedValue([
          moduleDoc({
            parameters: { type: 'object', properties: { limit: { type: 'number' } } },
          }),
        ]),
      }),
    });
    const [mountBtn] = await screen.findAllByRole('button', { name: 'Mount module' });
    if (mountBtn === undefined) throw new Error('no Mount module button');
    await user.click(mountBtn);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Module'));
    await user.click(await screen.findByRole('option', { name: 'notes — A notes fragment' }));
    // The parameter field from the module schema renders.
    expect(await within(dialog).findByText('limit')).toBeInTheDocument();
  });

  it('a module upload that clashes prompts Replace and retries with replace=true', async () => {
    const user = userEvent.setup();
    const putStateModule = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('module_exists', 409))
      .mockResolvedValueOnce(moduleDoc());
    const { container } = renderWithProviders(<ModulesTab state={detail()} />, {
      client: client({ putStateModule }),
    });
    await screen.findByText('Module documents');
    const file = new File([JSON.stringify({ name: 'notes', schema: {} })], 'notes.json', {
      type: 'application/json',
    });
    await user.upload(lastFileInput(container), file);
    // The 409 opens the Replace confirm; a confirm retries with replace=true.
    await user.click(await screen.findByRole('button', { name: 'Replace module' }));
    await waitFor(() => {
      expect(putStateModule).toHaveBeenCalledTimes(2);
    });
    expect(putStateModule.mock.calls[0]?.[2]).toBe(false);
    expect(putStateModule.mock.calls[1]?.[2]).toBe(true);
  });

  it('a module upload clash cancelled fires no second PUT', async () => {
    const user = userEvent.setup();
    const putStateModule = vi.fn().mockRejectedValueOnce(new ApiError('module_exists', 409));
    const { container } = renderWithProviders(<ModulesTab state={detail()} />, {
      client: client({ putStateModule }),
    });
    await screen.findByText('Module documents');
    const file = new File([JSON.stringify({ name: 'notes', schema: {} })], 'notes.json', {
      type: 'application/json',
    });
    await user.upload(lastFileInput(container), file);
    await user.click(await screen.findByRole('button', { name: 'Keep existing' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    expect(putStateModule).toHaveBeenCalledTimes(1);
  });

  it('a failed module replace renders its error in the dialog', async () => {
    const user = userEvent.setup();
    const putStateModule = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('module_exists', 409))
      .mockRejectedValueOnce(new Error('replace denied'));
    const { container } = renderWithProviders(<ModulesTab state={detail()} />, {
      client: client({ putStateModule }),
    });
    await screen.findByText('Module documents');
    const file = new File([JSON.stringify({ name: 'notes', schema: {} })], 'notes.json', {
      type: 'application/json',
    });
    await user.upload(lastFileInput(container), file);
    await user.click(await screen.findByRole('button', { name: 'Replace module' }));
    expect(await screen.findByText('replace denied')).toBeInTheDocument();
  });

  it('the mount form renders the module declaration schema up front', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ModulesTab state={detail()} />, {
      client: client({
        listStateModules: vi.fn().mockResolvedValue([
          moduleDoc({
            declarations: { schema: { type: 'object', properties: { tag: { type: 'string' } } } },
          }),
        ]),
      }),
    });
    const [mountBtn] = await screen.findAllByRole('button', { name: 'Mount module' });
    if (mountBtn === undefined) throw new Error('no Mount module button');
    await user.click(mountBtn);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByLabelText('Module'));
    await user.click(await screen.findByRole('option', { name: 'notes — A notes fragment' }));
    // The Declarations group renders the module's declaration schema field.
    expect(await within(dialog).findByText('tag')).toBeInTheDocument();
  });

  it('Edit declarations renders the schema when the module declares fields', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ModulesTab
        state={detail([{ module: 'notes', path: [], parameters: {}, declarations: {} }])}
      />,
      {
        client: client({
          listStateModules: vi.fn().mockResolvedValue([
            moduleDoc({
              declarations: { schema: { type: 'object', properties: { tag: { type: 'string' } } } },
            }),
          ]),
        }),
      },
    );
    await user.click(await screen.findByRole('button', { name: 'Edit declarations' }));
    expect(await screen.findByText('tag')).toBeInTheDocument();
  });

  it('the mounts empty state action opens the mount dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ModulesTab state={detail()} />, { client: client() });
    const buttons = await screen.findAllByRole('button', { name: 'Mount module' });
    const emptyAction = buttons[1];
    if (emptyAction === undefined) throw new Error('no empty-state Mount module button');
    await user.click(emptyAction);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
});
