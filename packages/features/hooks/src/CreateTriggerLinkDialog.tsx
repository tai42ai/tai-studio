/**
 * The create-trigger-link flow, in the `MintedKeyDialog` shape: a form (topic +
 * optional name + the execution key + the "require an api key" toggle + the
 * explicit expiry picker + an optional per-link params JSON editor) that, on
 * success, becomes a QR dialog for the minted link. Required fields nag on submit;
 * an unsatisfiable fire gate (see `fireGateUnsatisfiable`) disables it.
 *
 * The link is SHOWN ONCE: the create reply's raw `token` lives only in this
 * dialog's local state, rendered as a QR + copy field with a loud "shown once"
 * caption. There is no "show QR again" affordance anywhere — the server cannot
 * reproduce the token; regenerating means revoke + create. Every failure (an
 * invalid ttl / name, a taken name, a 403, the in-memory 501, or any other status)
 * surfaces LOUDLY inline — never swallowed.
 */
import { useMemo, useState, type CSSProperties, type ReactNode, type SyntheticEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { renderSVG } from 'uqr';
import {
  Button,
  Checkbox,
  CopyField,
  Dialog,
  ErrorState,
  Field,
  RadioGroup,
  Spinner,
  TextInput,
  Textarea,
  errorMessage,
  useApi,
} from '@tai42/studio-sdk';
import type { TriggerLinkCreateBody, TriggerLinkCreated } from '@tai42/api-client';

import { TRIGGER_LINKS_KEY_ROOT } from './keys';
import { composeTriggerUrl } from './compose-trigger-url';
import { EXPIRY_OPTIONS, resolveTtlSeconds, type ExpiryChoice } from './expiry';
import { ExecutionKeyPicker, useExecutionKeys } from './ExecutionKeyPicker';
import { fireGateUnsatisfiable } from './fire-path-gate';

const qrWrapperStyle: CSSProperties = {
  maxWidth: '14rem',
  width: '100%',
  aspectRatio: '1 / 1',
  overflow: 'hidden',
  background: 'var(--tai-color-surface)',
  borderRadius: 'var(--tai-radius-md)',
};

const captionStyle: CSSProperties = {
  margin: 0,
  fontSize: 'var(--tai-text-sm)',
  color: 'var(--tai-color-text-muted)',
};

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--tai-space-4)',
};

/** An ISO-8601 instant rendered for humans; an unparseable value shows verbatim. */
function formatExpiry(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

/** Parse the params textarea; blank means OMIT the field. Throws a loud message on
 * bad input (a non-object or unparseable JSON), exactly like the register form. */
function parseToolKwargs(raw: string): Record<string, unknown> | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`Invalid JSON: ${errorMessage(error)}`);
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Invalid JSON: tool params must be a JSON object.');
  }
  return value as Record<string, unknown>;
}

export function CreateTriggerLinkDialog({ onClose }: { readonly onClose: () => void }): ReactNode {
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

  const keysQuery = useExecutionKeys();

  // The minted link is held in local state (shown once): the raw token rides
  // this reply exactly once and never leaves the rendered QR/copy value.
  const [link, setLink] = useState<TriggerLinkCreated | null>(null);

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
  // The prop object, not its string, is what React compares: a fresh literal makes
  // every re-render of this dialog re-run `renderSVG` and re-write the QR's
  // `innerHTML`, rebuilding the whole subtree. Held by identity, the encode and the
  // write happen only when the link itself changes.
  const qr = useMemo(() => (url === null ? null : { __html: renderSVG(url) }), [url]);

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    setSubmitted(true);
    setExpiryError(null);
    setKwargsError(null);
    if (topicMissing || expiryChoice === undefined || executionKeyMissing || unsatisfiable) {
      return;
    }

    let ttlSeconds: number | null;
    try {
      ttlSeconds = resolveTtlSeconds(expiryChoice, customSeconds);
    } catch (error) {
      setExpiryError(errorMessage(error));
      return;
    }

    let toolKwargsValue: Record<string, unknown> | undefined;
    try {
      toolKwargsValue = parseToolKwargs(toolKwargs);
    } catch (error) {
      setKwargsError(errorMessage(error));
      return;
    }

    const trimmedName = name.trim();
    mutation.mutate({
      topic: topic.trim(),
      name: trimmedName === '' ? undefined : trimmedName,
      execution_key: executionKey,
      require_api_key: requireApiKey,
      ttl_seconds: ttlSeconds,
      tool_kwargs: toolKwargsValue,
    });
  };

  return (
    <Dialog
      title="Create trigger link"
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {url !== null && link !== null && qr !== null ? (
        <div style={sectionStyle}>
          <div
            role="img"
            aria-label="Trigger link QR code"
            data-testid="trigger-link-qr"
            style={qrWrapperStyle}
            dangerouslySetInnerHTML={qr}
          />
          <CopyField
            value={url}
            label="Trigger link"
            caption="Scan the QR or share this link — anyone who holds it fires the topic."
          />
          <p style={captionStyle}>
            {link.expires_at === null
              ? 'Permanent — never expires.'
              : `Expires ${formatExpiry(link.expires_at)}`}
          </p>
          <p style={captionStyle}>
            This code is shown once — revoke and re-create to get a new one.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button type="button" variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form aria-label="Create trigger link" onSubmit={onSubmit} style={sectionStyle}>
          <Field
            label="Topic"
            description="The hook topic this link fires when scanned."
            error={submitted && topicMissing ? 'A topic is required.' : undefined}
          >
            <TextInput
              value={topic}
              placeholder="e.g. orders.created"
              onChange={(event) => {
                setTopic(event.target.value);
              }}
            />
          </Field>
          <Field label="Name" description="Optional. A unique name is generated when left blank.">
            <TextInput
              value={name}
              placeholder="e.g. lobby-poster"
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </Field>
          <ExecutionKeyPicker
            value={executionKey}
            onValueChange={setExecutionKey}
            error={submitted && executionKeyMissing ? 'An execution key is required.' : undefined}
          />
          <Checkbox
            label="Also require an api key"
            checked={requireApiKey}
            onCheckedChange={setRequireApiKey}
          />
          <Field
            label="Expiry"
            description="Pick when the link stops working. There is no default — choose one."
            error={submitted && expiryChoice === undefined ? 'Choose an expiry.' : undefined}
            group
          >
            <RadioGroup
              options={EXPIRY_OPTIONS}
              value={expiryChoice}
              onValueChange={(value) => {
                setExpiryChoice(value as ExpiryChoice);
              }}
            />
          </Field>
          {expiryChoice === 'custom' ? (
            <Field
              label="Custom expiry (seconds)"
              description="Whole seconds, greater than zero."
              error={expiryError ?? undefined}
            >
              <TextInput
                value={customSeconds}
                inputMode="numeric"
                placeholder="e.g. 1800"
                onChange={(event) => {
                  setCustomSeconds(event.target.value);
                }}
              />
            </Field>
          ) : null}
          <Field
            label="Tool params (JSON)"
            description="Optional. Merged last into every fire — link params override the hook's static params. Blank means none."
            error={kwargsError ?? undefined}
          >
            <Textarea
              value={toolKwargs}
              rows={4}
              placeholder='{ "flow_graph_kwargs": { "priority": "high" } }'
              onChange={(event) => {
                setToolKwargs(event.target.value);
              }}
            />
          </Field>
          {mutation.isError ? <ErrorState message={errorMessage(mutation.error)} /> : null}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--tai-space-3)' }}>
            <Button type="button" onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={mutation.isPending || unsatisfiable}>
              {mutation.isPending ? <Spinner label="Creating" /> : null}
              Create link
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
