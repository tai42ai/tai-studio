/**
 * Responsive master/detail focus tests for the presets page. Below 1024
 * (`useBreakpoint().isSinglePane`) selecting a row hides the list pane that held
 * the just-activated link, so focus must be MOVED deliberately: onto the detail
 * heading when a preset is selected, and back onto the originating row on Back —
 * otherwise focus drops to <body> (WCAG 2.4.3). A deep-link that arrives already
 * selected must NOT steal focus on load. The detail record loads async, so the
 * heading takes focus as soon as it mounts, not only on the selection tick.
 */
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PresetRecord } from '@tai42/api-client';

import { PresetsPage } from './PresetsPage';
import { renderWithProviders, type StubApiClient } from './test-utils';

afterEach(() => {
  vi.unstubAllGlobals();
});

function record(name: string): PresetRecord {
  return {
    name,
    base_tool: 'weather',
    description: 'A preset',
    active_version: 1,
    extensions: [],
    output_schema: null,
    conflicted: false,
    conflicted_reason: null,
    uses: [],
    used_by: [],
  };
}

/** A client that can drive the master list and a full detail pane. */
function detailClient(names: readonly string[] = ['paris']): StubApiClient {
  return {
    listPresets: vi.fn().mockResolvedValue(names.map(record)),
    getPreset: vi.fn().mockImplementation((name: string) => Promise.resolve(record(name))),
    listPresetVersions: vi.fn().mockResolvedValue([]),
    listToolMeta: vi.fn().mockResolvedValue({ folders: [], meta: [] }),
  };
}

interface PresetsSearch {
  readonly preset?: string;
}

/**
 * Render `PresetsPage` inside a stateful harness whose navigate spy updates the
 * search param it receives — exactly how the shell router drives it — so a click
 * (or Back) actually changes the selection and fires the focus effect.
 */
function renderPresetsHarness(client: StubApiClient, initial: PresetsSearch = {}) {
  let setSearch: ((next: PresetsSearch) => void) | undefined;
  function Harness(): ReactNode {
    const [search, setSearchState] = useState<PresetsSearch>(initial);
    setSearch = setSearchState;
    return <PresetsPage search={search} />;
  }
  const navigate = vi.fn((_token: string, next?: PresetsSearch) => {
    setSearch?.({ preset: next?.preset });
  });
  return renderWithProviders(<Harness />, { client, navigate });
}

/** Force `useBreakpoint` into the single-pane band (below 1024, not phone). */
function stubSinglePane(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query !== '(max-width: 639px)',
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }));
}

describe('PresetsPage — responsive master/detail focus', () => {
  it('moves focus to the detail heading when a preset is selected (client-side change)', async () => {
    const user = userEvent.setup();
    renderPresetsHarness(detailClient(['paris']));

    await user.click(await screen.findByRole('link', { name: 'Open custom node paris' }));

    const heading = await screen.findByRole('heading', { level: 2, name: /paris/ });
    await waitFor(() => {
      expect(heading).toHaveFocus();
    });
  });

  it('does NOT steal focus on an initial deep-link mount (focus follows changes only)', async () => {
    renderPresetsHarness(detailClient(['paris']), { preset: 'paris' });

    const heading = await screen.findByRole('heading', { level: 2, name: /paris/ });
    // The heading exists and is focusable, but a page opened straight at
    // `?preset=paris` must not yank focus onto it on load.
    expect(heading).not.toHaveFocus();
    expect(document.body).toHaveFocus();
  });

  it('returns focus to the originating row on Back (single-pane)', async () => {
    const user = userEvent.setup();
    stubSinglePane();
    renderPresetsHarness(detailClient(['paris']), { preset: 'paris' });

    // Single-pane with a selection → the detail pane shows a Back control.
    const back = await screen.findByRole('link', { name: 'Back' });
    await user.click(back);

    // The selection clears (the no-selection state returns).
    expect(await screen.findByText('No custom node selected')).toBeInTheDocument();
    // Focus returns to the originating list row.
    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Open custom node paris' })).toHaveFocus();
    });
  });
});
