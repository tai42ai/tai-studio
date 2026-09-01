/**
 * Schema-driven forms — the load-bearing auto-form renderer, reused by
 * the tools and interactions features. Public surface: the `SchemaForm`
 * component plus the value/validation helpers a caller needs to seed, validate,
 * and submit.
 *
 * THE FORM-ONLY ENTRY POINT. This module is published as
 * `@tai42/studio-sdk/schema-form` for a consumer that BUNDLES the SDK — a
 * standalone widget rather than a host serving the SDK as a shared module — and
 * wants the form without the barrel: no CSS side effects, and no module graph
 * beyond what the form itself renders.
 *
 * It is also jq-free, and so is the barrel: the visual editor lives in the
 * separately published `@tai42/jq-studio`, which nothing under the SDK imports at
 * runtime. Expression authoring reaches a form only by INJECTION (see
 * `SchemaForm`'s `expressionField` and `ExpressionFieldContext`), so a consumer
 * that never injects a door ships zero jq bytes through either entry point.
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
