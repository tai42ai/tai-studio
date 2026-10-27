/**
 * The stored-template catalog the shell hands every `SchemaForm` through
 * `TemplatedTextCatalogContext`: a schema-built templated-text field offers these
 * template ids in its stored-template picker. The list is read only when a storage
 * backend is present (the list door refuses without one), and both reads share the
 * React Query keys the feature forms use, so a page that already reads them serves
 * each once.
 */
import { type TemplatedTextCatalog, templatedTextCatalog, useApi } from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';

export function useShellTemplatedTextCatalog(): TemplatedTextCatalog {
  const api = useApi();
  const storageQuery = useQuery({
    queryKey: ['storage', 'info'],
    queryFn: ({ signal }) => api.getStorageInfo(signal),
  });
  const templatesQuery = useQuery({
    queryKey: ['templates', 'names'],
    queryFn: ({ signal }) => api.listTemplates(signal),
    enabled: storageQuery.data?.present === true,
  });
  return templatedTextCatalog(storageQuery, templatesQuery);
}
