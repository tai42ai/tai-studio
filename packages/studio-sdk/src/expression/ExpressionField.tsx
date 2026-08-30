/**
 * `ExpressionField` — the SDK's expression-authoring control. It is a plain SDK
 * text field (a `Field` wrapping a `Textarea`, or a `TextInput` when
 * `multiline={false}`) that GROWS a "visual editor" affordance only when a plugin
 * has contributed an editor for the field's language. With no editor registered —
 * or no {@link ExpressionEditorsProvider} mounted above it — it stays exactly a
 * text field, so a consumer adopts it with no dependency on any editor being
 * installed (graceful absence).
 *
 * The launcher half — the button that lazily loads the editor behind `Suspense`,
 * warms its chunk on open-intent, and turns a `load()` rejection into a loud
 * inline error — is the standalone {@link ExpressionEditorLauncher}, exported so a
 * dense grid can compose its OWN input + an icon-only door in one row and reuse
 * this exact mount semantics rather than reimplementing them. `ExpressionField`
 * consumes that same component internally, so there is one source of truth for how
 * an editor is mounted.
 *
 * The interaction is ported from babelfish's `jq-editor-button.tsx` but styled
 * with SDK primitives and generalised to any {@link ExpressionLanguage}: the
 * whole {@link ExpressionFieldDeclaration} threads onto the editor, so its context
 * chip, Test seeding, and server-validate hook all read from one object, and each
 * degrades on its own when absent.
 */
import {
  Suspense,
  lazy,
  useMemo,
  useState,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';

import { Button, Spinner } from '../components/primitives';
import { ErrorBoundary } from '../components/error-boundary';
import { Field } from '../components/field';
import { TextInput, Textarea } from '../components/inputs';
import { GridIcon } from '../components/icons';

import { useExpressionEditor } from './context';
import type { ExpressionFieldDeclaration } from './types';

/**
 * The native attributes {@link ExpressionField} FORWARDS to its underlying control
 * (`Textarea` or, single-line, `TextInput`), minus the ones the field owns itself.
 * Intersecting both attribute sets keeps the pass-through valid whichever element
 * `multiline` selects, and omitting the owned keys keeps a caller from
 * accidentally severing the value/edit wiring or the monospace class. This is the
 * `inputs.tsx` pass-through doctrine (a caller's native attribute reaches the
 * element) narrowed to what a field can safely surrender — `name`, `onBlur`,
 * `maxLength`, `style`, `data-*`, and the like.
 */
export type ExpressionControlProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement> & InputHTMLAttributes<HTMLInputElement>,
  | 'value'
  | 'onChange'
  | 'disabled'
  | 'rows'
  | 'placeholder'
  | 'className'
  | 'spellCheck'
  | 'children'
>;

export interface ExpressionEditorLauncherProps {
  /** What language the field authors, what its input is, and how to sample/validate it. */
  readonly declaration: ExpressionFieldDeclaration;
  /** The field's current expression ('' when unset), the editor seeds itself with. */
  readonly value: string;
  /** Called with the authored expression when the user saves in the editor. */
  readonly onSave: (expression: string) => void;
  /** The label the editor titles itself with; also enriches the launcher's name. */
  readonly fieldLabel: string;
  /** Icon-only launcher for narrow rows; the full name rides `aria-label`. */
  readonly compact?: boolean;
  /**
   * Open the editor READ-ONLY (no Save). This is the launcher's ONLY blocking knob:
   * a launcher has no inline textarea to disable, so — unlike {@link ExpressionField}'s
   * `disabled`, which conflates textarea-disabled with editor-read-only — the door
   * expresses author-blocking solely here. {@link ExpressionField} maps its own
   * `disabled` onto this by default, and its `editorReadOnly` overrides that.
   */
  readonly editorReadOnly?: boolean;
  /**
   * Override the launcher's hover `title` (e.g. a rerun/side-effect hint). Absent,
   * the title is derived from the declaration's shape ("Visual editor · input: …").
   */
  readonly title?: string;
}

/**
 * The launcher + lazily-loaded editor for one expression field, standalone so a
 * compact grid can drop it beside its own input. It resolves the contributed
 * editor for `declaration.language` itself and renders NOTHING when none is
 * registered (or no {@link ExpressionEditorsProvider} is mounted) — the same
 * graceful absence {@link ExpressionField} degrades to a plain text field on.
 */
export function ExpressionEditorLauncher({
  declaration,
  value,
  onSave,
  fieldLabel,
  compact = false,
  editorReadOnly = false,
  title,
}: ExpressionEditorLauncherProps): ReactElement | null {
  const contribution = useExpressionEditor(declaration.language);
  const [open, setOpen] = useState(false);

  // A fresh lazy wrapper per contribution: the module resolves once and React
  // caches it, so re-opening the editor does not re-fetch the chunk.
  const LazyEditor = useMemo(
    () =>
      contribution === null
        ? null
        : lazy(() => contribution.load().then((module) => ({ default: module.Editor }))),
    [contribution],
  );

  if (contribution === null || LazyEditor === null) return null;

  // Warm the chunk on OPEN-INTENT (hover/focus) and again on click, both
  // best-effort: a preload that throws must never block opening the editor, whose
  // own lazy import stays the loud path if the module genuinely cannot load.
  const warm = (): void => {
    contribution.preload?.();
  };

  const shapeLabel = declaration.shape?.label;
  const openLabel = shapeLabel
    ? `Open the visual editor for ${fieldLabel} (input: ${shapeLabel})`
    : `Open the visual editor for ${fieldLabel}`;
  const resolvedTitle =
    title ?? (shapeLabel ? `Visual editor · input: ${shapeLabel}` : 'Visual editor');

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          warm();
          setOpen(true);
        }}
        onMouseEnter={warm}
        onFocus={warm}
        aria-label={openLabel}
        title={resolvedTitle}
      >
        <GridIcon aria-hidden />
        {compact ? null : ' Visual editor'}
      </Button>
      {open ? (
        // A load() rejection throws through Suspense on render; the boundary turns
        // it into a loud inline error where the editor would have appeared rather
        // than blanking the field around it.
        <ErrorBoundary label="Visual editor">
          <Suspense fallback={<Spinner label="Loading the visual editor" />}>
            <LazyEditor
              declaration={declaration}
              open
              initialExpression={value}
              fieldLabel={fieldLabel}
              readOnly={editorReadOnly}
              onSave={(expression) => {
                onSave(expression);
                setOpen(false);
              }}
              onClose={() => {
                setOpen(false);
              }}
            />
          </Suspense>
        </ErrorBoundary>
      ) : null}
    </>
  );
}

export interface ExpressionFieldProps {
  /** The `Field` label; also the editor's title unless {@link fieldLabel} overrides it. */
  readonly label: string;
  /**
   * Render the label for assistive tech only (visually hidden) — for a dense grid
   * of otherwise-identical expression rows that each need a unique, addressable
   * name but have no room for a visible label. The `label` text is still the
   * accessible name (see {@link Field.hideLabel}).
   */
  readonly hideLabel?: boolean;
  /** Optional field description rendered under the control. */
  readonly description?: string;
  /** Optional error rendered under the control (also flags the field invalid). */
  readonly error?: string;
  /** What language the field authors, what its input is, and how to sample/validate it. */
  readonly declaration: ExpressionFieldDeclaration;
  /** The field's current expression ('' when unset). */
  readonly value: string;
  /** Called with the new expression on both textarea edits and an editor save. */
  readonly onChange: (expression: string) => void;
  /**
   * Disables INLINE editing (the textarea/input is `disabled`). By default it also
   * opens the editor read-only, so a blocked value can still be inspected; pass
   * {@link editorReadOnly} to decouple the two.
   */
  readonly disabled?: boolean;
  /**
   * Whether the visual editor opens READ-ONLY, independent of {@link disabled}.
   * Defaults to `disabled` — the historical coupling — so a caller that never sets
   * it keeps today's behaviour. Set it `false` to let the editor author a value
   * whose textarea is disabled, or `true` to lock the editor while the textarea
   * stays editable.
   */
  readonly editorReadOnly?: boolean;
  /** Icon-only launcher for narrow rows; the full name rides `aria-label`. */
  readonly compact?: boolean;
  /** The label the editor titles itself with; defaults to {@link label}. */
  readonly fieldLabel?: string;
  /**
   * Author the field on a SINGLE line — a `TextInput` instead of a `Textarea` —
   * for a per-argument grid row. Defaults to `true` (multiline). The visual-editor
   * launcher is unaffected.
   */
  readonly multiline?: boolean;
  /**
   * Render the expression content in the design system's monospace face. Defaults
   * to TRUE: an expression is code, and code reads in a mono font (jq filters,
   * paths, and operators align and disambiguate `l`/`1`/`I` there) — the same face
   * every jq surface in the ecosystem paints. A prose-ish field can opt out with
   * `false`.
   */
  readonly monospace?: boolean;
  /**
   * Override the launcher button's hover `title` (e.g. a rerun/side-effect hint),
   * threaded to {@link ExpressionEditorLauncher.title}.
   */
  readonly launcherTitle?: string;
  /** Textarea row count (defaults to the SDK `Textarea` default); ignored when single-line. */
  readonly rows?: number;
  /** Textarea/input placeholder. */
  readonly placeholder?: string;
  /**
   * Narrow native-attribute pass-through to the underlying control — `name`,
   * `onBlur`, `maxLength`, `style`, `data-*`, and the like. The field owns
   * value/onChange/disabled/rows/placeholder/spellCheck and the monospace class, so
   * those are not forwardable (see {@link ExpressionControlProps}).
   */
  readonly textareaProps?: ExpressionControlProps;
}

export function ExpressionField({
  label,
  hideLabel = false,
  description,
  error,
  declaration,
  value,
  onChange,
  disabled = false,
  editorReadOnly,
  compact = false,
  fieldLabel,
  multiline = true,
  monospace = true,
  launcherTitle,
  rows,
  placeholder,
  textareaProps,
}: ExpressionFieldProps): ReactElement {
  const contribution = useExpressionEditor(declaration.language);

  const monoClassName = monospace
    ? multiline
      ? 'tai-textarea-mono'
      : 'tai-input-mono'
    : undefined;

  // The editor's read-only state is INDEPENDENT of the textarea's disabled state,
  // but defaults to it so the historical coupling holds for a caller that never
  // asks for the two to differ.
  const resolvedEditorReadOnly = editorReadOnly ?? disabled;

  const control: ReactNode = multiline ? (
    <Textarea
      {...textareaProps}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      disabled={disabled}
      spellCheck={false}
      rows={rows}
      placeholder={placeholder}
      className={monoClassName}
    />
  ) : (
    <TextInput
      {...textareaProps}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
      }}
      disabled={disabled}
      spellCheck={false}
      placeholder={placeholder}
      className={monoClassName}
    />
  );

  return (
    <Field label={label} hideLabel={hideLabel} description={description} error={error}>
      {control}
      {contribution !== null ? (
        <div
          style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--tai-space-2)' }}
        >
          <ExpressionEditorLauncher
            declaration={declaration}
            value={value}
            onSave={onChange}
            fieldLabel={fieldLabel ?? label}
            compact={compact}
            editorReadOnly={resolvedEditorReadOnly}
            title={launcherTitle}
          />
        </div>
      ) : null}
    </Field>
  );
}
