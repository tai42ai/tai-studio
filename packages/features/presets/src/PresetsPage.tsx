/**
 * Presets page — a master/detail surface over the single-tier presets API. The
 * left pane is the presets table (`PresetsList`); selecting a row sets `?preset=`
 * (shell-owned routing via `AppLink`), which drives the right-pane detail
 * (`PresetDetail`: record, active baked kwargs, version history, save-version,
 * rollback, delete). Mirrors the tools page's `?tool=` master/detail shape.
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import {
  AppLink,
  ArrowLeftIcon,
  Card,
  EmptyState,
  PageHeader,
  useBreakpoint,
  type PageProps,
} from '@tai42/studio-sdk';

import { PresetsList } from './PresetsList';
import { PresetDetail } from './PresetDetail';

export function PresetsPage({ search }: PageProps<'presets'>): ReactNode {
  const selected = search.preset;
  const { isSinglePane } = useBreakpoint();
  // `list` shows the list full width; `detail` shows the split. Below 1024 it
  // collapses to the one pane the selection names.
  const pane = selected !== undefined ? 'detail' : 'list';

  // FOCUS MANAGEMENT (WCAG 2.4.3). Single-pane, selecting a row hides the list pane
  // that held the just-activated link, so focus must be moved deliberately or it drops
  // to <body>. Mirrors ToolsPage: seed the previous selection on MOUNT so an initial
  // `?preset=` deep-link never steals focus (focus follows a client-side change only).
  const listRef = useRef<HTMLDivElement>(null);
  const prevSelected = useRef<string | undefined>(selected);
  const headingNode = useRef<HTMLHeadingElement | null>(null);
  // True while a client-side selection waits for its detail heading to mount — the
  // preset record loads async, so the heading may not exist yet on the selection tick.
  const pendingFocus = useRef(false);

  // Callback ref threaded onto the detail's <h2>. When the heading mounts after a
  // client-side selection it pulls focus; on a deep-link mount `pendingFocus` is false,
  // so focus is never stolen. Cleared to null on unmount (Back), so it never goes stale.
  const setDetailHeading = useCallback((node: HTMLHeadingElement | null) => {
    headingNode.current = node;
    if (node !== null && pendingFocus.current) {
      pendingFocus.current = false;
      node.focus();
    }
  }, []);

  useEffect(() => {
    if (selected === prevSelected.current) return;
    const previous = prevSelected.current;
    prevSelected.current = selected;
    if (selected !== undefined) {
      // Moved INTO a selection → focus the detail heading. It is either already mounted
      // (focus it now) or still loading (focus it when its callback ref fires).
      if (headingNode.current !== null) {
        headingNode.current.focus();
      } else {
        pendingFocus.current = true;
      }
    } else if (previous !== undefined) {
      // Cleared (Back) → return focus to the list row it came from, matched inside the
      // list pane by the link's own accessible name.
      pendingFocus.current = false;
      listRef.current
        ?.querySelector<HTMLElement>(`[aria-label="Open preset ${previous}"]`)
        ?.focus();
    }
  }, [selected]);

  return (
    <div className="tai-stack tai-stack-6" data-testid="presets-page">
      <PageHeader
        title="Presets"
        eyebrow="Capabilities"
        description="Named, versioned tool presets — a base tool with fixed kwargs baked in."
      />

      <div className="tai-split" data-pane={pane}>
        <div className="tai-split-list" ref={listRef}>
          <PresetsList selected={selected} />
        </div>

        <div className="tai-split-detail">
          {isSinglePane && selected !== undefined ? (
            <AppLink to="presets" search={{}} className="tai-btn tai-btn-ghost">
              <ArrowLeftIcon />
              Back
            </AppLink>
          ) : null}
          {selected !== undefined ? (
            <PresetDetail key={selected} name={selected} headingRef={setDetailHeading} />
          ) : (
            <Card>
              <EmptyState
                title="No preset selected"
                description="Choose a preset from the list to view its versions and manage it."
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
