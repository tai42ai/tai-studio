/**
 * Schema-driven forms — the load-bearing auto-form renderer, reused by
 * the tools and interactions features. Public surface: the `SchemaForm`
 * component plus the value/validation helpers a caller needs to seed, validate,
 * and submit.
 *
 * THE JQ-FREE ENTRY POINT. This module is published as
 * `@tai42/studio-sdk/schema-form`, and a consumer that BUNDLES the SDK — a
 * standalone widget rather than a host serving the SDK as a shared module —
 * should import the form from here rather than from the package barrel. The
 * barrel re-exports `JqField` off `@tai42/jq-studio`, and a bundler emits that
 * package's Web Worker file and wasm engine from the mere presence of the
 * MODULE in the graph: those assets are emitted while the module is transformed,
 * before tree-shaking can drop the unused re-export. Reaching the form through
 * this entry point, and injecting the door only where it is wanted (see
 * `SchemaForm`'s `expressionField`), is what holds a form-only consumer at zero
 * jq bytes.
 *
 * The design system reaches this entry point through relative imports, so the
 * form renders complete; only the barrel's three CSS side-effect imports stay
 * behind. A consumer importing from here loads the stylesheets it wants
 * explicitly (`@tai42/studio-sdk/tokens.css` and `…/components.css`, plus
 * `…/fonts.css` if it wants the bundled faces).
 *
 * For a BUNDLING consumer only. The shell and every Studio plugin externalise
 * `@tai42/studio-sdk` and resolve it through the served import map, so they must
 * keep importing the barrel: an import map that serves the barrel alone would
 * leave this subpath to be bundled, and the second copy's contexts — the
 * completion provider, the injected expression door — would be different objects
 * from the ones the host provides.
 */
export { SchemaForm } from './SchemaForm';
export type { SchemaFormProps, CompletionProvider } from './SchemaForm';
export { RecordEntryRendererContext } from './context';
export type { RecordEntryRenderer, RecordEntryContext } from './context';
export { ExpressionFieldContext } from './context';
export type {
  ExpressionFieldComponent,
  ExpressionFieldProps,
  ExpressionInputShape,
  ExpressionInputKey,
} from './context';
export { SecretRefField } from './SecretRefField';
export type { SecretRefFieldProps, SecretRef } from './SecretRefField';
export { defaultValueForSchema } from './default-value';
export { validateAgainstSchema } from './validate';
export { resolveRef } from './resolve';
export type { JsonSchema, JsonSchemaType, Discriminator, SchemaFormErrors } from './types';
