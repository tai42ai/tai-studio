/**
 * The optional-subject sub-form shared by every form that keys a run's state to a
 * conversation subject (the add-schedule dialog and the tool run panel). A collapsible
 * block whose target / kind / key fields render only while expanded, so a form's default
 * (collapsed) shape sends no subject.
 *
 * Presentational and prop-driven, like {@link ExecutionKeyPicker}: the host feature owns
 * the conversation-targets query (the SDK holds no data-fetching library) and hands the
 * resolved `targetOptions` in. {@link useSubjectFields} owns the field state; the host
 * feature wraps it with its own targets query under its own query-key namespace. The
 * caption and the two placeholders are the only copy that differs between hosts, so they
 * are props.
 */
import type { StateSubject } from '@tai42/api-client';
import { type ReactNode, useState } from 'react';

import { Field } from './field';
import { TextInput } from './inputs';
import { Select } from './select';

/** One conversation-target option: `target_kind:target_name` value, `kind · name` label. */
export interface SubjectTargetOption {
  readonly value: string;
  readonly label: string;
}

/** The message a partially-filled subject is refused with (all three fields or none). */
export const SUBJECT_INCOMPLETE_MESSAGE = 'A subject needs a target, a kind, and a key.';

/** Map the conversation routes read to the target select's options. */
export function toSubjectTargetOptions(
  routes: readonly { readonly target_kind: string; readonly target_name: string }[],
): SubjectTargetOption[] {
  return routes.map((route) => ({
    value: `${route.target_kind}:${route.target_name}`,
    label: `${route.target_kind} · ${route.target_name}`,
  }));
}

/**
 * Build a {@link StateSubject} from the sub-form values: `null` when untouched (no
 * subject), a subject when target, kind and key are all set, or a loud failure when only
 * some are — never a silently dropped partial subject. The target splits on its FIRST
 * colon, so a target name may itself contain one.
 */
export function buildSubject(v: {
  readonly target: string;
  readonly kind: string;
  readonly key: string;
}): { ok: true; subject: StateSubject | null } | { ok: false; message: string } {
  const touched = v.target !== '' || v.kind.trim() !== '' || v.key.trim() !== '';
  if (!touched) return { ok: true, subject: null };
  const separator = v.target.indexOf(':');
  const targetKind = separator < 0 ? '' : v.target.slice(0, separator);
  const targetName = separator < 0 ? '' : v.target.slice(separator + 1);
  if (targetKind === '' || targetName === '' || v.kind.trim() === '' || v.key.trim() === '') {
    return { ok: false, message: SUBJECT_INCOMPLETE_MESSAGE };
  }
  // The target is chosen from the conversation-routes options, so its kind is one of the
  // route target kinds; the value carries it as text and this narrows it to the subject's
  // union without a runtime schema (the SDK holds no api-client value import).
  return {
    ok: true,
    subject: {
      target_kind: targetKind as StateSubject['target_kind'],
      target_name: targetName,
      kind: v.kind.trim(),
      key: v.key.trim(),
    },
  };
}

/** Subject field state + setters + the collapse toggle. The host feature owns the
 *  open-gated conversation-targets query and derives `targetOptions` from it. */
export function useSubjectFields() {
  const [target, setTarget] = useState('');
  const [kind, setKind] = useState('');
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  return { target, setTarget, kind, setKind, key, setKey, error, setError, open, setOpen };
}

export interface SubjectSectionProps {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly target: string;
  readonly onTargetChange: (value: string) => void;
  readonly kind: string;
  readonly onKindChange: (value: string) => void;
  readonly subjectKey: string;
  readonly onKeyChange: (value: string) => void;
  readonly error: string | null;
  readonly targetOptions: readonly SubjectTargetOption[];
  /** The block's descriptive caption, shown under the expanded header. */
  readonly caption: string;
  /** The target select's empty-choice placeholder. */
  readonly targetPlaceholder: string;
  /** The Subject key field's helper description. */
  readonly subjectKeyDescription: string;
}

export function SubjectSection({
  open,
  onToggle,
  target,
  onTargetChange,
  kind,
  onKindChange,
  subjectKey,
  onKeyChange,
  error,
  targetOptions,
  caption,
  targetPlaceholder,
  subjectKeyDescription,
}: SubjectSectionProps): ReactNode {
  return (
    <div>
      <button
        type="button"
        className="tai-btn tai-btn-ghost"
        aria-expanded={open}
        onClick={onToggle}
      >
        Subject (optional)
      </button>
      {open ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--tai-space-3)',
            marginTop: 'var(--tai-space-3)',
          }}
        >
          <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>{caption}</p>
          <Field label="Target">
            <Select
              value={target}
              onValueChange={onTargetChange}
              aria-label="Subject target"
              placeholder={targetPlaceholder}
              options={targetOptions}
            />
          </Field>
          <Field
            label="Subject kind"
            description="The subject family the state declares (e.g. person)."
          >
            <TextInput
              value={kind}
              placeholder="e.g. person"
              onChange={(event) => {
                onKindChange(event.target.value);
              }}
            />
          </Field>
          <Field label="Subject key" description={subjectKeyDescription}>
            <TextInput
              value={subjectKey}
              placeholder="e.g. a-42"
              onChange={(event) => {
                onKeyChange(event.target.value);
              }}
            />
          </Field>
          {error !== null ? (
            <p role="alert" style={{ margin: 0, color: 'var(--tai-color-err-text)' }}>
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
