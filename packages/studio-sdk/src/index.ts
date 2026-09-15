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
  NavEntryContribution,
  NavEntrySection,
  PageContribution,
  PluginContext,
  PluginContributions,
  PluginEntry,
  PluginPageParamsSchema,
  PluginPageProps,
  RegisteredNavEntry,
  RegisteredPage,
  RegisteredSettingsTab,
  RequiredCapabilities,
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
export type { CapabilityContextValue, CapabilityState } from './hooks/useCapabilities';
export {
  CapabilityProvider,
  coversAnyRoute,
  coversRoute,
  coversWrite,
  isFullProjection,
  useCanWrite,
  useCapabilities,
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
export { errorMessage } from './errors';

// -- Disabled-feature idiom (one helper + component, every consumer) ----------
export type { FeatureDisabledProps } from './feature-disabled';
export { FeatureDisabled, featureDisabledMessage, isFeatureDisabled } from './feature-disabled';

// -- Cross-feature query keys ------------------------------------------------
export {
  extensionsQueryKey,
  statesListKey,
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

// -- Design system -----------------------------------------------------------
export type { BadgeProps } from './components/badge';
export { Badge } from './components/badge';
export type { CheckboxProps } from './components/checkbox';
export { Checkbox } from './components/checkbox';
export type { ConfirmDialogProps } from './components/confirm-dialog';
export { ConfirmDialog } from './components/confirm-dialog';
export type { DialogProps } from './components/dialog';
export { Dialog } from './components/dialog';
export { DirtyGuardBoundary, GuardedTabs, useRegisterDirty } from './components/dirty-guard';
export type { DrawerProps } from './components/drawer';
export { Drawer } from './components/drawer';
export type { EntityCardGridProps } from './components/entity-card-grid';
export { EntityCardGrid } from './components/entity-card-grid';
export type { ErrorBoundaryProps } from './components/error-boundary';
export { ErrorBoundary } from './components/error-boundary';
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
export type { FieldControlProps, FieldProps } from './components/field';
export { Field, useFieldControl } from './components/field';
export type { FormDialogProps } from './components/form-dialog';
export { FormDialog } from './components/form-dialog';
export type { NumberInputProps, TextareaProps, TextInputProps } from './components/inputs';
export { NumberInput, Textarea, TextInput } from './components/inputs';
export type { JsonDiffProps, JsonDiffRow } from './components/json-diff';
export { diffJson, JsonDiff } from './components/json-diff';
export type { JsonTreeProps } from './components/json-tree';
export { JsonTree } from './components/json-tree';
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
export type { RadioGroupProps, RadioOption } from './components/radio-group';
export { RadioGroup } from './components/radio-group';
export type {
  OverflowRegionAttributes,
  ProseScrollLabels,
  ScrollRegionProps,
} from './components/scroll-region';
export { ScrollRegion, useOverflowRegion, useProseScrollRegions } from './components/scroll-region';
export type {
  SelectGroup,
  SelectGroupsProps,
  SelectOption,
  SelectProps,
} from './components/select';
export { Select } from './components/select';
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
export type { TooltipProps } from './components/tooltip';
export { Tooltip } from './components/tooltip';
export type { ViewMode, ViewToggleProps } from './components/view-toggle';
export { useViewMode, ViewToggle } from './components/view-toggle';
// The canonical whole-row/whole-card "open" affordance: one helper every
// navigable list surface spreads onto its entry (see the module doc).
export type { CodeBlockProps } from './components/code-block';
export { CodeBlock } from './components/code-block';
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
export { ExternalLinkButton, isSafeHttpUrl } from './components/external-link';
export type { FleetReportProps } from './components/fleet-report';
export { FleetReport } from './components/fleet-report';
export type {
  Folder,
  FolderBreadcrumbProps,
  FolderPickerProps,
  FolderRowProps,
} from './components/folder-nav';
export {
  childFolders,
  FolderBreadcrumb,
  folderPathTo,
  FolderPicker,
  FolderRow,
} from './components/folder-nav';
export type { HeadingLevel, MarkdownBlock, MarkdownProps } from './components/markdown';
export { Markdown, parseMarkdown } from './components/markdown';
export type { OpenTargetOptions, OpenTargetProps } from './components/open-target';
export { openTargetProps } from './components/open-target';
// The URL half of the link-safety pair: `isSafeHttpUrl` answers yes/no, this one
// hands back the parsed URL, so a caller that needs the URL does not re-parse it.
export type { CopyFieldProps } from './components/copy-field';
export { CopyField } from './components/copy-field';
export type { ExtensionComboBuilderProps } from './components/extension-combo-builder';
export { ExtensionComboBuilder } from './components/extension-combo-builder';
export type { ExtensionFamily, ExtensionKindGroup } from './components/extension-grouping';
export {
  baseNameOf,
  groupByKind,
  groupIntoFamilies,
  kindVariant,
  NON_STACKABLE_KIND,
} from './components/extension-grouping';
export type { ExtensionPickerProps } from './components/extension-picker';
export { ExtensionPicker } from './components/extension-picker';
export type { ExternalLinkButtonProps } from './components/external-link';
export { safeHttpUrl } from './components/primitives';
export type { RevealInputProps } from './components/reveal-input';
export { RevealInput } from './components/reveal-input';
export type { TokenName } from './components/tokens';
export { TOKEN_NAMES } from './components/tokens';
export type { ToolPickerProps } from './components/tool-picker';
export { BADGES_NOTE, ToolPicker } from './components/tool-picker';
export type {
  VersionHistoryEntry,
  VersionHistoryPanelProps,
} from './components/version-history-panel';
export { VersionHistoryPanel } from './components/version-history-panel';

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
  ExtensionsIcon,
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
  TemplatesIcon,
  ToolsIcon,
  UnplugIcon,
  XCircleIcon,
} from './components/icons';

// -- Schema-driven forms -----------------------------------------------------
export type {
  CompletionProvider,
  Discriminator,
  ExpressionFieldComponent,
  ExpressionFieldProps,
  ExpressionInputKey,
  ExpressionInputShape,
  JsonSchema,
  JsonSchemaType,
  RecordEntryContext,
  RecordEntryRenderer,
  SchemaFormErrors,
  SchemaFormProps,
  SecretRef,
  SecretRefFieldProps,
} from './schema-form';
export {
  defaultValueForSchema,
  // The expression-door injection point: a host that wants `x-tai42-expression`
  // fields to author through the visual editor imports `JqField` from
  // `@tai42/jq-studio` and hands it to a form (the `expressionField` prop) or
  // mounts this context above its tree. A form with no door renders those fields
  // as plain string inputs and stays free of the jq subgraph — the editor, its
  // worker, and its wasm — entirely.
  ExpressionFieldContext,
  RecordEntryRendererContext,
  resolveRef,
  SchemaForm,
  SecretRefField,
  validateAgainstSchema,
} from './schema-form';

// -- Schema-editor (validated JSON-Schema authoring control) -----------------
export type { SchemaEditorChange, SchemaEditorProps, SchemaLintResult } from './schema-editor';
export { lintSchemaText, SchemaEditor } from './schema-editor';

// -- State-binding editor (the one binding shape every door + flow node authors) --
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
