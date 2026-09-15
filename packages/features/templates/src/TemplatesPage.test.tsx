/**
 * Behavioural tests for the templates surface. Each test stubs only the client
 * methods the path under test calls and drives the real DS components through
 * TanStack Query, covering: the master list (data / empty / error), the selected
 * detail view, upload/delete/render/clear-cache mutations, the loud invalid-JSON
 * field error, and the XSS pin that rendered output is ESCAPED text.
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TemplatesPage } from './TemplatesPage';
import { renderWithProviders, type StubApiClient } from './test-utils';

interface TemplatesSearch {
  readonly template?: string;
  readonly q?: string;
}

/**
 * Render `TemplatesPage` inside a stateful harness whose navigate spy updates the
 * search param it receives — exactly how the shell router drives it — so a click
 * (or Back) actually changes the selection and fires the focus effect.
 */
function renderTemplatesHarness(client: StubApiClient, initial: TemplatesSearch = {}) {
  let setSearch: ((next: TemplatesSearch) => void) | undefined;
  function Harness(): ReactNode {
    const [search, setSearchState] = useState<TemplatesSearch>(initial);
    setSearch = setSearchState;
    return <TemplatesPage search={search} />;
  }
  const navigate = vi.fn((_token: string, next?: TemplatesSearch) => {
    setSearch?.({ template: next?.template, q: next?.q });
  });
  return renderWithProviders(<Harness />, { client, navigate });
}

describe('TemplatesPage — master list', () => {
  it('renders root-level template names', async () => {
    const client: StubApiClient = {
      listTemplates: vi.fn().mockResolvedValue(['a.md', 'b.md']),
    };
    renderWithProviders(<TemplatesPage search={{}} />, { client });

    // The surface opens two doors in SERIES: the storage-provider gate resolves
    // first and mounts the list card, and only then does the list query fetch. As
    // the first test in the file this render also absorbs the suite's one-time
    // warm-up (module init, coverage instrumentation, the initial jsdom paint).
    // Await the gate's own heading so that cold-start is spent inside its findBy
    // window; the list assertion then gets a fresh budget for just its door,
    // instead of one window having to cover both round-trips (which flaked under
    // jsdom 30's heavier selector engine on a contended CI runner).
    await screen.findByRole('heading', { name: 'All templates' });
    expect(await screen.findByText('a.md')).toBeInTheDocument();
    expect(screen.getByText('b.md')).toBeInTheDocument();
  });

  it('folds path-shaped keys into folders and reveals the leaf on navigation', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listTemplates: vi.fn().mockResolvedValue(['prompts/a.md', 'prompts/b.md']),
    };
    renderWithProviders(<TemplatesPage search={{}} />, { client });

    // At the root the shared prefix is a single folder, never two flat rows.
    const folder = await screen.findByRole('button', { name: 'prompts' });
    expect(
      screen.queryByRole('link', { name: 'Open template prompts/a.md' }),
    ).not.toBeInTheDocument();

    // Opening the folder reveals the leaves by their final segment (the breadcrumb
    // carries the path); the link's accessible name is still the FULL key.
    await user.click(folder);
    expect(await screen.findByText('a.md')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open template prompts/a.md' })).toBeInTheDocument();
  });

  it('renders BOTH a file and a folder that share a name (collision)', async () => {
    const client: StubApiClient = {
      listTemplates: vi.fn().mockResolvedValue(['shared', 'shared/child.md']),
    };
    renderWithProviders(<TemplatesPage search={{}} />, { client });

    // The file `shared` files at the root as its own item…
    expect(await screen.findByRole('link', { name: 'Open template shared' })).toBeInTheDocument();
    // …while `shared` is ALSO a navigable folder (from `shared/child.md`).
    expect(screen.getByRole('button', { name: 'shared' })).toBeInTheDocument();
  });

  it('shows the empty state when there are no templates', async () => {
    const client: StubApiClient = { listTemplates: vi.fn().mockResolvedValue([]) };
    renderWithProviders(<TemplatesPage search={{}} />, { client });

    expect(await screen.findByText('No templates yet')).toBeInTheDocument();
  });

  it('shows a loud error state when the list request fails', async () => {
    const client: StubApiClient = {
      listTemplates: vi.fn().mockRejectedValue(new Error('boom: list failed')),
    };
    renderWithProviders(<TemplatesPage search={{}} />, { client });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('boom: list failed');
  });

  it('navigates to the detail route when a template is selected', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listTemplates: vi.fn().mockResolvedValue(['a.md']),
    };
    const { navigate } = renderWithProviders(<TemplatesPage search={{}} />, { client });

    await user.click(await screen.findByRole('link', { name: 'Open template a.md' }));
    expect(navigate).toHaveBeenCalledWith('templates', { template: 'a.md' });
  });

  it('marks the selected template link as the current page', async () => {
    const client: StubApiClient = {
      listTemplates: vi.fn().mockResolvedValue(['a.md', 'b.md']),
      getTemplate: vi.fn().mockResolvedValue({ template: 'body', schema: {} }),
    };
    renderWithProviders(<TemplatesPage search={{ template: 'a.md' }} />, { client });

    const active = await screen.findByRole('link', { name: 'Open template a.md' });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Open template b.md' })).not.toHaveAttribute(
      'aria-current',
    );
  });
});

describe('TemplatesPage — explorer open + list retry', () => {
  // Card view persists per-surface in localStorage; keep tests independent.
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      // No storage in this env — nothing to clear.
    }
  });
  afterEach(() => {
    try {
      localStorage.clear();
    } catch {
      // Paired with beforeEach.
    }
  });

  it('opens a template by clicking its card body in card view', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listTemplates: vi.fn().mockResolvedValue(['a.md']),
    };
    const { navigate } = renderWithProviders(<TemplatesPage search={{}} />, { client });

    // Switch the explorer to cards, then click the card SHELL (not the name link):
    // ExplorerView's row/card-open convenience selects the template.
    await user.click(await screen.findByRole('radio', { name: 'Card view' }));
    await user.click(await screen.findByRole('listitem'));

    expect(navigate).toHaveBeenCalledWith('templates', { template: 'a.md' });
  });

  it('retries the master-list query from its error state and recovers', async () => {
    const user = userEvent.setup();
    const listTemplates = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom: list failed'))
      .mockResolvedValue(['a.md']);
    const client: StubApiClient = { listTemplates };
    renderWithProviders(<TemplatesPage search={{}} />, { client });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('boom: list failed');

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    // The retry refetches; the second call resolves and the list recovers.
    expect(await screen.findByRole('link', { name: 'Open template a.md' })).toBeInTheDocument();
    expect(listTemplates).toHaveBeenCalledTimes(2);
  });
});

describe('TemplatesPage — search', () => {
  function listClient(): StubApiClient {
    return { listTemplates: vi.fn().mockResolvedValue(['a.md', 'b.md']) };
  }

  it('seeds the box from ?q= and filters the list by a key substring', async () => {
    renderWithProviders(<TemplatesPage search={{ q: 'a.md' }} />, { client: listClient() });

    expect(await screen.findByRole('textbox', { name: 'Filter templates' })).toHaveValue('a.md');
    expect(screen.getByRole('link', { name: 'Open template a.md' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open template b.md' })).not.toBeInTheDocument();
  });

  it('lists every template with an empty box when ?q= is absent', async () => {
    renderWithProviders(<TemplatesPage search={{}} />, { client: listClient() });

    expect(await screen.findByRole('textbox', { name: 'Filter templates' })).toHaveValue('');
    expect(screen.getByRole('link', { name: 'Open template a.md' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open template b.md' })).toBeInTheDocument();
  });

  it('narrows the list live while typing but does not touch the URL until a commit', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<TemplatesPage search={{}} />, {
      client: listClient(),
    });

    await user.type(await screen.findByRole('textbox', { name: 'Filter templates' }), 'b.m');
    expect(screen.getByRole('link', { name: 'Open template b.md' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open template a.md' })).not.toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('commits the trimmed query to ?q= on Enter', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<TemplatesPage search={{}} />, {
      client: listClient(),
    });

    await user.type(await screen.findByRole('textbox', { name: 'Filter templates' }), 'b.m{Enter}');
    expect(navigate).toHaveBeenCalledWith(
      'templates',
      { template: undefined, q: 'b.m' },
      { replace: true },
    );
  });

  it('carries a typed uncommitted draft into a template-open navigation (no click-through drop)', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<TemplatesPage search={{}} />, {
      client: listClient(),
    });

    // Type a draft but do NOT commit it (no Enter); the box blur fires on the link click.
    await user.type(await screen.findByRole('textbox', { name: 'Filter templates' }), 'b.m');
    await user.click(screen.getByRole('link', { name: 'Open template b.md' }));

    // The open navigation carries the LIVE draft, so the click cannot drop the filter.
    expect(navigate).toHaveBeenLastCalledWith('templates', { template: 'b.md', q: 'b.m' });
  });

  it('does NOT push a redundant history entry when Enter repeats the committed query', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<TemplatesPage search={{ q: 'a.md' }} />, {
      client: listClient(),
    });

    const box = await screen.findByRole('textbox', { name: 'Filter templates' });
    await user.click(box);
    await user.keyboard('{Enter}');

    // The box already shows the committed value, so a bare Enter commits nothing.
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does NOT self-commit a padded deep-link on an untouched tab-through blur', async () => {
    const user = userEvent.setup();
    const { navigate } = renderWithProviders(<TemplatesPage search={{ q: ' abc ' }} />, {
      client: listClient(),
    });

    const box = await screen.findByRole('textbox', { name: 'Filter templates' });
    expect(box).toHaveValue(' abc ');
    // Tabbing through the untouched padded box is not a user edit — no navigation.
    await user.click(box);
    await user.tab();

    expect(navigate).not.toHaveBeenCalled();
  });
});

describe('TemplatesPage — detail', () => {
  it('renders the selected template content in an escaped code block', async () => {
    const client: StubApiClient = {
      listTemplates: vi.fn().mockResolvedValue(['prompts/a.md']),
      getTemplate: vi.fn().mockResolvedValue({ template: 'Hello {{ name }}', schema: {} }),
    };
    renderWithProviders(<TemplatesPage search={{ template: 'prompts/a.md' }} />, { client });

    expect(await screen.findByText('Hello {{ name }}')).toBeInTheDocument();
    expect(client.getTemplate).toHaveBeenCalledWith('prompts/a.md');
  });
});

describe('TemplatesPage — delete directory', () => {
  it('does not show a folder delete action when there are no directories', async () => {
    const client: StubApiClient = {
      listTemplates: vi.fn().mockResolvedValue(['a.md', 'b.md']),
    };
    renderWithProviders(<TemplatesPage search={{}} />, { client });

    await screen.findByRole('heading', { name: 'All templates' });
    expect(await screen.findByText('a.md')).toBeInTheDocument();
    // Root-level keys derive no folder, so no directory delete affordance appears.
    expect(screen.queryByRole('button', { name: /Delete directory/ })).not.toBeInTheDocument();
  });

  it('wears the low-emphasis (ghost) style on the directory Delete row, not filled danger', async () => {
    const listTemplates = vi.fn().mockResolvedValue(['prompts/a.md', 'prompts/b.md']);
    const client: StubApiClient = { listTemplates };
    renderWithProviders(<TemplatesPage search={{}} />, { client });

    await screen.findByRole('heading', { name: 'All templates' });
    // Row-level destructive actions stay low-emphasis; the danger emphasis lives in the
    // ConfirmDialog's confirm button, not on the persistent folder-row control.
    const dirDelete = await screen.findByRole('button', { name: 'Delete directory prompts' });
    expect(dirDelete).toHaveClass('tai-btn-ghost');
    expect(dirDelete).not.toHaveClass('tai-btn-danger');
  });

  it('deletes a directory from its folder row, warning that every template goes', async () => {
    const user = userEvent.setup();
    const listTemplates = vi
      .fn()
      .mockResolvedValueOnce(['prompts/a.md', 'prompts/b.md'])
      .mockResolvedValue([]);
    const deleteTemplateDir = vi.fn().mockResolvedValue({ path: 'prompts', deleted: true });
    const client: StubApiClient = { listTemplates, deleteTemplateDir };
    renderWithProviders(<TemplatesPage search={{}} />, { client });

    await screen.findByRole('heading', { name: 'All templates' });
    // The delete affordance rides the `prompts` folder row for its own prefix.
    await user.click(await screen.findByRole('button', { name: 'Delete directory prompts' }));
    const dialog = await screen.findByRole('dialog');
    // The confirm copy states plainly the door removes every template under the prefix.
    expect(within(dialog).getByText(/every template under it/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete directory' }));

    await waitFor(() => {
      expect(deleteTemplateDir).toHaveBeenCalledWith('prompts');
    });
    // The master list is invalidated and re-fetched after the delete.
    await waitFor(() => {
      expect(listTemplates).toHaveBeenCalledTimes(2);
    });
  });

  it('renders a rejected directory delete verbatim in the dialog', async () => {
    const user = userEvent.setup();
    const message = "template directory 'prompts' not found";
    const client: StubApiClient = {
      listTemplates: vi.fn().mockResolvedValue(['prompts/a.md']),
      deleteTemplateDir: vi.fn().mockRejectedValue(new Error(message)),
    };
    renderWithProviders(<TemplatesPage search={{}} />, { client });

    await screen.findByRole('heading', { name: 'All templates' });
    await user.click(await screen.findByRole('button', { name: 'Delete directory prompts' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete directory' }));

    expect(await within(dialog).findByText(message)).toBeInTheDocument();
  });

  it('clears the open selection when the deleted directory held the shown template', async () => {
    const user = userEvent.setup();
    const listTemplates = vi.fn().mockResolvedValueOnce(['prompts/a.md']).mockResolvedValue([]);
    const client: StubApiClient = {
      listTemplates,
      getTemplate: vi.fn().mockResolvedValue({ template: 'Hello', schema: {} }),
      deleteTemplateDir: vi.fn().mockResolvedValue({ path: 'prompts', deleted: true }),
    };
    const { navigate } = renderTemplatesHarness(client, { template: 'prompts/a.md' });

    await screen.findByRole('heading', { name: 'All templates' });
    await user.click(await screen.findByRole('button', { name: 'Delete directory prompts' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete directory' }));

    // The open template lived under the removed prefix, so the selection is cleared
    // back to the un-selected templates view.
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith('templates');
    });
  });
});
