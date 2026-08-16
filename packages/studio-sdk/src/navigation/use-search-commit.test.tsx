import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { NavigationProvider } from './context';
import type { NavigationContextValue, RouteSearch } from './types';
import { useSearchCommit } from './use-search-commit';

const LABEL = 'Filter tools';

function makeNav(navigate: NavigationContextValue['navigate']): NavigationContextValue {
  return {
    navigate,
    resolvePath: () => '/x',
    navigatePlugin: vi.fn(),
    resolvePluginPath: () => '/x',
  };
}

/** A minimal filter box wired to the hook: a container the delegation binds to and a
 *  controlled input carrying the live draft. */
function Box({ committedValue }: { readonly committedValue: string }) {
  const [draft, setDraft] = useState(committedValue);
  const containerRef = useRef<HTMLDivElement>(null);
  const buildSearch = useCallback((q: string | undefined): RouteSearch<'tools'> => ({ q }), []);
  useSearchCommit({
    token: 'tools',
    containerRef,
    searchLabel: LABEL,
    committedValue,
    draft,
    buildSearch,
    containerMissingError: 'container ref did not attach',
  });
  return (
    <div ref={containerRef}>
      <input
        aria-label={LABEL}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
      />
    </div>
  );
}

function renderBox(committedValue: string, navigate: NavigationContextValue['navigate']) {
  return render(
    <NavigationProvider value={makeNav(navigate)}>
      <Box committedValue={committedValue} />
    </NavigationProvider>,
  );
}

describe('useSearchCommit', () => {
  it('commits the trimmed draft on Enter, replacing the history entry', async () => {
    const navigate = vi.fn();
    renderBox('', navigate);
    await userEvent.type(screen.getByRole('textbox'), 'abc{Enter}');
    expect(navigate).toHaveBeenCalledWith('tools', { q: 'abc' }, { replace: true });
  });

  it('commits the draft on an edited blur, replacing the history entry', async () => {
    const navigate = vi.fn();
    renderBox('', navigate);
    await userEvent.type(screen.getByRole('textbox'), 'abc');
    await userEvent.tab();
    expect(navigate).toHaveBeenCalledWith('tools', { q: 'abc' }, { replace: true });
  });

  it('suppresses a redundant commit when the draft already equals the committed value', async () => {
    const navigate = vi.fn();
    renderBox('abc', navigate);
    await userEvent.click(screen.getByRole('textbox'));
    await userEvent.keyboard('{Enter}');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('maps an emptied box to an undefined query on commit', async () => {
    const navigate = vi.fn();
    renderBox('abc', navigate);
    const box = screen.getByRole('textbox');
    await userEvent.clear(box);
    await userEvent.keyboard('{Enter}');
    expect(navigate).toHaveBeenCalledWith('tools', { q: undefined }, { replace: true });
  });
});
