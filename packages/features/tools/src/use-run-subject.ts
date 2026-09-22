/**
 * The run panel's optional-subject sub-form: the shared subject field state plus the
 * open-gated conversation-targets read, under the run panel's own query-key namespace.
 * The field state, the target-option mapping and the subject builder are the shared SDK
 * sub-form (`useSubjectFields` / `toSubjectTargetOptions` / `buildSubject`); this hook
 * owns only the panel's targets query, so a plain run (collapsed section) mounts none.
 */
import { toSubjectTargetOptions, useApi, useSubjectFields } from '@tai42/studio-sdk';
import { useQuery } from '@tanstack/react-query';

/** Subject field state + setters + the target options; the targets read is gated on
 *  `open` so the panel's default (collapsed) shape mounts no extra query. */
export function useRunSubject() {
  const api = useApi();
  const fields = useSubjectFields();

  const targetsQuery = useQuery({
    queryKey: ['tools', 'run-subject', 'conversation-targets'],
    queryFn: ({ signal }) => api.listConversationRoutes(signal),
    enabled: fields.open,
  });

  return { ...fields, targetOptions: toSubjectTargetOptions(targetsQuery.data?.items ?? []) };
}
