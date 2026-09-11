/**
 * One attached state of a binding: the state selector, the templates it attaches
 * (attach-on-use — a not-yet-attached pick shows the "attached on save" hint), the subject
 * and scope expressions, the input injections, and the updates.
 */
import { useMemo, type ReactNode } from 'react';

import { Button } from '../components/primitives';
import { CodeBlock } from '../components/code-block';
import { Checkbox } from '../components/checkbox';
import { Field } from '../components/field';
import { Select } from '../components/select';
import { templatedTextSummary } from '../components/templated-text-field';
import { AlertTriangleIcon, CloseIcon } from '../components/icons';
import { InjectionList } from './InputInjectionRow';
import { UpdateList } from './UpdateRow';
import { SubjectScopeFields } from './SubjectScopeFields';
import type { TemplateJqSuggestion } from './BindingJqField';
import { resolveTemplateJq } from './catalog';
import type {
  BindingSourceSchemas,
  BindingStateOption,
  BindingTemplateOption,
  StateAttach,
  TemplatedText,
  TemplatedTextCatalog,
} from './types';

const ATTACH_ON_USE_HINT = 'This template will be attached to the state when you save.';

/** The subject/scope of the target's own (inherited) binding for a state this one also names. */
export interface InheritedSubject {
  readonly subject_expr: TemplatedText;
  readonly scope_expr: TemplatedText | null;
}

/** The stored binding's raw jq, for the unresolved-catalog read-only fallback. */
function rawBindingLines(attach: StateAttach): string {
  const lines = [`subject: ${templatedTextSummary(attach.subject_expr)}`];
  if (attach.scope_expr !== null) lines.push(`scope: ${templatedTextSummary(attach.scope_expr)}`);
  for (const injection of attach.input_injections) {
    lines.push(
      `input ${injection.into || '(unset)'} <- ${injection.template_jq ?? templatedTextSummary(injection.jq)}`,
    );
  }
  for (const update of attach.updates) {
    const ref = update.template_jq ?? templatedTextSummary(update.jq);
    lines.push(
      `update ${ref}${update.adapter !== null ? ` adapter ${templatedTextSummary(update.adapter)}` : ''}`,
    );
  }
  return lines.join('\n');
}

export interface StateAttachRowProps {
  readonly attach: StateAttach;
  readonly onChange: (attach: StateAttach) => void;
  readonly onRemove: () => void;
  readonly statesCatalog: readonly BindingStateOption[];
  readonly templatesCatalog: readonly BindingTemplateOption[];
  readonly sources?: BindingSourceSchemas;
  readonly subjectError?: string;
  /** The target's own binding subject for this state, when it also binds it (precedence). */
  readonly inherited?: InheritedSubject;
  /** The stored templates a templated-text field's id picker offers. */
  readonly templates?: TemplatedTextCatalog;
}

export function StateAttachRow({
  attach,
  onChange,
  onRemove,
  statesCatalog,
  templatesCatalog,
  sources,
  subjectError,
  inherited,
  templates,
}: StateAttachRowProps): ReactNode {
  const stateOption = statesCatalog.find((option) => option.name === attach.state);
  const attachedTemplates = stateOption?.attachedTemplates ?? [];
  // A bound state or template absent on the server cannot resolve its pickers: show
  // the raw jq read-only rather than a blank form.
  const stateMissing = attach.state !== '' && stateOption === undefined;
  const missingTemplates = attach.templates.filter(
    (name) => !templatesCatalog.some((template) => template.name === name),
  );
  const unresolved = stateMissing || missingTemplates.length > 0;

  const inputJq = useMemo(
    () => resolveTemplateJq(attach.templates, templatesCatalog, 'input'),
    [attach.templates, templatesCatalog],
  );
  const updateJq = useMemo(
    () => resolveTemplateJq(attach.templates, templatesCatalog, 'update'),
    [attach.templates, templatesCatalog],
  );
  // An `update` jq returns an op batch and is never callable from an expression (it is
  // picked only by an update's own select), so the `tjq_…` insert suggestions offered to
  // EVERY jq field are the attached templates' `input`-purpose jq only.
  const suggestions: TemplateJqSuggestion[] = useMemo(
    () =>
      inputJq.map((entry) => ({
        ref: entry.ref,
        purpose: entry.purpose,
        description: entry.description,
      })),
    [inputJq],
  );

  const toggleTemplate = (name: string, checked: boolean): void => {
    const next = checked
      ? [...attach.templates, name]
      : attach.templates.filter((template) => template !== name);
    onChange({ ...attach, templates: next });
  };

  return (
    <div
      data-testid={`state-attach-${attach.state}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--tai-space-3)',
        padding: 'var(--tai-space-3)',
        border: '1px solid var(--tai-color-border)',
        borderRadius: 'var(--tai-radius-md)',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 'var(--tai-space-2)',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <Field label="State">
          <Select
            aria-label="State"
            placeholder="Choose a state"
            value={attach.state}
            onValueChange={(next) => {
              // A new state resets the template picks (its attachments differ).
              onChange({ ...attach, state: next, templates: [] });
            }}
            options={statesCatalog.map((option) => ({ value: option.name, label: option.name }))}
          />
        </Field>
        <Button
          type="button"
          variant="ghost"
          aria-label={`Remove state ${attach.state === '' ? '(unset)' : attach.state}`}
          onClick={onRemove}
        >
          <CloseIcon aria-hidden="true" />
        </Button>
      </div>

      {inherited !== undefined && attach.state !== '' ? (
        <div
          role="status"
          style={{
            display: 'flex',
            gap: 'var(--tai-space-2)',
            alignItems: 'flex-start',
            padding: 'var(--tai-space-2)',
            borderRadius: 'var(--tai-radius-md)',
            background: 'var(--tai-color-warn-tint)',
            color: 'var(--tai-color-warn-text)',
          }}
        >
          <AlertTriangleIcon aria-hidden="true" />
          <div>
            <strong>Overrides the preset&rsquo;s subject</strong>
            <div style={{ display: 'flex', gap: 'var(--tai-space-2)', flexWrap: 'wrap' }}>
              <span
                style={{ color: 'var(--tai-color-text-muted)', fontSize: 'var(--tai-text-sm)' }}
              >
                Preset default:
              </span>
              <span style={{ fontFamily: 'var(--tai-font-mono)', fontSize: 'var(--tai-text-sm)' }}>
                {`subject: ${templatedTextSummary(inherited.subject_expr)}`}
                {inherited.scope_expr !== null
                  ? `, scope: ${templatedTextSummary(inherited.scope_expr)}`
                  : ''}
              </span>
            </div>
          </div>
        </div>
      ) : null}

      {attach.state !== '' && unresolved ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-2)' }}>
          <p role="alert" style={{ margin: 0, color: 'var(--tai-color-err-text)' }}>
            Template not attached.
          </p>
          <CodeBlock code={rawBindingLines(attach)} language="text" />
        </div>
      ) : null}

      {attach.state !== '' && !unresolved ? (
        <>
          <Field
            label="Templates"
            group
            description="One or more templates this binding attaches to the state."
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--tai-space-1)' }}>
              {templatesCatalog.length === 0 ? (
                <p style={{ margin: 0, color: 'var(--tai-color-text-muted)' }}>
                  No templates available.
                </p>
              ) : (
                templatesCatalog.map((template) => {
                  const checked = attach.templates.includes(template.name);
                  const willAttach = checked && !attachedTemplates.includes(template.name);
                  return (
                    <div
                      key={template.name}
                      style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
                    >
                      <Checkbox
                        checked={checked}
                        label={template.name}
                        onCheckedChange={(next) => {
                          toggleTemplate(template.name, next);
                        }}
                      />
                      {willAttach ? (
                        <span
                          style={{
                            color: 'var(--tai-color-text-muted)',
                            fontSize: 'var(--tai-text-sm)',
                          }}
                        >
                          {ATTACH_ON_USE_HINT}
                        </span>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          </Field>

          <SubjectScopeFields
            subjectExpr={attach.subject_expr}
            scopeExpr={attach.scope_expr}
            subjectError={subjectError}
            suggestions={suggestions}
            templates={templates}
            onSubjectChange={(next) => {
              onChange({ ...attach, subject_expr: next });
            }}
            onScopeChange={(next) => {
              onChange({ ...attach, scope_expr: next });
            }}
          />

          <Field label="Inputs" group>
            <InjectionList
              injections={attach.input_injections}
              inputJq={inputJq}
              suggestions={suggestions}
              templates={templates}
              onChange={(next) => {
                onChange({ ...attach, input_injections: [...next] });
              }}
            />
          </Field>

          <Field label="Updates" group>
            <UpdateList
              updates={attach.updates}
              updateJq={updateJq}
              sources={sources}
              suggestions={suggestions}
              templates={templates}
              onChange={(next) => {
                onChange({ ...attach, updates: [...next] });
              }}
            />
          </Field>
        </>
      ) : null}
    </div>
  );
}
