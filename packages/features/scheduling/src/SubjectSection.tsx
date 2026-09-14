/**
 * The optional-subject group for the add-schedule dialog: a collapsible block whose
 * target/kind/key fields (and the targets read) mount only while expanded.
 */
import type { ReactNode } from 'react';
import { Field, Select, TextInput } from '@tai42/studio-sdk';

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
}: {
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly target: string;
  readonly onTargetChange: (value: string) => void;
  readonly kind: string;
  readonly onKindChange: (value: string) => void;
  readonly subjectKey: string;
  readonly onKeyChange: (value: string) => void;
  readonly error: string | null;
  readonly targetOptions: readonly { value: string; label: string }[];
}): ReactNode {
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
          <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
            Key this schedule&rsquo;s state writes to a subject; leave blank for none.
          </p>
          <Field label="Target">
            <Select
              value={target}
              onValueChange={onTargetChange}
              aria-label="Subject target"
              placeholder="Choose a conversation target"
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
          <Field
            label="Subject key"
            description="A literal key; a schedule fires with no payload to derive one."
          >
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
