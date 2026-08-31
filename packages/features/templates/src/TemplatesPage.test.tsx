/**
 * Behavioural tests for the templates surface. Each test stubs only the client
 * methods the path under test calls and drives the real DS components through
 * TanStack Query, covering: the master list (data / empty / error), the selected
 * detail view, upload/delete/render/clear-cache mutations, the loud invalid-JSON
 * field error, and the XSS pin that rendered output is ESCAPED text.
 */
import { useState, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

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

describe('TemplatesPage — storage-provider gate', () => {
  it('shows the marketplace pointer, not the 500, when no storage provider is installed', async () => {
    const listTemplates = vi.fn().mockRejectedValue(new Error('no storage provider'));
    const client: StubApiClient = {
      listTemplates,
      getStorageInfo: vi.fn().mockResolvedValue({ present: false, provider: null, module: null }),
    };
    renderWithProviders(<TemplatesPage search={{}} />, { client });

    expect(await screen.findByText('Templates need a storage-provider plugin')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse marketplace' })).toBeInTheDocument();
    // The gate is upstream of the template doors, so the list is never requested and
    // the meaningless clear-cache action is withheld.
    expect(listTemplates).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Clear cache' })).not.toBeInTheDocument();
  });

  it('surfaces a loud error when the storage-info door itself fails', async () => {
    const client: StubApiClient = {
      getStorageInfo: vi.fn().mockRejectedValue(new Error('boom: storage door failed')),
    };
    renderWithProviders(<TemplatesPage search={{}} />, { client });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('boom: storage door failed');
  });

  it('retries the storage-info door and recovers the surface on success', async () => {
    const user = userEvent.setup();
    const getStorageInfo = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom: storage door failed'))
      .mockResolvedValue({ present: true, provider: 'fs', module: 'fs.mod' });
    const client: StubApiClient = {
      getStorageInfo,
      listTemplates: vi.fn().mockResolvedValue(['a.md']),
    };
    renderWithProviders(<TemplatesPage search={{}} />, { client });

    // The first door failure is loud; its Retry refetches and, now that the
    // provider is present, the gate opens to the real templates surface.
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('boom: storage door failed');
    await user.click(screen.getByRole('button', { name: 'Retry' }));

    // The surface's card heading (the explorer breadcrumb root shares the label, so
    // target the heading specifically).
    expect(await screen.findByRole('heading', { name: 'All templates' })).toBeInTheDocument();
    expect(await screen.findByText('a.md')).toBeInTheDocument();
    expect(getStorageInfo).toHaveBeenCalledTimes(2);
  });
});

describe('TemplatesPage — upload', () => {
  it('uploads a template and invalidates the list', async () => {
    const user = userEvent.setup();
    const listTemplates = vi.fn().mockResolvedValue([]);
    const uploadTemplate = vi.fn().mockResolvedValue({ path: 'prompts/new.md', uploaded: true });
    const client: StubApiClient = { listTemplates, uploadTemplate };
    renderWithProviders(<TemplatesPage search={{}} />, { client });

    await screen.findByText('No templates yet');
    await user.type(screen.getByLabelText('Path'), 'prompts/new.md');
    await user.type(screen.getByLabelText('Content'), 'Body text');
    await user.click(screen.getByRole('button', { name: 'Upload' }));

    await waitFor(() => {
      expect(uploadTemplate).toHaveBeenCalledWith('prompts/new.md', 'Body text');
    });
    // Invalidation refetches the list: the first call was the initial load.
    await waitFor(() => {
      expect(listTemplates.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('TemplatesPage — delete', () => {
  it('deletes the selected template behind a confirm dialog', async () => {
    const user = userEvent.setup();
    const deleteTemplate = vi.fn().mockResolvedValue({ path: 'prompts/a.md', deleted: true });
    const client: StubApiClient = {
      listTemplates: vi.fn().mockResolvedValue(['prompts/a.md']),
      getTemplate: vi.fn().mockResolvedValue({ template: 'body', schema: {} }),
      deleteTemplate,
    };
    const { navigate } = renderWithProviders(
      <TemplatesPage search={{ template: 'prompts/a.md' }} />,
      { client },
    );

    await screen.findByText('body');
    expect(deleteTemplate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Delete template' }));

    await waitFor(() => {
      expect(deleteTemplate).toHaveBeenCalledWith('prompts/a.md');
    });
    // The provider forwards `navigate('templates')` to the shell as
    // `(token, search)` with search undefined (clearing `?template=`).
    expect(navigate).toHaveBeenCalledWith('templates');
  });
});

describe('TemplatesPage — render preview', () => {
  it('renders the preview output on valid kwargs', async () => {
    const user = userEvent.setup();
    const renderTemplate = vi.fn().mockResolvedValue({ rendered: 'Hello Ada' });
    const client: StubApiClient = {
      listTemplates: vi.fn().mockResolvedValue(['prompts/a.md']),
      getTemplate: vi.fn().mockResolvedValue({ template: 'Hello {{ name }}', schema: {} }),
      renderTemplate,
    };
    renderWithProviders(<TemplatesPage search={{ template: 'prompts/a.md' }} />, { client });

    const kwargs = await screen.findByLabelText('Keyword arguments (JSON)');
    await user.clear(kwargs);
    await user.type(kwargs, '{{"name": "Ada"}');
    await user.click(screen.getByRole('button', { name: 'Render' }));

    await waitFor(() => {
      expect(renderTemplate).toHaveBeenCalledWith({
        template_id: 'prompts/a.md',
        kwargs: { name: 'Ada' },
      });
    });
    expect(await screen.findByText('Hello Ada')).toBeInTheDocument();
  });

  it('shows a loud field error on invalid kwargs JSON and never calls renderTemplate', async () => {
    const user = userEvent.setup();
    const renderTemplate = vi.fn();
    const client: StubApiClient = {
      listTemplates: vi.fn().mockResolvedValue(['prompts/a.md']),
      getTemplate: vi.fn().mockResolvedValue({ template: 'Hello', schema: {} }),
      renderTemplate,
    };
    renderWithProviders(<TemplatesPage search={{ template: 'prompts/a.md' }} />, { client });

    const kwargs = await screen.findByLabelText('Keyword arguments (JSON)');
    await user.clear(kwargs);
    await user.type(kwargs, 'not json');
    await user.click(screen.getByRole('button', { name: 'Render' }));

    expect(await screen.findByText(/Invalid JSON/)).toBeInTheDocument();
    expect(renderTemplate).not.toHaveBeenCalled();
  });

  it('renders script-bearing output as escaped text (XSS pin)', async () => {
    const user = userEvent.setup();
    const payload = '<script>alert(1)</script>';
    const client: StubApiClient = {
      listTemplates: vi.fn().mockResolvedValue(['prompts/a.md']),
      getTemplate: vi.fn().mockResolvedValue({ template: 'body', schema: {} }),
      renderTemplate: vi.fn().mockResolvedValue({ rendered: payload }),
    };
    const { container } = renderWithProviders(
      <TemplatesPage search={{ template: 'prompts/a.md' }} />,
      { client },
    );

    await screen.findByText('body');
    await user.click(screen.getByRole('button', { name: 'Render' }));

    // The payload appears verbatim as text (proving it was escaped, not parsed),
    // and no real <script> element was injected into the tree.
    expect(await screen.findByText(payload)).toBeInTheDocument();
    expect(container.querySelector('script')).toBeNull();
  });
});

describe('TemplatesPage — clear cache', () => {
  it('calls clearTemplatesCache when the button is clicked', async () => {
    const user = userEvent.setup();
    const clearTemplatesCache = vi.fn().mockResolvedValue({ cleared: true });
    const client: StubApiClient = {
      listTemplates: vi.fn().mockResolvedValue([]),
      clearTemplatesCache,
    };
    renderWithProviders(<TemplatesPage search={{}} />, { client });

    await user.click(await screen.findByRole('button', { name: 'Clear cache' }));
    await waitFor(() => {
      expect(clearTemplatesCache).toHaveBeenCalledTimes(1);
    });
  });
});

describe('TemplatesPage — single-pane (compact band)', () => {
  beforeEach(() => {
    // jsdom has no matchMedia, which pins useBreakpoint at the `full` band. A
    // fake driven off an 800px viewport reports the `compact` band, so the split
    // collapses to one pane and the detail carries a Back control.
    const width = 800;
    globalThis.matchMedia = (query: string): MediaQueryList => {
      const match = /max-width:\s*(\d+)/.exec(query);
      const matches = match !== null && width <= Number(match[1]);
      return {
        matches,
        media: query,
        addEventListener: () => {
          // Fixed viewport: the band never changes, so no listener is needed.
        },
        removeEventListener: () => {
          // Paired with the no-op addEventListener above.
        },
      } as unknown as MediaQueryList;
    };
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'matchMedia');
  });

  it('collapses to the detail pane with a Back control when a template is selected', async () => {
    const client: StubApiClient = {
      listTemplates: vi.fn().mockResolvedValue(['prompts/a.md']),
      getTemplate: vi.fn().mockResolvedValue({ template: 'body', schema: {} }),
    };
    renderWithProviders(<TemplatesPage search={{ template: 'prompts/a.md' }} />, { client });

    const back = await screen.findByRole('link', { name: 'Back' });
    expect(back).toBeInTheDocument();
  });

  it('moves focus to the detail heading when a template is selected (client-side change)', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      listTemplates: vi.fn().mockResolvedValue(['a.md']),
      getTemplate: vi.fn().mockResolvedValue({ template: 'body', schema: {} }),
    };
    renderTemplatesHarness(client);

    await user.click(await screen.findByRole('link', { name: 'Open template a.md' }));

    const heading = await screen.findByRole('heading', { level: 2, name: 'a.md' });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
  });

  it('does NOT steal focus on an initial deep-link mount (focus follows changes only)', async () => {
    const client: StubApiClient = {
      listTemplates: vi.fn().mockResolvedValue(['prompts/a.md']),
      getTemplate: vi.fn().mockResolvedValue({ template: 'body', schema: {} }),
    };
    renderTemplatesHarness(client, { template: 'prompts/a.md' });

    const heading = await screen.findByRole('heading', { level: 2, name: 'prompts/a.md' });
    // A page opened straight at `?template=…` must not yank focus onto the heading.
    expect(heading).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  it('returns focus to the originating row on Back', async () => {
    const user = userEvent.setup();
    const client: StubApiClient = {
      // A root-level key so the originating row sits at the top of the list (a
      // path-shaped key would fold into a folder, hiding the leaf until navigated).
      listTemplates: vi.fn().mockResolvedValue(['a.md']),
      getTemplate: vi.fn().mockResolvedValue({ template: 'body', schema: {} }),
    };
    renderTemplatesHarness(client, { template: 'a.md' });

    const back = await screen.findByRole('link', { name: 'Back' });
    await user.click(back);

    // The selection clears (the no-selection state returns).
    expect(await screen.findByText('No template selected')).toBeInTheDocument();
    // Focus returns to the originating list row.
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Open template a.md' })).toHaveFocus();
    });
  });
});
