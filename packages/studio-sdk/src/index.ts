/**
 * @tai42/studio-sdk — the PLUGIN SURFACE: everything a Studio plugin (and every
 * feature) is allowed to touch.
 *
 * 1. The STUDIO-PLUGIN API a plugin implements: the `PluginContext` its `register`
 *    entry receives, the contribution types, and the compatibility gate.
 * 2. The design system + hooks every feature (and every plugin) builds on.
 *
 * The host registry (`loadPlugin`/`getContributions`) is DELIBERATELY absent here
 * so the served plugin asset cannot forge, wipe, or enumerate the registry; it is
 * exported only from `@tai42/studio-sdk/host`, which the host bundle imports. See
 * README.md, Entry points and the trust boundary.
 *
 * The shared modules (react, react-dom, @tai42/studio-sdk, @tai42/jq-studio) are
 * singletons across the plugin boundary; this package imports nothing internal at
 * runtime (the `ApiClient`/`Interaction` types are type-only imports).
 *
 * NO JQ. The visual jq editor is `@tai42/jq-studio`, a separately published,
 * client-agnostic package, and this barrel does not re-export it — not even as a
 * thin pass-through. A bundler emits a package's Web Worker file and wasm engine
 * from the mere PRESENCE of the module in the graph (the assets are emitted while
 * the module is transformed, before tree-shaking can drop an unused re-export), so
 * a pass-through here would put ~2.9MB of jq runtime into every consumer that
 * imports this barrel for a Button. Consumers that want the editor import
 * `@tai42/jq-studio` directly; the import map resolves that bare specifier to the
 * one served copy, so the whole deployment still shares a single jq instance, a
 * single primitives injection, and a single worker. What the SDK keeps is the
 * INJECTION POINT — `ExpressionFieldContext` / `SchemaForm`'s `expressionField`
 * prop, plus the mirrored contract types — which holds no edge to jq at all.
 */
// The design system, delivered by the BARREL so each host app loads it once and a
// plugin never ships its own copy. These are bare side-effect imports, so they
// survive bundling only while this module is itself listed in the package's
// `sideEffects` (both `./dist/index.js` and `./src/index.ts` — `files` ships src
// too). Without that entry webpack and Vite treat the barrel as side-effect-free
// and drop all three, and a published consumer gets zero CSS; `sideEffects` is
// kept honest against these lines by `package-side-effects.test.ts`.
import './components/tokens.css';
import './components/fonts.css';
import './components/components.css';

// -- Plugin API --------------------------------------------------------------
export type {
  ChannelConversationRoute,
  HolderLinkContribution,
  HolderLinkTarget,
  NavEntryContribution,
  NavEntrySection,
  PageContribution,
  PluginContext,
  PluginContributions,
  PluginEntry,
  PluginPageParamsSchema,
  PluginPageProps,
  RegisteredHolderLink,
  RegisteredNavEntry,
  RegisteredPage,
  RegisteredRoutePanel,
  RegisteredSettingsTab,
  RequiredCapabilities,
  RoutePanelContribution,
  RoutePanelProps,
  SettingsTabContribution,
  SettingsTabProps,
  ToolPanelContribution,
  ToolPanelProps,
} from './plugin/types';
export type { VersionGateResult } from './plugin/version';
export { checkPluginApiVersion, STUDIO_PLUGIN_API_VERSION } from './plugin/version';

// -- Hooks -------------------------------------------------------------------
export type { ApiClient } from './hooks/useApi';
export { ApiProvider, useApi } from './hooks/useApi';
export type { AuthState } from './hooks/useAuth';
export { AuthProvider, useAuth } from './hooks/useAuth';
export type { Breakpoint, BreakpointState } from './hooks/useBreakpoint';
export { useBreakpoint } from './hooks/useBreakpoint';
export type {
  CapabilityContextValue,
  CapabilityState,
  ExecutionKeyBinding,
  OwnIdentity,
} from './hooks/useCapabilities';
export {
  boundExecutionKey,
  CapabilityProvider,
  coversAnyRoute,
  coversRoute,
  coversWrite,
  isFullProjection,
  useCanWrite,
  useCapabilities,
  useExecutionKeyBinding,
} from './hooks/useCapabilities';
export type {
  InteractionsStreamOptions,
  InteractionsStreamState,
  StreamInteraction,
} from './hooks/useSse';
export { useInteractionsStream } from './hooks/useSse';
export type { SystemKindsContextValue, SystemKindsState } from './hooks/useSystemKinds';
export {
  SystemKindsProvider,
  useFeatureOff,
  useFeatureOffMessage,
  useSystemKinds,
} from './hooks/useSystemKinds';
export type { Theme, ThemePreference, ThemeState } from './hooks/useTheme';
export { ThemeProvider, useTheme } from './hooks/useTheme';
export type {
  ToolDisplayNamesContextValue,
  ToolDisplayNamesState,
} from './hooks/useToolDisplayNames';
export {
  toolDisplayLabel,
  ToolDisplayNamesProvider,
  useReloadToolDisplayNames,
  useToolDisplayNames,
} from './hooks/useToolDisplayNames';
export { UnauthorizedProvider, useOnUnauthorized } from './hooks/useUnauthorized';

// -- Utilities ---------------------------------------------------------------
export { downloadBlob } from './download';
export type { EnvRef } from './env-markers';
export { collectEnvRefs, ENV_MARKER_PREFIX, formatEnvMarker, parseEnvMarker } from './env-markers';
export { errorMessage, isForbiddenError } from './errors';

// -- Disabled-feature idiom (one helper + component, every consumer) ----------
export type { FeatureDisabledProps } from './feature-disabled';
export { FeatureDisabled, featureDisabledMessage, isFeatureDisabled } from './feature-disabled';

// -- Cross-feature query keys ------------------------------------------------
export {
  agentsListKey,
  channelsListKey,
  envConfigKey,
  extensionsQueryKey,
  installedMarketplacePluginsKey,
  marketplacePluginKey,
  mcpAdvertisedToolsKey,
  mcpConfigSchemaKey,
  mcpEnvRefsKey,
  mcpExtensionsKey,
  mcpFailedKey,
  mcpStatusKey,
  preservedManifestKey,
  statesListKey,
  stateTemplateRefereesKey,
  stateTemplatesKey,
  subMcpKey,
  tokensPayloadKey,
  toolMetaKey,
  toolsListKey,
  toolTagsKey,
} from './query-keys';

// -- Extension-combo editing helpers -----------------------------------------
export { comboElementNames, extensionElementName } from './extension-combos';

// -- Tool-visibility tri-state -----------------------------------------------
export { effectiveHidden, hiddenToolNames } from './tool-visibility';

// -- Tool declared-badge merge (native ∪ overlay) ----------------------------
export { mergeToolBadges, toolBadgesByName } from './tool-badges';

// -- Tool declared descriptions ----------------------------------------------
export { toolDescriptionsByName } from './tool-descriptions';

// -- Text search shared by pickers and filterable lists ----------------------
export { isBlankSearch, matchesSearch } from './search-match';

// -- Run results -------------------------------------------------------------
export { isEmptyResult } from './empty-result';

// -- Design system (the components module lists its published names) ----------
export * from './components';

// -- Platform API types the SDK's own signatures name ------------------------
export * from './api-client-types';

// -- Whole-module re-exports (each module's own index lists its published names) --
// The marketplace install UI, the navigation contract (shell ⇄ feature route tokens),
// the validated JSON-Schema editor, the schema-driven forms (whose expression door is
// injected, never imported: see the module's own index) and the tool-organization
// folder tree.
export * from './marketplace-install';
export * from './navigation';
export * from './schema-editor';
export * from './schema-form';
export * from './tool-organization';

// -- State-binding editor (the one binding shape every door authors, plugin doors included) --
export type {
  AdapterCompileResult,
  AdapterMappingProps,
  BindingJqFieldProps,
  BindingSourceSchemas,
  BindingStateOption,
  BindingTemplatedJqFieldProps,
  BindingTemplateJqOption,
  BindingTemplateOption,
  FieldRoot,
  FieldSource,
  InheritedSubject,
  InjectionListProps,
  JqSource,
  LiteralSource,
  MappingRow,
  MappingSource,
  ResolvedTemplateJq,
  SchemaFieldPath,
  StateAttachRowProps,
  StateBindingEditorProps,
  StateBindingSectionProps,
  StoragePresenceQueryLike,
  SubjectScopeFieldsProps,
  TemplatedTextCatalog,
  TemplateJqSuggestion,
  TemplateNamesQueryLike,
  UpdateListProps,
} from './state-binding';
export {
  AdapterMapping,
  appendTjq,
  BindingJqField,
  BindingTemplatedJqField,
  compileAdapter,
  defaultRowsForInput,
  encodeTemplateSegment,
  fieldPathsFromSchema,
  fieldPathToJq,
  findByRef,
  generateTemplateCall,
  InjectionList,
  jqKey,
  parseAdapter,
  parseFieldPath,
  parseTemplateCall,
  resolveCallName,
  resolveTemplateJq,
  rowValueJq,
  StateAttachRow,
  StateBindingEditor,
  StateBindingSection,
  statesCatalogFromList,
  SubjectScopeFields,
  templatedTextCatalog,
  templatesCatalogFromList,
  UpdateList,
} from './state-binding';

// -- MCP context widgets (elicitation / output) ------------------------------
export type { ElicitationFormProps } from './elicitation/ElicitationForm';
export { ElicitationForm } from './elicitation/ElicitationForm';
export type { StructuredOutputProps } from './structured-output/StructuredOutput';
export { StructuredOutput } from './structured-output/StructuredOutput';
