/**
 * The optional-subject sub-form for the add-schedule dialog: the subject fields, the
 * collapse toggle, and the conversation-target options (read only while expanded).
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from '@tai42/studio-sdk';

/** Subject state + setters + the target options; the targets read is gated on `open`
 *  so the dialog's default (collapsed) shape mounts no extra query. */
export function useScheduleSubject() {
  const api = useApi();

  const [target, setTarget] = useState('');
  const [kind, setKind] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const targetsQuery = useQuery({
    queryKey: ['schedules', 'conversation-targets'],
    queryFn: ({ signal }) => api.listConversationRoutes(signal),
    enabled: open,
  });
  const targetOptions = (targetsQuery.data?.items ?? []).map((route) => ({
    value: `${route.target_kind}:${route.target_name}`,
    label: `${route.target_kind} · ${route.target_name}`,
  }));

  return {
    target,
    setTarget,
    kind,
    setKind,
    key,
    setKey,
    error,
    setError,
    open,
    setOpen,
    targetOptions,
  };
}
