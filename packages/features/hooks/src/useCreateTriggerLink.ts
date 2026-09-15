/**
 * The create-trigger-link form's state and server wiring. The minted link is held
 * in local state (SHOWN ONCE): the reply's raw token rides exactly once and never
 * leaves the rendered QR/copy value — the server cannot reproduce it. Required
 * fields nag on submit; an unsatisfiable fire gate disables the mint. The expiry and
 * params values are validated locally, so a bad value blocks submit before any
 * request fires.
 */
import type { TriggerLinkCreateBody, TriggerLinkCreated } from '@tai42/api-client';
import { errorMessage, useApi } from '@tai42/studio-sdk';
import { useMutation, type UseMutationResult, useQueryClient } from '@tanstack/react-query';
import { type SyntheticEvent, useMemo, useState } from 'react';
import { renderSVG } from 'uqr';

import { composeTriggerUrl } from './compose-trigger-url';
import { useExecutionKeys } from './ExecutionKeyPicker';
import { type ExpiryChoice, resolveTtlSeconds } from './expiry';
import { fireGateUnsatisfiable } from './fire-path-gate';
import { parseJsonObject } from './jsonObjectField';
import { TRIGGER_LINKS_KEY_ROOT } from './keys';

interface CreateBodyValues {
  readonly topic: string;
  readonly name: string;
  readonly executionKey: string;
  readonly requireApiKey: boolean;
  readonly expiryChoice: ExpiryChoice;
  readonly customSeconds: string;
  readonly toolKwargs: string;
}

type CreateBodyResult =
  | { readonly ok: true; readonly body: TriggerLinkCreateBody }
  | { readonly ok: false; readonly field: 'expiry' | 'kwargs'; readonly message: string };

/** Validate the expiry and params locally and assemble the create body; a bad value
 * returns a field-scoped error so the form places it under the offending control. */
function resolveCreateBody(values: CreateBodyValues): CreateBodyResult {
  let ttlSeconds: number | null;
  try {
    ttlSeconds = resolveTtlSeconds(values.expiryChoice, values.customSeconds);
  } catch (error) {
    return { ok: false, field: 'expiry', message: errorMessage(error) };
  }

  let toolKwargs: Record<string, unknown> | undefined;
  try {
    toolKwargs = parseJsonObject(values.toolKwargs, 'tool params');
  } catch (error) {
    return { ok: false, field: 'kwargs', message: errorMessage(error) };
  }

  const trimmedName = values.name.trim();
  return {
    ok: true,
    body: {
      topic: values.topic.trim(),
      name: trimmedName === '' ? undefined : trimmedName,
      execution_key: values.executionKey,
      require_api_key: values.requireApiKey,
      ttl_seconds: ttlSeconds,
      tool_kwargs: toolKwargs,
    },
  };
}

export interface CreateTriggerLinkForm {
  readonly topic: string;
  readonly setTopic: (value: string) => void;
  readonly name: string;
  readonly setName: (value: string) => void;
  readonly executionKey: string;
  readonly setExecutionKey: (value: string) => void;
  readonly requireApiKey: boolean;
  readonly setRequireApiKey: (value: boolean) => void;
  readonly expiryChoice: ExpiryChoice | undefined;
  readonly setExpiryChoice: (value: ExpiryChoice) => void;
  readonly customSeconds: string;
  readonly setCustomSeconds: (value: string) => void;
  readonly toolKwargs: string;
  readonly setToolKwargs: (value: string) => void;
  readonly submitted: boolean;
  readonly expiryError: string | null;
  readonly kwargsError: string | null;
  readonly mutation: UseMutationResult<TriggerLinkCreated, Error, TriggerLinkCreateBody>;
  readonly unsatisfiable: boolean;
  readonly link: TriggerLinkCreated | null;
  readonly url: string | null;
  readonly qr: { readonly __html: string } | null;
  readonly onSubmit: (event: SyntheticEvent) => void;
}

export function useCreateTriggerLink(): CreateTriggerLinkForm {
  const api = useApi();
  const queryClient = useQueryClient();

  const [topic, setTopic] = useState('');
  const [name, setName] = useState('');
  const [executionKey, setExecutionKey] = useState('');
  // A link is a token door; this toggle is its only auth knob (→ token+api_key).
  const [requireApiKey, setRequireApiKey] = useState(false);
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice | undefined>(undefined);
  const [customSeconds, setCustomSeconds] = useState('');
  const [toolKwargs, setToolKwargs] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [expiryError, setExpiryError] = useState<string | null>(null);
  const [kwargsError, setKwargsError] = useState<string | null>(null);
  const [link, setLink] = useState<TriggerLinkCreated | null>(null);

  const keysQuery = useExecutionKeys();

  const mutation = useMutation({
    mutationFn: (body: TriggerLinkCreateBody) => api.createTriggerLink(body),
    onSuccess: (created) => {
      setLink(created);
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[0] === TRIGGER_LINKS_KEY_ROOT,
      });
    },
  });

  const topicMissing = topic.trim() === '';
  const executionKeyMissing = executionKey === '';
  const unsatisfiable = fireGateUnsatisfiable(keysQuery);
  const url = link !== null ? composeTriggerUrl(api.baseUrl, link.trigger_path) : null;
  // Held by identity so a re-render does not re-encode + re-write the QR's innerHTML.
  const qr = useMemo(() => (url === null ? null : { __html: renderSVG(url) }), [url]);

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    setSubmitted(true);
    setExpiryError(null);
    setKwargsError(null);
    if (topicMissing || expiryChoice === undefined || executionKeyMissing || unsatisfiable) {
      return;
    }
    const result = resolveCreateBody({
      topic,
      name,
      executionKey,
      requireApiKey,
      expiryChoice,
      customSeconds,
      toolKwargs,
    });
    if (!result.ok) {
      if (result.field === 'expiry') setExpiryError(result.message);
      else setKwargsError(result.message);
      return;
    }
    mutation.mutate(result.body);
  };

  return {
    topic,
    setTopic,
    name,
    setName,
    executionKey,
    setExecutionKey,
    requireApiKey,
    setRequireApiKey,
    expiryChoice,
    setExpiryChoice,
    customSeconds,
    setCustomSeconds,
    toolKwargs,
    setToolKwargs,
    submitted,
    expiryError,
    kwargsError,
    mutation,
    unsatisfiable,
    link,
    url,
    qr,
    onSubmit,
  };
}
