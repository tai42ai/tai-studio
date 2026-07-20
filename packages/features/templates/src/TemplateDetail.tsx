/**
 * Template detail: fetches one template with `api.getTemplate` and shows its
 * content in an escaped `<CodeBlock>`. Hosts the render preview and a delete
 * action guarded by a confirm `<Dialog>`; deleting invalidates the master list
 * and navigates back to the un-selected templates view so the removed template's
 * stale detail is never shown.
 */
import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Card,
  CodeBlock,
  Dialog,
  ErrorState,
  Skeleton,
  Spinner,
  errorMessage,
  useApi,
  useAppNavigate,
} from '@tai42/studio-sdk';

import { RenderPreview } from './RenderPreview';
import { templateDetailKey, templatesListKey } from './keys';

export function TemplateDetail({ templateId }: { templateId: string }): ReactNode {
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useAppNavigate();

  const [confirmOpen, setConfirmOpen] = useState(false);

  const query = useQuery({
    queryKey: templateDetailKey(templateId),
    queryFn: () => api.getTemplate(templateId),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteTemplate(templateId),
    onSuccess: () => {
      setConfirmOpen(false);
      void queryClient.invalidateQueries({ queryKey: templatesListKey });
      navigate('templates');
    },
  });

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--tai-space-4)',
          marginBottom: 'var(--tai-space-4)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'var(--tai-text-lg)', wordBreak: 'break-all' }}>
          {templateId}
        </h2>
        <Dialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="Delete template"
          description={`Permanently delete "${templateId}"? This cannot be undone.`}
          trigger={<Button variant="danger">Delete</Button>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-4)' }}>
            {deleteMutation.isError ? (
              <ErrorState message={errorMessage(deleteMutation.error)} />
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-3)' }}>
              <Button
                onClick={() => {
                  setConfirmOpen(false);
                }}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  deleteMutation.mutate();
                }}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Spinner label="Deleting" /> : null}
                Delete template
              </Button>
            </div>
          </div>
        </Dialog>
      </div>

      {query.isPending ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
          <Skeleton height={20} width="40%" />
          <Skeleton height={120} />
        </div>
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-6)' }}>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-3)' }}>
            <h3 style={{ margin: 0, fontSize: 'var(--tai-text-md)' }}>Content</h3>
            <CodeBlock language="template" code={query.data.template} />
          </section>
          <RenderPreview templateId={templateId} />
        </div>
      )}
    </Card>
  );
}
