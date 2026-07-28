/**
 * Templates page. The master list comes from `api.listTemplates`; selecting
 * a name navigates to `templates?template=<id>` (shell-owned routing via
 * `AppLink`), which drives the detail panel. Also hosts the upload form and the
 * "clear cache" action. All server state flows through TanStack Query:
 * loading → `Skeleton`, empty → `EmptyState`, error → a loud `ErrorState`.
 */
import { useCallback, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AppLink,
  ArrowLeftIcon,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  Spinner,
  errorMessage,
  useApi,
  useBreakpoint,
  type PageProps,
} from '@tai42/studio-sdk';

import { TemplateDetail } from './TemplateDetail';
import { UploadTemplateForm } from './UploadTemplateForm';
import { templatesListKey } from './keys';

function TemplateList({ selected }: { selected: string | undefined }): ReactNode {
  const api = useApi();
  const query = useQuery({ queryKey: templatesListKey, queryFn: () => api.listTemplates() });

  if (query.isPending) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
        <Skeleton height={32} />
        <Skeleton height={32} />
        <Skeleton height={32} />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  }
  if (query.data.length === 0) {
    return (
      <EmptyState title="No templates yet" description="Upload a template to see it listed here." />
    );
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {query.data.map((name) => {
        const isActive = name === selected;
        const itemStyle: CSSProperties = {
          display: 'block',
          padding: 'var(--tai-space-2) var(--tai-space-3)',
          borderRadius: 'var(--tai-radius-md)',
          fontFamily: 'var(--tai-font-mono)',
          fontSize: 'var(--tai-text-md)',
          color: isActive ? 'var(--tai-color-accent-on-tint)' : 'var(--tai-color-text)',
          background: isActive ? 'var(--tai-color-accent-tint)' : 'transparent',
          textDecoration: 'none',
          wordBreak: 'break-all',
        };
        return (
          <li key={name}>
            <AppLink
              to="templates"
              search={{ template: name }}
              aria-label={`Open template ${name}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span style={itemStyle}>{name}</span>
            </AppLink>
          </li>
        );
      })}
    </ul>
  );
}

export function TemplatesPage({ search }: PageProps<'templates'>): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const selected = search.template;
  const { isSinglePane } = useBreakpoint();
  // Below 1024 the split collapses to one pane; the detail shows when a template
  // is selected, otherwise the list.
  const pane = selected !== undefined ? 'detail' : 'list';

  // FOCUS MANAGEMENT (WCAG 2.4.3). Single-pane, selecting a row hides the list pane
  // that held the just-activated link, so focus must be moved deliberately or it drops
  // to <body>. Mirrors ToolsPage: seed the previous selection on MOUNT so an initial
  // `?template=` deep-link never steals focus (focus follows a client-side change only).
  const listRef = useRef<HTMLDivElement>(null);
  const prevSelected = useRef<string | undefined>(selected);
  const headingNode = useRef<HTMLHeadingElement | null>(null);
  // True while a client-side selection waits for its detail heading to mount.
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
        ?.querySelector<HTMLElement>(`[aria-label="Open template ${previous}"]`)
        ?.focus();
    }
  }, [selected]);

  const clearCache = useMutation({
    mutationFn: () => api.clearTemplatesCache(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: templatesListKey });
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === 'template',
      });
    },
  });

  return (
    <div className="tai-stack tai-stack-6">
      <PageHeader
        title="Templates"
        eyebrow="Capabilities"
        actions={
          <Button
            onClick={() => {
              clearCache.mutate();
            }}
            disabled={clearCache.isPending}
          >
            {clearCache.isPending ? <Spinner label="Clearing cache" /> : null}
            Clear cache
          </Button>
        }
      />

      {clearCache.isError ? <ErrorState message={errorMessage(clearCache.error)} /> : null}

      <div className="tai-split" data-pane={isSinglePane ? pane : undefined}>
        <div className="tai-split-list" ref={listRef}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-6)' }}>
            <Card>
              <h2 className="tai-card-title">All templates</h2>
              <TemplateList selected={selected} />
            </Card>
            <UploadTemplateForm />
          </div>
        </div>

        <div className="tai-split-detail">
          {isSinglePane && selected !== undefined ? (
            <AppLink to="templates" search={{}} className="tai-btn tai-btn-ghost">
              <ArrowLeftIcon />
              Back
            </AppLink>
          ) : null}
          {selected !== undefined ? (
            <TemplateDetail templateId={selected} headingRef={setDetailHeading} />
          ) : (
            <Card>
              <EmptyState
                title="No template selected"
                description="Choose a template from the list to view and render it."
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
