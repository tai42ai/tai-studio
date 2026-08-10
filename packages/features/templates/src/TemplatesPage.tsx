/**
 * Templates page. The master list comes from `api.listTemplates`; selecting
 * a name navigates to `templates?template=<id>` (shell-owned routing via
 * `AppLink`), which drives the detail panel. Also hosts the upload form and the
 * "clear cache" action. All server state flows through TanStack Query:
 * loading → `Skeleton`, empty → `EmptyState`, error → a loud `ErrorState`.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AppLink,
  ArrowLeftIcon,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ExplorerView,
  PageHeader,
  Skeleton,
  Spinner,
  TD,
  errorMessage,
  useApi,
  useAppNavigate,
  useBreakpoint,
  type ExplorerColumn,
  type ExplorerEmptyStates,
  type PageProps,
} from '@tai42/studio-sdk';

import { TemplateDetail } from './TemplateDetail';
import { UploadTemplateForm } from './UploadTemplateForm';
import { deriveTemplateFolders, templateFolderId, templateLabel } from './folders';
import { storageInfoKey, templatesListKey } from './keys';

/** The explorer's list/card view-mode persistence key. */
const TEMPLATES_VIEW_SURFACE = 'templates';

/** The templates table's single column; folder rows span it. */
const COLUMNS: ExplorerColumn[] = [{ key: 'template', header: 'Template' }];

const EMPTY_STATES: ExplorerEmptyStates = {
  empty: {
    title: 'No templates yet',
    description: 'Upload a template to see it listed here.',
  },
  emptyFolder: {
    title: 'This directory is empty',
    description: 'No templates are filed here.',
  },
  noMatch: {
    title: 'No matching templates',
    description: 'No template in this directory matches.',
  },
};

/** One template row/card body: its final-segment label as an `AppLink` setting
 *  `?template=` to the FULL key (the breadcrumb carries the folder path). */
function TemplateLink({
  templateKey,
  selected,
}: {
  readonly templateKey: string;
  readonly selected: boolean;
}): ReactNode {
  return (
    <AppLink
      to="templates"
      search={{ template: templateKey }}
      aria-label={`Open template ${templateKey}`}
      aria-current={selected ? 'page' : undefined}
      className="tai-nav-item"
    >
      <span className="tai-mono">{templateLabel(templateKey)}</span>
    </AppLink>
  );
}

function TemplateList({ selected }: { selected: string | undefined }): ReactNode {
  const api = useApi();
  const navigate = useAppNavigate();
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
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

  // Template keys are path-shaped, so they fold into virtual folders exactly as
  // storage/tools resources do — a `''` folder never appears (malformed keys file
  // literally at the root) and a name that is both a file and a folder shows as both.
  const keys = query.data;
  const renderLink = (key: string): ReactNode => (
    <TemplateLink templateKey={key} selected={key === selected} />
  );

  return (
    <ExplorerView<string>
      items={keys}
      getItemKey={(key) => key}
      getFolderId={templateFolderId}
      folders={deriveTemplateFolders(keys)}
      currentFolderId={currentFolderId}
      onNavigate={setCurrentFolderId}
      rootLabel="All templates"
      viewSurface={TEMPLATES_VIEW_SURFACE}
      label="Templates"
      columns={COLUMNS}
      renderRow={(key) => <TD className="tai-table-id">{renderLink(key)}</TD>}
      renderCard={(key) => <Card interactive>{renderLink(key)}</Card>}
      // Open == select in this master/detail; a click anywhere on the row/card sets
      // `?template=`, mirroring the name link (the SDK yields to that link so neither
      // double-fires).
      onOpenItem={(key) => {
        navigate('templates', { template: key });
      }}
      emptyStates={EMPTY_STATES}
    />
  );
}

export function TemplatesPage({ search }: PageProps<'templates'>): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const selected = search.template;
  const { isSinglePane } = useBreakpoint();
  // Templates are stored through a storage-provider plugin; with none installed the
  // template doors 500. Gate the surface on the same storage-presence signal the
  // storage page reads (`present: false` is a 200, not an error), so a missing
  // provider shows a pointer to the marketplace instead of a loud failure. A real
  // storage-info failure stays loud below.
  const storage = useQuery({
    queryKey: storageInfoKey,
    queryFn: ({ signal }) => api.getStorageInfo(signal),
  });
  const storageReady = storage.data?.present === true;
  // `list` shows the list full width; `detail` shows the split. Below 1024 it
  // collapses to the one pane the selection names.
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
          storageReady ? (
            <Button
              onClick={() => {
                clearCache.mutate();
              }}
              disabled={clearCache.isPending}
            >
              {clearCache.isPending ? <Spinner label="Clearing cache" /> : null}
              Clear cache
            </Button>
          ) : undefined
        }
      />

      {clearCache.isError ? <ErrorState message={errorMessage(clearCache.error)} /> : null}

      {storage.isPending ? (
        <Skeleton height={96} />
      ) : storage.isError ? (
        <ErrorState message={errorMessage(storage.error)} onRetry={() => void storage.refetch()} />
      ) : !storage.data.present ? (
        <Card>
          <EmptyState
            title="Templates need a storage-provider plugin"
            description="Templates are stored through a storage-provider plugin. Install one from the marketplace to upload and render templates here."
            action={
              <AppLink
                to="marketplace"
                search={{ kind: 'storage' }}
                className="tai-btn tai-btn-secondary"
              >
                Browse marketplace
              </AppLink>
            }
          />
        </Card>
      ) : (
        <div className="tai-split" data-pane={pane}>
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
      )}
    </div>
  );
}
