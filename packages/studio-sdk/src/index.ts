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
 * SECURITY.md for the trust boundary.
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
/** What `useApi().runTool` resolves with: the run-tool door's answer, read by its `kind`. */
export type { ReferenceHolder, RunAnswer } from '@tai42/api-client';

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
export type { SystemKindsState } from './hooks/useSystemKinds';
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

// -- Navigation (shell ⇄ feature route-token contract) -----------------------
export type {
  AppLinkProps,
  NavigateOptions,
  NavigationContextValue,
  NavigationGuardHandler,
  PageProps,
  PluginHolderTarget,
  PluginNavigateOptions,
  PluginSearch,
  RouteSearch,
  RouteSearchByToken,
  RouteToken,
  SearchCommitParams,
} from './navigation';
export {
  AppLink,
  NavigationProvider,
  useAppNavigate,
  useNavigationGate,
  useNavigationGuard,
  usePluginEntryNavigation,
  usePluginNavigation,
  useResolvePath,
  useSearchCommit,
} from './navigation';

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
  toolsListKey,
} from './query-keys';

// -- Extension-combo editing helpers -----------------------------------------
export { comboElementNames, extensionElementName } from './extension-combos';

// -- Tool-visibility tri-state -----------------------------------------------
export { effectiveHidden, hiddenToolNames } from './tool-visibility';

// -- Tool declared-badge merge (native ∪ overlay) ----------------------------
export { mergeToolBadges, toolBadgesByName } from './tool-badges';

// -- Text search shared by pickers and filterable lists ----------------------
export { isBlankSearch, matchesSearch } from './search-match';

// -- Design system -----------------------------------------------------------
export type { ActionMenuItem, ActionMenuProps } from './components/action-menu';
export { ActionMenu } from './components/action-menu';
export type { AgentListQuery, AgentPickerProps } from './components/agent-picker';
export { AgentPicker } from './components/agent-picker';
export type { BadgeProps } from './components/badge';
export { Badge } from './components/badge';
export type { ChannelListQuery, ChannelPickerProps } from './components/channel-picker';
export { channelIdentityHint, ChannelPicker } from './components/channel-picker';
export type { CheckboxProps } from './components/checkbox';
export { Checkbox } from './components/checkbox';
export type { ChipGroupProps, ChipOption } from './components/chip-group';
export { ChipGroup } from './components/chip-group';
export type { CodeBlockProps } from './components/code-block';
export { CodeBlock } from './components/code-block';
export type { ConfirmDialogProps } from './components/confirm-dialog';
export { ConfirmDialog } from './components/confirm-dialog';
export type { CopyFieldProps } from './components/copy-field';
export { CopyField } from './components/copy-field';
export type {
  DateRangePickerProps,
  DateRangePreset,
  DateRangeValue,
} from './components/date-range-picker';
export {
  DateRangePicker,
  DEFAULT_DATE_RANGE_PRESETS,
  formatRangeLabel,
  normalizeCustomRange,
} from './components/date-range-picker';
export type { DialogProps } from './components/dialog';
export { Dialog } from './components/dialog';
export { DirtyGuardBoundary, GuardedTabs, useRegisterDirty } from './components/dirty-guard';
export type { DrawerProps } from './components/drawer';
export { Drawer } from './components/drawer';
export type { EntityCardGridProps } from './components/entity-card-grid';
export { EntityCardGrid } from './components/entity-card-grid';
export type { ErrorBoundaryProps } from './components/error-boundary';
export { ErrorBoundary } from './components/error-boundary';
export type { ExecutionKeyPickerProps, ExecutionKeyQuery } from './components/execution-key-picker';
export {
  canHoldExecutionKey,
  ExecutionKeyPicker,
  isExecutionKeyListEmpty,
} from './components/execution-key-picker';
export type {
  ExplorerColumn,
  ExplorerEmptyState,
  ExplorerEmptyStates,
  ExplorerSearch,
  ExplorerTags,
  ExplorerViewProps,
  TagVocabularyEntry,
} from './components/explorer-view';
export {
  buildTagVocabulary,
  ExplorerView,
  matchesSelectedTags,
  UNTAGGED_TOKEN,
} from './components/explorer-view';
export type { ExtensionComboBuilderProps } from './components/extension-combo-builder';
export { ExtensionComboBuilder } from './components/extension-combo-builder';
export type { ExtensionKindGroup } from './components/extension-grouping';
export { groupByKind } from './components/extension-grouping';
export type { ExtensionPickerProps } from './components/extension-picker';
export { ExtensionPicker } from './components/extension-picker';
export type { ExternalLinkButtonProps } from './components/external-link';
export { ExternalLinkButton, isSafeHttpUrl } from './components/external-link';
export type { FieldControlProps, FieldProps } from './components/field';
export { Field, useFieldControl } from './components/field';
export type { FleetReportProps } from './components/fleet-report';
export { FleetReport } from './components/fleet-report';
export type { FormDialogProps } from './components/form-dialog';
export { FormDialog } from './components/form-dialog';
export type {
  HolderHref,
  HolderListProps,
  HolderPreviewProps,
  HolderPreviewState,
} from './components/holder-list';
export { HolderList, HolderPreview, previewHolders, useHolderHref } from './components/holder-list';
export type { NumberInputProps, TextareaProps, TextInputProps } from './components/inputs';
export { NumberInput, Textarea, TextInput } from './components/inputs';
export type { JsonDiffProps, JsonDiffRow } from './components/json-diff';
export { diffJson, JsonDiff } from './components/json-diff';
export type { JsonTreeProps } from './components/json-tree';
export { JsonTree } from './components/json-tree';
export type { HeadingLevel, MarkdownBlock, MarkdownProps } from './components/markdown';
export { Markdown, parseMarkdown } from './components/markdown';
export type { OpenTargetOptions, OpenTargetProps } from './components/open-target';
export { openTargetProps } from './components/open-target';
export type {
  OverlayDetails,
  OverlayDetailsFieldsProps,
} from './components/overlay-details-fields';
export { OverlayDetailsFields, overlayDetailsPatch } from './components/overlay-details-fields';
export { PageFillProvider, useFillViewport, usePageFillActive } from './components/page-fill';
export type { PageHeaderProps, PageLayoutProps, StackProps } from './components/page-header';
export { Page, PageHeader, Stack } from './components/page-header';
export type {
  ButtonProps,
  ButtonVariant,
  CardProps,
  EmptyStateProps,
  ErrorStateProps,
  LinkButtonProps,
  SkeletonProps,
  SpinnerProps,
} from './components/primitives';
export { Button, Card, EmptyState, ErrorState, Skeleton, Spinner } from './components/primitives';
export { safeHttpUrl } from './components/primitives';
export type { RadioGroupProps, RadioOption } from './components/radio-group';
export { RadioGroup } from './components/radio-group';
export type { RecycleRollSectionProps } from './components/recycle-roll';
export { RecycleRollSection } from './components/recycle-roll';
export type { RevealInputProps } from './components/reveal-input';
export { RevealInput } from './components/reveal-input';
export type {
  OverflowAxis,
  OverflowRegionAttributes,
  ProseScrollLabels,
  ScrollRegionProps,
} from './components/scroll-region';
export { ScrollRegion, useOverflowRegion, useProseScrollRegions } from './components/scroll-region';
export type {
  SearchableSelectGroupsProps,
  SearchableSelectProps,
} from './components/searchable-select';
export { SearchableSelect } from './components/searchable-select';
export type {
  SelectGroup,
  SelectGroupsProps,
  SelectOption,
  SelectProps,
} from './components/select';
export { Select } from './components/select';
export type {
  MediaDocumentProps,
  MediaImageProps,
  MediaPlayerProps,
  ServedMediaGrammar,
} from './components/served-media';
export {
  isRenderableMediaSrc,
  isServedMediaUrl,
  MediaDocument,
  MediaImage,
  MediaPlayer,
  resolveMediaSrc,
} from './components/served-media';
export type { StepperProps, StepperStatus, StepperStep } from './components/stepper';
export { Stepper } from './components/stepper';
export type { SubjectSectionProps, SubjectTargetOption } from './components/subject-section';
export {
  buildSubject,
  SUBJECT_INCOMPLETE_MESSAGE,
  SubjectSection,
  toSubjectTargetOptions,
  useSubjectFields,
} from './components/subject-section';
export type {
  NumericColumnProps,
  TableProps,
  TableRowProps,
  TableSectionProps,
  TDProps,
  THProps,
} from './components/table';
export { Table, TBody, TD, TH, THead, TR } from './components/table';
export type { TabItem, TabsProps } from './components/tabs';
export { Tabs } from './components/tabs';
export type { TagChipsProps, TagsInputProps } from './components/tags';
export { TagChips, TagsInput } from './components/tags';
export type {
  TemplatedTextFieldProps,
  TemplatedTextInlineProps,
  TemplatedTextTemplateOption,
} from './components/templated-text-field';
export { TemplatedTextField, templatedTextSummary } from './components/templated-text-field';
export type { TokenName } from './components/tokens';
export { TOKEN_NAMES } from './components/tokens';
export type { ToolListQuery, ToolPickerProps } from './components/tool-picker';
export { BADGES_NOTE, ToolPicker } from './components/tool-picker';
export type { TooltipProps } from './components/tooltip';
export { Tooltip } from './components/tooltip';
export type {
  VersionHistoryEntry,
  VersionHistoryPanelProps,
} from './components/version-history-panel';
export { VersionHistoryPanel } from './components/version-history-panel';
export type { ViewMode, ViewToggleProps } from './components/view-toggle';
export { useViewMode, ViewToggle } from './components/view-toggle';

// -- Whole-module re-exports (each module's own index lists its published names) --
// The marketplace install UI and the tool-organization folder tree.
export * from './marketplace-install';
export * from './tool-organization';
// -- Iconography (the only sanctioned marks; Unicode glyphs are banned) -------
export type { IconComponent, IconProps } from './components/icons';
export {
  AgentsIcon,
  AlertTriangleIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  ConnectorsIcon,
  ConversationsIcon,
  CopyIcon,
  DashboardIcon,
  DatabaseIcon,
  EditIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  FilterIcon,
  FolderIcon,
  GridIcon,
  HooksIcon,
  InteractionsIcon,
  ManifestIcon,
  MarketplaceIcon,
  MembersIcon,
  MenuIcon,
  MinusIcon,
  MonitorIcon,
  MoonIcon,
  NAV_ICONS,
  NotificationsIcon,
  PendingIcon,
  PluginIcon,
  PlusIcon,
  PresetsIcon,
  SchedulingIcon,
  SearchIcon,
  ServedEndpointsIcon,
  SettingsIcon,
  SignOutIcon,
  SortAscIcon,
  SortDescIcon,
  StorageIcon,
  SunIcon,
  SystemIcon,
  ToolsIcon,
  UnplugIcon,
  XCircleIcon,
} from './components/icons';

// -- Schema-driven forms -----------------------------------------------------
export type {
  CompletionProvider,
  DateRangePair,
  Discriminator,
  ExpressionFieldComponent,
  ExpressionFieldProps,
  ExpressionInputKey,
  ExpressionInputShape,
  FieldWords,
  FormControl,
  FormInputMode,
  JsonSchema,
  JsonSchemaType,
  RecordEntryContext,
  RecordEntryRenderer,
  SchemaFormErrors,
  SchemaFormProps,
  SecretRef,
  SecretRefFieldProps,
  UseTemplatedTextCatalog,
} from './schema-form';
export {
  dateRangePairs,
  defaultValueForSchema,
  // The expression-door injection point: a host that wants `x-tai42-expression`
  // fields to author through the visual editor imports `JqField` from
  // `@tai42/jq-studio` and hands it to a form (the `expressionField` prop) or
  // mounts this context above its tree. A form with no door renders those fields
  // as plain string inputs and stays free of the jq subgraph — the editor, its
  // worker, and its wasm — entirely.
  ExpressionFieldContext,
  fieldDrawingOrder,
  isFieldVisible,
  NoFiniteValueError,
  RecordEntryRendererContext,
  resolveRef,
  SchemaForm,
  SecretRefField,
  // The stored-template source for schema-built templated-text fields: a host
  // mounts a hook here that returns the template catalog, so those fields offer
  // stored templates beside inline content.
  TemplatedTextCatalogContext,
  validateAgainstSchema,
} from './schema-form';

// -- Schema-editor (validated JSON-Schema authoring control) -----------------
export type {
  SchemaEditorChange,
  SchemaEditorDraft,
  SchemaEditorProps,
  SchemaLintResult,
} from './schema-editor';
export { lintSchemaText, SchemaEditor } from './schema-editor';

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
  TemplatedText,
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

// -- MCP context widgets (elicitation / progress / completions / output) -----
export type { CompletionInputProps } from './components/completion-input';
export { CompletionInput } from './components/completion-input';
export type { ProgressBarProps } from './components/progress-bar';
export { ProgressBar } from './components/progress-bar';
export type { ElicitationFormProps } from './elicitation/ElicitationForm';
export { ElicitationForm } from './elicitation/ElicitationForm';
export type { StructuredOutputProps } from './structured-output/StructuredOutput';
export { StructuredOutput } from './structured-output/StructuredOutput';
