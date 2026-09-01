/**
 * The SDK's jq surface — a THIN re-export of `@tai42/jq-studio`, the standalone,
 * embeddable visual jq editor. There is no tai42-owned jq component: the platform
 * owns zero jq code. This module exists only so a feature package (which depends
 * on `@tai42/studio-sdk` alone, never on `@tai42/jq-studio` directly) can reach
 * the drop-in `JqField`, the lower-level `JqEditorDialog`, the agnostic
 * field-declaration contract, and the runtime loader/worker helpers.
 *
 * NOTHING IN THE SDK IMPORTS THIS MODULE. Every edge to it runs the other way: a
 * host imports `JqField` from here and hands it in — to a `SchemaForm` through its
 * `expressionField` prop or the ambient `ExpressionFieldContext`, or straight into
 * its own JSX. That is what keeps this heavy subgraph — the visual editor, its
 * worker file, and its wasm engine — OUT of the bundle of a consumer that imports
 * the SDK for anything else; a bundler emits a dynamic import's chunks as surely
 * as a static import's, so `lazy` inside the SDK would not have kept them out.
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
  // The design-system injection point. jq-studio renders its editor chrome
  // through primitives it reads from a module-scoped React context; the host
  // mounts `PrimitivesProvider` ONCE at the root to substitute the SDK design
  // system. It is re-exported HERE — off the same `@tai42/jq-studio` instance
  // `JqField` comes from — so the host reaches it through the ONE shared SDK the
  // import map serves, and the provider's context is the SAME object `JqField`
  // reads. A host that imported `PrimitivesProvider` from `@tai42/jq-studio`
  // directly would bundle a SECOND jq-studio copy: its `createContext` would be a
  // different object, the injection would silently fall back to the built-ins,
  // and the shell would ship a duplicate (orphan) jq worker + wasm.
  PrimitivesProvider,
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
  // The nine-primitive contract a host builds its injection map against (see
  // `PrimitivesProvider`).
  Primitives,
} from '@tai42/jq-studio';
