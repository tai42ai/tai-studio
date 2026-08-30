/**
 * The SDK's AGNOSTIC expression-field vocabulary: the language-neutral graduation
 * of babelfish jq-studio's field-declaration surface into the platform SDK, so any
 * Studio consumer (a flow product, a tai42 feature, a third-party plugin) can
 * declare an expression field the SAME way and any plugin can contribute the
 * editor that authors it.
 *
 * A host declares an expression field through these generic types — a language
 * tag, a DESCRIPTOR of what the expression's input document IS (not an enum of
 * shapes the editor hard-codes), a sample-input provider, and a pluggable
 * server-validate hook. Nothing here names anything product-specific, so the same
 * SDK serves flows' node/tool-result envelopes and tai42's webhook-body /
 * auth-context / tool-result shapes without a type change. babelfish's flows
 * adapter retypes its own envelopes onto these; the descriptor fields are kept
 * isomorphic to jq-studio's `JqInputShapeDescriptor` so that mapping is a rename,
 * not a reshape.
 *
 * The editor itself is NOT in the SDK — it is a plugin CONTRIBUTION
 * ({@link ExpressionEditorContribution}), lazily loaded across the plugin
 * boundary. This module is the shared contract both sides retype against.
 */
import type { ComponentType } from 'react';

/**
 * The expression language an expression field authors. `'jq'` is the only language
 * that exists today; the tag is an OPEN string union so a host (or a later plugin)
 * can name another pipeline language without a change to this type. The literal
 * keeps `'jq'` on the autocomplete list while `string` keeps the union open.
 */
export type ExpressionLanguage = 'jq' | (string & {});

/**
 * One top-level key of the expression's input document, with a one-line gloss the
 * editor may surface (a context chip, an input-node body, path suggestions).
 * Graduated from jq-studio's `JqInputKey`.
 */
export interface ExpressionInputKey {
  readonly name: string;
  readonly gloss: string;
}

/**
 * A descriptor of what the expression's input document IS for a field — the shape
 * the expression receives as its root. Deliberately open: a host builds these from
 * its own domain, so ANY envelope is expressible, including ones the editor has
 * never heard of. The `id` is an opaque, host-namespaced string used only for
 * memoisation/telemetry. Graduated from jq-studio's `JqInputShapeDescriptor` with
 * every field isomorphic, so the flows adapter maps its `JQType` onto this without
 * reshaping.
 */
export interface ExpressionShapeDescriptor {
  /** Stable, host-namespaced id (opaque to the editor). */
  readonly id: string;
  /** Short chip label — what the input is here, e.g. "node envelope". */
  readonly label: string;
  /** One sentence: what the input document is in this field. */
  readonly blurb: string;
  /** The top-level keys of the input document, each with a one-liner. */
  readonly keys: readonly ExpressionInputKey[];
  /** What the expression must RETURN, e.g. "true or false" | "an object". */
  readonly returns: string;
  /** Per-field caveats (e.g. ".iterate.item is always null in a while condition"). */
  readonly caveats?: readonly string[];
  /** A static skeleton of the input document — the cheap, honest default a Test
   *  panel seeds its input with. A host may override it dynamically through the
   *  declaration's {@link ExpressionSampleInputProvider}. */
  readonly sample?: unknown;
}

/** A provider of a concrete sample input for the editor's Test panel. A function
 *  (not a value) so a host can supply a static skeleton now and a live sample
 *  later without changing this API. Graduated from jq-studio's
 *  `SampleInputProvider`. */
export type ExpressionSampleInputProvider = () => unknown;

/** The answer a pluggable validator gives for an expression against its declared
 *  shape. Mirrors babelfish `validate_jq`'s result WITHOUT importing its types, so
 *  the hook stays host-agnostic. */
export interface ExpressionValidationResult {
  readonly ok: boolean;
  readonly compiles?: boolean;
  readonly singleEmit?: boolean;
  readonly message?: string;
}

/** A pluggable server-validate hook. The editor calls it with the current
 *  expression and the sample input; the host routes it to its own validator (flows
 *  wires babelfish's `validate_jq` endpoint here). Absent = no server validation
 *  (a local runtime may still power the Test panel). Graduated from jq-studio's
 *  `ServerValidateHook`. */
export type ExpressionServerValidate = (args: {
  readonly expression: string;
  readonly sampleInput: unknown;
}) => Promise<ExpressionValidationResult>;

/**
 * The declaration a host attaches to an expression field: the language, what the
 * input document is (descriptor), how to sample it, and how to server-validate it.
 * Every property beyond `language` is optional so adoption is incremental — an
 * undeclared-but-for-language field behaves exactly as a plain text field. No
 * property names anything host-specific. Graduated from jq-studio's
 * `JqFieldDeclaration`.
 */
export interface ExpressionFieldDeclaration {
  readonly language: ExpressionLanguage;
  readonly shape?: ExpressionShapeDescriptor;
  readonly sampleInput?: ExpressionSampleInputProvider;
  readonly serverValidate?: ExpressionServerValidate;
}

/**
 * The props a contributed editor component receives when the field opens it. The
 * WHOLE {@link ExpressionFieldDeclaration} crosses (not just `shape` /
 * `serverValidate`), so the editor reads the input descriptor for its context
 * chip, the sample provider for Test seeding, and the validate hook for its
 * Validate action from one object. `onSave` writes the authored expression back
 * through the field; `onClose` dismisses without saving.
 */
export interface ExpressionEditorProps {
  /** What the field feeds and how to sample/validate it (see the type). */
  readonly declaration: ExpressionFieldDeclaration;
  /** Whether the editor is open — the field mounts it only while true. */
  readonly open: boolean;
  /** The field's current expression ('' when unset), the editor seeds itself with. */
  readonly initialExpression: string;
  /** The field label the editor titles itself with. */
  readonly fieldLabel?: string;
  /** Author-blocking: the editor renders read-only (no Save) when true. */
  readonly readOnly?: boolean;
  /** Called with the authored expression when the user saves. */
  readonly onSave: (expression: string) => void;
  /** Called when the user dismisses the editor without saving. */
  readonly onClose: () => void;
}

/**
 * The contract version an {@link ExpressionEditorContribution} must target. Bumped
 * only on a BREAKING change to {@link ExpressionEditorProps} or the contribution
 * shape; the registry rejects a contribution whose `contractVersion` is not
 * exactly this, so a host never mounts an editor built against an incompatible
 * props contract. It is distinct from `STUDIO_PLUGIN_API_VERSION`: the plugin API
 * gains this whole extension point ADDITIVELY (that version does not move), and
 * this narrower number then versions the editor props independently.
 */
export const EXPRESSION_EDITOR_CONTRACT_VERSION = 1;

/**
 * A plugin's contribution of the editor for one expression language. The editor
 * rides a SEPARATE chunk (a visual canvas, converters, a language runtime), so it
 * is fetched lazily: `load` resolves the module exposing the `Editor` component,
 * and the optional `preload` warms that chunk on open-intent (hover/focus) so the
 * editor is ready by the time the user opens it. `contractVersion` must equal
 * {@link EXPRESSION_EDITOR_CONTRACT_VERSION} or the registry rejects it loudly.
 */
export interface ExpressionEditorContribution {
  /** The language this editor authors; the lookup key a field resolves by. */
  readonly language: ExpressionLanguage;
  /** The {@link ExpressionEditorProps} contract this editor was built against. */
  readonly contractVersion: number;
  /** Best-effort warm of the editor's chunk on open-intent; never awaited by the field. */
  readonly preload?: () => void;
  /** Resolve the editor component's chunk; rejection surfaces as the field's loud error. */
  readonly load: () => Promise<{ readonly Editor: ComponentType<ExpressionEditorProps> }>;
}
