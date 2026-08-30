/**
 * The SDK's jq surface — a THIN re-export of `@tai42/jq-studio`, the standalone,
 * embeddable visual jq editor. There is no tai42-owned jq component: the platform
 * owns zero jq code. This module exists only so a feature package (which depends
 * on `@tai42/studio-sdk` alone, never on `@tai42/jq-studio` directly) can reach
 * the drop-in `JqField`, the lower-level `JqEditorDialog`, the agnostic
 * field-declaration contract, and the runtime loader/worker helpers.
 *
 * BUNDLE + WORKER SHARING. A plugin bundle externalises `@tai42/studio-sdk`, so
 * the SDK — and the one copy of `@tai42/jq-studio` it carries — ships once for the
 * whole deployment. A plugin that renders `JqField` shares the host's single jq
 * runtime, its single primitives injection (see the host's `PrimitivesProvider`
 * wiring), and the single worker the host installs at boot
 * ({@link installDefaultJqWorker}); it never bundles its own.
 *
 * The host app injects the SDK's design-system primitives into jq-studio ONCE at
 * the root through jq-studio's `PrimitivesProvider` and installs the shared worker
 * there, so every `JqField` — host feature or plugin — paints in the SDK design
 * system and evaluates off the main thread with no per-site wiring.
 */
export {
  JqField,
  JQEditorDialog,
  JqEditorDialog,
  preloadJq,
  installDefaultJqWorker,
} from '@tai42/jq-studio';
export type {
  JqFieldProps,
  JQEditorDialogProps,
  JqEditorDialogProps,
  ExpressionLanguage,
  JqInputKey,
  JqInputShapeDescriptor,
  SampleInputProvider,
  ServerValidationResult,
  ServerValidateHook,
  JqFieldDeclaration,
} from '@tai42/jq-studio';
