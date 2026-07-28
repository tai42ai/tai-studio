/**
 * The shell's route-change focus manager has ONE job and one invariant:
 *
 *   - A genuine cross-pathname PUSH (a nav-link activation) moves focus to the
 *     destination page's <h1>, so a keyboard/screen-reader user lands on the new
 *     screen's heading rather than being stranded at the activated link.
 *   - Everything else must leave focus alone: a deep-link mount, a Back/Forward
 *     history traversal, a replace-navigation, AND — the subtle one — a
 *     SAME-pathname search-only PUSH (e.g. opening a tool on `/tools?tool=…`),
 *     which the feature screen owns focus for.
 *
 * The bug these tests pin: a same-pathname search-only PUSH used to set the
 * "focus the next heading" flag even though the pathname-keyed consumer never
 * runs (the pathname did not change), STRANDING the flag until the next real
 * pathname change consumed it — including a Back, which must never move focus.
 * So on `/tools`, selecting a tool (same-path search PUSH) then pressing Back
 * twice to the Dashboard used to yank focus onto the Dashboard <h1> on a BACK.
 */
import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';

import { installServer, renderStudio, server, type HarnessResult } from './test-harness';

installServer();

// The authenticated shell eagerly runs the plugin load pass (GET /api/plugins)
// and the two feature pages under test fetch their own lists; the strict
// onUnhandledRequest guard needs an answer for each. The Dashboard's metrics
// come from the harness default.
const okPlugins = http.get('*/api/plugins', () => HttpResponse.json({ data: [] }));
const okTools = http.get('*/api/tools', () => HttpResponse.json({ data: ['alpha', 'beta'] }));
const okToolTags = http.get('*/api/tools/tags', () => HttpResponse.json({ data: [] }));

function useShellHandlers(): void {
  server.use(okPlugins, okTools, okToolTags);
}

/** Flush pending animation frames + timers so the rAF-deferred focus move (or its
 * absence) has definitively happened before we assert. jsdom backs rAF with a
 * ~16ms timer, so a short real delay inside `act` drains it. */
async function settleFrames(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

function dashboardHeading(): HTMLElement {
  return screen.getByRole('heading', { level: 1, name: 'Dashboard' });
}
function toolsHeading(): HTMLElement {
  return screen.getByRole('heading', { level: 1, name: 'Tools' });
}

async function pushTo(shell: HarnessResult, to: '/tools' | '/observability'): Promise<void> {
  await act(async () => {
    await shell.studio.router.navigate({ to });
  });
}

describe('the shell route-change focus manager', () => {
  it('does NOT move focus to the <h1> when a same-pathname search PUSH is followed by a Back to a different pathname (the stranding)', async () => {
    useShellHandlers();
    const shell = renderStudio({ initialPath: '/observability', sessionKey: 'k-focus-strand' });
    await waitFor(() => expect(dashboardHeading()).toBeInTheDocument());

    // A genuine cross-pathname PUSH to /tools focuses the Tools <h1> (expected).
    await pushTo(shell, '/tools');
    await waitFor(() => expect(toolsHeading()).toHaveFocus());

    // A SAME-pathname search-only PUSH — the row-click that sets `?tags=…` (the
    // `?tool=…` selection is the same shape). Pathname stays `/tools`, so the
    // pathname-keyed focus consumer does not run; the buggy shell strands the flag.
    await act(async () => {
      await shell.studio.router.navigate({ to: '/tools', search: { tags: ['ghost'] } });
    });
    // Focus stays on the Tools heading — the search PUSH did not move it.
    await settleFrames();

    // Back off the search entry (still /tools → /tools: same pathname).
    await act(async () => {
      shell.studio.router.history.back();
    });
    // Back again, now crossing pathname /tools → /observability (the Dashboard).
    await act(async () => {
      shell.studio.router.history.back();
    });
    await waitFor(() => expect(dashboardHeading()).toBeInTheDocument());
    await settleFrames();

    // The invariant: a BACK must not move focus. The stranded flag must NOT have
    // been consumed here to yank focus onto the Dashboard heading.
    expect(dashboardHeading()).not.toHaveFocus();
  });

  it('never moves focus on a Back or a Forward (the history-traversal invariant)', async () => {
    useShellHandlers();
    const shell = renderStudio({ initialPath: '/observability', sessionKey: 'k-focus-invariant' });
    await waitFor(() => expect(dashboardHeading()).toBeInTheDocument());

    await pushTo(shell, '/tools');
    await waitFor(() => expect(toolsHeading()).toHaveFocus());

    // BACK to the Dashboard — focus must not follow.
    await act(async () => {
      shell.studio.router.history.back();
    });
    await waitFor(() => expect(dashboardHeading()).toBeInTheDocument());
    await settleFrames();
    expect(dashboardHeading()).not.toHaveFocus();

    // FORWARD back to Tools — focus must not follow.
    await act(async () => {
      shell.studio.router.history.forward();
    });
    await waitFor(() => expect(toolsHeading()).toBeInTheDocument());
    await settleFrames();
    expect(toolsHeading()).not.toHaveFocus();
  });

  it('DOES move focus to the destination <h1> on a genuine cross-pathname PUSH (preserved behavior)', async () => {
    useShellHandlers();
    const shell = renderStudio({ initialPath: '/observability', sessionKey: 'k-focus-push' });
    await waitFor(() => expect(dashboardHeading()).toBeInTheDocument());

    await pushTo(shell, '/tools');

    await waitFor(() => expect(toolsHeading()).toHaveFocus());
  });

  it('does NOT steal focus on a deep-link mount (initial load owns nothing)', async () => {
    useShellHandlers();
    renderStudio({ initialPath: '/tools', sessionKey: 'k-focus-deeplink' });
    await waitFor(() => expect(toolsHeading()).toBeInTheDocument());
    await settleFrames();

    expect(toolsHeading()).not.toHaveFocus();
  });
});
