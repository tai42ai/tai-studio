/**
 * The catalog + value types the state-binding editor is fed and edits.
 *
 * The VALUE is the `StateBinding` document (mirrored in `@tai42/api-client`,
 * imported type-only so this package keeps no runtime edge to the client). The
 * CATALOGS are what the consumer resolves from the api-client and hands the editor:
 * the states it may bind, the templates each may attach, and — when a schema is
 * known — the fields a picker offers.
 */
import type {
  StateBinding,
  StateAttach,
  StateInjection,
  StateUpdate,
  TemplatedText,
} from '@tai42/api-client';

import type { TemplatedTextTemplateOption } from '../components/templated-text-field';

export type { StateBinding, StateAttach, StateInjection, StateUpdate, TemplatedText };

/**
 * The stored templates a {@link TemplatedText} field's id picker offers, with the
 * fetch's loading/error state — resolved by the door screen and passed to the
 * editor, which holds no data edge of its own. Absent leaves every templated-text
 * field with the inline source only.
 */
export interface TemplatedTextCatalog {
  readonly templates?: readonly TemplatedTextTemplateOption[];
  readonly loading?: boolean;
  readonly error?: string;
  readonly onRetry?: () => void;
}

/** One selectable field of a schema: the record path + a human label. */
export interface SchemaFieldPath {
  readonly path: readonly string[];
  readonly label: string;
}

/** One template jq of an attached template, as the pickers present it. */
export interface BindingTemplateJqOption {
  readonly name: string;
  readonly purpose: 'input' | 'update';
  readonly description?: string;
  /** An `input` jq's declared params / an `update` jq's declared input keys. */
  readonly params?: readonly string[];
  /** An `update` jq's declared write paths, each a list of key segments. */
  readonly writes?: readonly (readonly string[])[];
}

/** One template the editor may attach to a state (attach-on-use), with its template jq. */
export interface BindingTemplateOption {
  readonly name: string;
  readonly description?: string;
  /** Whether this template is already attached to the chosen state (else: attach on save). */
  readonly attached?: boolean;
  readonly templateJq: readonly BindingTemplateJqOption[];
}

/** One state the editor may bind, with the templates already attached to it and its fields. */
export interface BindingStateOption {
  readonly name: string;
  /** Templates already attached to the state (the rest attach on save). */
  readonly attachedTemplates?: readonly string[];
  /** The state's own record fields, for the `state` source of a field picker. */
  readonly fields?: readonly SchemaFieldPath[];
}

/**
 * The schemas a field picker draws from when authoring an injection or an adapter:
 * the run's `output` and `input` fields (the state's fields ride each
 * {@link BindingStateOption}). Absent roots offer no picked field — the author uses
 * a literal or a jq expression instead.
 */
export interface BindingSourceSchemas {
  readonly output?: readonly SchemaFieldPath[];
  readonly input?: readonly SchemaFieldPath[];
  /** The tool-schema fetch that feeds the pickers is in flight. */
  readonly loading?: boolean;
  /** The tool-schema fetch failed — the field control shows a note but stays usable. */
  readonly error?: string;
}
