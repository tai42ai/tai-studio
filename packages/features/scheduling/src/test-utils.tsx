/**
 * Shared test harness: render a feature tree inside the exact provider stack the
 * shell supplies at runtime — a fresh QueryClient (retries off so a rejected query
 * surfaces the error state immediately), the typed API client, the theme, and a
 * stub navigation context.
 */
import type { ApiClient, ScheduleItem } from '@tai42/api-client';
import { ApiProvider, NavigationProvider, ThemeProvider } from '@tai42/studio-sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement, ReactNode } from 'react';
import { expect, vi } from 'vitest';

export interface ProviderOptions extends Omit<RenderOptions, 'wrapper'> {
  readonly client: ApiClient;
}

export function renderWithProviders(ui: ReactNode, options: ProviderOptions): RenderResult {
  const { client, ...renderOptions } = options;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      <QueryClientProvider client={queryClient}>
        <ApiProvider value={client}>
          <ThemeProvider>
            <NavigationProvider
              value={{
                navigate: vi.fn(),
                resolvePath: () => '/x',
                navigatePlugin: vi.fn(),
                resolvePluginPath: () => '/x',
              }}
            >
              {children}
            </NavigationProvider>
          </ThemeProvider>
        </ApiProvider>
      </QueryClientProvider>
    );
  }

  return render(ui as ReactElement, { wrapper: Wrapper, ...renderOptions });
}

/**
 * Build a mock `ApiClient` from a partial set of methods; the feature only ever
 * touches the scheduling seams, so unstubbed methods are irrelevant to these
 * tests (a call to one that was not provided throws, surfacing the omission).
 *
 * The add dialog's picker enriches with the tool tags + tool_meta overlay to drop
 * effective-hidden tools; those two reads are best-effort, so they get a benign
 * empty default here and a test overrides them only when it exercises the exclusion.
 */
export function makeClient(overrides: Partial<ApiClient>): ApiClient {
  return {
    listToolTags: vi.fn(() => Promise.resolve([])),
    listToolMeta: vi.fn(() => Promise.resolve({ folders: [], meta: [] })),
    ...overrides,
  } as ApiClient;
}

/**
 * A redacted schedule fixture (schedules are secret-bearing — `kwargs` can embed
 * credentials — so these are hand-authored, never auto-captured).
 */
export function schedule(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    name: 'nightly-report',
    enabled: true,
    schedule: { __type: 'crontab', minute: '0', hour: '2' },
    kwargs: { backend_tool_name: 'run_report_schedule_task' },
    ...overrides,
  };
}

/**
 * The nearest concrete `pointer-events` declaration blocks interaction — walking
 * from `element` up, the first ancestor that declares a real value decides, and
 * `none` there means blocked. This is the exact gate user-event asserts before a
 * pointer interaction, so a control that clears it here cannot then throw.
 */
function pointerEventsBlocked(element: Element): boolean {
  const view = element.ownerDocument.defaultView ?? globalThis;
  for (let el: Element | null = element; el?.ownerDocument; el = el.parentElement) {
    const declared = view.getComputedStyle(el).pointerEvents;
    if (declared && declared !== 'inherit' && declared !== 'unset') {
      return declared === 'none';
    }
  }
  return false;
}

/**
 * Clicks a control once it is truly interactable. A Radix Dialog marks the rest of
 * the page inert the moment it opens — `pointer-events: none` on `document.body` —
 * and re-enables its own panel on a following commit; a click fired in that gap
 * lands on a control that still inherits `pointer-events: none`, which user-event
 * refuses. Awaiting both the enabled state and a cleared pointer-events gate closes
 * that window, so a dialog button clicked right after the dialog opens (or right
 * after a mutation re-enables it) is deterministic rather than timing-dependent.
 */
export async function clickWhenInteractable(
  user: ReturnType<typeof userEvent.setup>,
  element: HTMLElement,
): Promise<void> {
  await waitFor(() => {
    expect(element).toBeEnabled();
    expect(pointerEventsBlocked(element)).toBe(false);
  });
  await user.click(element);
}
