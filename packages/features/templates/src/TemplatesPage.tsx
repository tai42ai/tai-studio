/**
 * Templates page. The master list comes from `api.listTemplates`; selecting
 * a name navigates to `templates?template=<id>` (shell-owned routing via
 * `AppLink`), which drives the detail panel. Also hosts the upload form and the
 * "clear cache" action. All server state flows through TanStack Query:
 * loading → `Skeleton`, empty → `EmptyState`, error → a loud `ErrorState`.
 */
import type { CSSProperties, ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AppLink,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Skeleton,
  Spinner,
  errorMessage,
  useApi,
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
          font: 'var(--tai-text-md) var(--tai-font-sans)',
          color: isActive ? 'var(--tai-color-primary-text)' : 'var(--tai-color-text)',
          background: isActive ? 'var(--tai-color-primary)' : 'transparent',
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-6)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--tai-space-4)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 'var(--tai-text-xl)' }}>Templates</h1>
        <Button
          onClick={() => {
            clearCache.mutate();
          }}
          disabled={clearCache.isPending}
        >
          {clearCache.isPending ? <Spinner label="Clearing cache" /> : null}
          Clear cache
        </Button>
      </header>

      {clearCache.isError ? <ErrorState message={errorMessage(clearCache.error)} /> : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(16rem, 22rem) 1fr',
          gap: 'var(--tai-space-6)',
          alignItems: 'start',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-6)' }}>
          <Card>
            <h2 style={{ margin: '0 0 var(--tai-space-4)', fontSize: 'var(--tai-text-lg)' }}>
              All templates
            </h2>
            <TemplateList selected={selected} />
          </Card>
          <UploadTemplateForm />
        </div>

        <div>
          {selected !== undefined ? (
            <TemplateDetail templateId={selected} />
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
