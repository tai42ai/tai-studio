/**
 * The optional Subject group: a collapsed toggle that, when open, keys this fire's
 * state writes to a conversation target. The target + kind + key expression are
 * either all filled or all left blank; a partially-filled subject is refused loudly
 * on submit (the error is surfaced here).
 */
import { JqField } from '@tai42/jq-studio';
import { Field, Select, TextInput } from '@tai42/studio-sdk';
import type { ReactNode } from 'react';

import { HOOK_SUBJECT_KEY_DECLARATION } from './hookJqDeclarations';
import type { HookFormFields } from './useHookFormFields';

export interface HookSubjectSectionProps {
  readonly fields: HookFormFields;
  readonly targetOptions: readonly { readonly value: string; readonly label: string }[];
}

export function HookSubjectSection({ fields, targetOptions }: HookSubjectSectionProps): ReactNode {
  return (
    <div className="tai-stack tai-stack-3">
      <button
        type="button"
        className="tai-btn tai-btn-ghost"
        aria-expanded={fields.subjectOpen}
        onClick={() => {
          fields.setSubjectOpen((open) => !open);
        }}
        style={{ alignSelf: 'flex-start' }}
      >
        Subject (optional)
      </button>
      {fields.subjectOpen ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--tai-space-3)',
            marginTop: 'var(--tai-space-3)',
          }}
        >
          <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
            Key this fire&rsquo;s state writes to a subject; leave blank for none.
          </p>
          <Field label="Target">
            <Select
              value={fields.subjectTarget}
              onValueChange={fields.setSubjectTarget}
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
              value={fields.subjectKind}
              placeholder="e.g. person"
              onChange={(event) => {
                fields.setSubjectKind(event.target.value);
              }}
            />
          </Field>
          <JqField
            label="Key expression"
            description="A jq over the event payload; it must yield a non-empty string key."
            shape={HOOK_SUBJECT_KEY_DECLARATION.shape}
            multiline={false}
            value={fields.subjectKeyExpr}
            onChange={fields.setSubjectKeyExpr}
          />
          {fields.subjectError !== null ? (
            <p role="alert" style={{ margin: 0, color: 'var(--tai-color-err-text)' }}>
              {fields.subjectError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
