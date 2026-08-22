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
 * The three shared modules (react, react-dom, @tai42/studio-sdk) are singletons
 * across the plugin boundary; this package imports nothing internal at runtime
 * (the `ApiClient`/`Interaction` types are type-only imports).
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
  PluginContext,
  PluginEntry,
  ToolPanelProps,
  PluginPageProps,
  PluginPageParamsSchema,
  SettingsTabProps,
  ToolPanelContribution,
  PageContribution,
  RegisteredPage,
  SettingsTabContribution,
  RegisteredSettingsTab,
  NavEntryContribution,
  NavEntrySection,
  RegisteredNavEntry,
  PluginContributions,
  RequiredCapabilities,
} from './plugin/types';
export { STUDIO_PLUGIN_API_VERSION, checkPluginApiVersion } from './plugin/version';
export type { VersionGateResult } from './plugin/version';

// -- Hooks -------------------------------------------------------------------
export { ApiProvider, useApi } from './hooks/useApi';
export type { ApiClient } from './hooks/useApi';
export { UnauthorizedProvider, useOnUnauthorized } from './hooks/useUnauthorized';
export { AuthProvider, useAuth } from './hooks/useAuth';
export type { AuthState } from './hooks/useAuth';
export {
  CapabilityProvider,
  useCapabilities,
  useCanWrite,
  isFullProjection,
  coversAnyRoute,
  coversRoute,
  coversWrite,
} from './hooks/useCapabilities';
export type { CapabilityState, CapabilityContextValue } from './hooks/useCapabilities';
export {
  SystemKindsProvider,
  useSystemKinds,
  useFeatureOff,
  useFeatureOffMessage,
} from './hooks/useSystemKinds';
export type { SystemKindsState } from './hooks/useSystemKinds';
export {
  ToolDisplayNamesProvider,
  useToolDisplayNames,
  useReloadToolDisplayNames,
  toolDisplayLabel,
} from './hooks/useToolDisplayNames';
export type {
  ToolDisplayNamesState,
  ToolDisplayNamesContextValue,
} from './hooks/useToolDisplayNames';
export { ThemeProvider, useTheme } from './hooks/useTheme';
export type { Theme, ThemePreference, ThemeState } from './hooks/useTheme';
export { useBreakpoint } from './hooks/useBreakpoint';
export type { Breakpoint, BreakpointState } from './hooks/useBreakpoint';
export { useInteractionsStream } from './hooks/useSse';
export type {
  InteractionsStreamOptions,
  InteractionsStreamState,
  StreamInteraction,
} from './hooks/useSse';

// -- Navigation (shell ⇄ feature route-token contract) -----------------------
export {
  NavigationProvider,
  AppLink,
  useAppNavigate,
  useResolvePath,
  usePluginNavigation,
  useNavigationGuard,
  useNavigationGate,
  useSearchCommit,
} from './navigation';
export type {
  AppLinkProps,
  SearchCommitParams,
  RouteToken,
  RouteSearch,
  RouteSearchByToken,
  PageProps,
  NavigationContextValue,
  NavigateOptions,
  PluginSearch,
  NavigationGuardHandler,
} from './navigation';

// -- Utilities ---------------------------------------------------------------
export { errorMessage } from './errors';
export { downloadBlob } from './download';

// -- Disabled-feature idiom (one helper + component, every consumer) ----------
export { isFeatureDisabled, featureDisabledMessage, FeatureDisabled } from './feature-disabled';
export type { FeatureDisabledProps } from './feature-disabled';

// -- Cross-feature query keys ------------------------------------------------
export { toolsListKey, extensionsQueryKey, subMcpKey, tokensPayloadKey } from './query-keys';

// -- Extension-combo editing helpers -----------------------------------------
export { comboElementNames, extensionElementName } from './extension-combos';

// -- Tool-visibility tri-state -----------------------------------------------
export { effectiveHidden, hiddenToolNames } from './tool-visibility';

// -- Tool declared-badge merge (native ∪ overlay) ----------------------------
export { mergeToolBadges, toolBadgesByName } from './tool-badges';

// -- Design system -----------------------------------------------------------
export { Button, Card, Skeleton, EmptyState, ErrorState, Spinner } from './components/primitives';
export type {
  ButtonProps,
  LinkButtonProps,
  ButtonVariant,
  CardProps,
  SkeletonProps,
  EmptyStateProps,
  ErrorStateProps,
  SpinnerProps,
} from './components/primitives';
export { PageHeader, Page, Stack } from './components/page-header';
export type { PageHeaderProps, PageLayoutProps, StackProps } from './components/page-header';
export { PageFillProvider, useFillViewport, usePageFillActive } from './components/page-fill';
export { ErrorBoundary } from './components/error-boundary';
export type { ErrorBoundaryProps } from './components/error-boundary';
export { Field, useFieldControl } from './components/field';
export type { FieldProps, FieldControlProps } from './components/field';
export { TextInput, Textarea, NumberInput } from './components/inputs';
export type { TextInputProps, TextareaProps, NumberInputProps } from './components/inputs';
export { Select } from './components/select';
export type {
  SelectProps,
  SelectGroupsProps,
  SelectOption,
  SelectGroup,
} from './components/select';
export { Checkbox } from './components/checkbox';
export type { CheckboxProps } from './components/checkbox';
export { RadioGroup } from './components/radio-group';
export type { RadioGroupProps, RadioOption } from './components/radio-group';
export { Badge } from './components/badge';
export type { BadgeProps } from './components/badge';
export { Tabs } from './components/tabs';
export type { TabsProps, TabItem } from './components/tabs';
export { Dialog } from './components/dialog';
export type { DialogProps } from './components/dialog';
export { ConfirmDialog } from './components/confirm-dialog';
export type { ConfirmDialogProps } from './components/confirm-dialog';
export { GuardedTabs, useRegisterDirty } from './components/dirty-guard';
export { FormDialog } from './components/form-dialog';
export type { FormDialogProps } from './components/form-dialog';
export { Drawer } from './components/drawer';
export type { DrawerProps } from './components/drawer';
export { Tooltip } from './components/tooltip';
export type { TooltipProps } from './components/tooltip';
export { Table, THead, TBody, TR, TH, TD } from './components/table';
export type {
  TableProps,
  TableSectionProps,
  TableRowProps,
  THProps,
  TDProps,
  NumericColumnProps,
} from './components/table';
export { ScrollRegion, useOverflowRegion, useProseScrollRegions } from './components/scroll-region';
export type {
  ScrollRegionProps,
  OverflowRegionAttributes,
  ProseScrollLabels,
} from './components/scroll-region';
export { JsonTree } from './components/json-tree';
export type { JsonTreeProps } from './components/json-tree';
export { JsonDiff, diffJson } from './components/json-diff';
export type { JsonDiffProps, JsonDiffRow } from './components/json-diff';
export { TagChips, TagsInput } from './components/tags';
export type { TagChipsProps, TagsInputProps } from './components/tags';
export { OverlayDetailsFields, overlayDetailsPatch } from './components/overlay-details-fields';
export type {
  OverlayDetails,
  OverlayDetailsFieldsProps,
} from './components/overlay-details-fields';
export { ViewToggle, useViewMode } from './components/view-toggle';
export type { ViewMode, ViewToggleProps } from './components/view-toggle';
export { EntityCardGrid } from './components/entity-card-grid';
export type { EntityCardGridProps } from './components/entity-card-grid';
export {
  ExplorerView,
  buildTagVocabulary,
  matchesSelectedTags,
  UNTAGGED_TOKEN,
} from './components/explorer-view';
export type {
  ExplorerViewProps,
  ExplorerColumn,
  ExplorerTags,
  ExplorerSearch,
  ExplorerEmptyState,
  ExplorerEmptyStates,
  TagVocabularyEntry,
} from './components/explorer-view';
export {
  FolderBreadcrumb,
  FolderRow,
  FolderPicker,
  childFolders,
  folderPathTo,
} from './components/folder-nav';
export type {
  Folder,
  FolderBreadcrumbProps,
  FolderRowProps,
  FolderPickerProps,
} from './components/folder-nav';
export { CodeBlock } from './components/code-block';
export type { CodeBlockProps } from './components/code-block';
export { Markdown, parseMarkdown } from './components/markdown';
export type { MarkdownProps, MarkdownBlock, HeadingLevel } from './components/markdown';
export {
  DateRangePicker,
  formatRangeLabel,
  normalizeCustomRange,
  DEFAULT_DATE_RANGE_PRESETS,
} from './components/date-range-picker';
export type {
  DateRangePickerProps,
  DateRangePreset,
  DateRangeValue,
} from './components/date-range-picker';
export { FleetReport } from './components/fleet-report';
export type { FleetReportProps } from './components/fleet-report';
export { ExternalLinkButton, isSafeHttpUrl } from './components/external-link';
// The URL half of the link-safety pair: `isSafeHttpUrl` answers yes/no, this one
// hands back the parsed URL, so a caller that needs the URL does not re-parse it.
export { safeHttpUrl } from './components/primitives';
export type { ExternalLinkButtonProps } from './components/external-link';
export { ToolPicker, BADGES_NOTE } from './components/tool-picker';
export type { ToolPickerProps } from './components/tool-picker';
export { ExtensionPicker } from './components/extension-picker';
export type { ExtensionPickerProps } from './components/extension-picker';
export { ExtensionComboBuilder } from './components/extension-combo-builder';
export type { ExtensionComboBuilderProps } from './components/extension-combo-builder';
export {
  baseNameOf,
  groupIntoFamilies,
  groupByKind,
  kindVariant,
  NON_STACKABLE_KIND,
} from './components/extension-grouping';
export type { ExtensionFamily, ExtensionKindGroup } from './components/extension-grouping';
export { VersionHistoryPanel } from './components/version-history-panel';
export type {
  VersionHistoryPanelProps,
  VersionHistoryEntry,
} from './components/version-history-panel';
export { RevealInput } from './components/reveal-input';
export type { RevealInputProps } from './components/reveal-input';
export { CopyField } from './components/copy-field';
export type { CopyFieldProps } from './components/copy-field';
export { TOKEN_NAMES } from './components/tokens';
export type { TokenName } from './components/tokens';

// -- Iconography (the only sanctioned marks; Unicode glyphs are banned) -------
export {
  NAV_ICONS,
  DashboardIcon,
  ToolsIcon,
  AgentsIcon,
  PresetsIcon,
  ExtensionsIcon,
  TemplatesIcon,
  ConnectorsIcon,
  HooksIcon,
  StorageIcon,
  SchedulingIcon,
  InteractionsIcon,
  NotificationsIcon,
  ConversationsIcon,
  MarketplaceIcon,
  ManifestIcon,
  SettingsIcon,
  SystemIcon,
  SearchIcon,
  SignOutIcon,
  MenuIcon,
  CloseIcon,
  FolderIcon,
  GridIcon,
  FilterIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CheckIcon,
  MinusIcon,
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  SortAscIcon,
  SortDescIcon,
  SunIcon,
  MoonIcon,
  MonitorIcon,
  CheckCircleIcon,
  AlertTriangleIcon,
  XCircleIcon,
  PendingIcon,
} from './components/icons';
export type { IconProps, IconComponent } from './components/icons';

// -- Schema-driven forms -----------------------------------------------------
export {
  SchemaForm,
  RecordEntryRendererContext,
  SecretRefField,
  defaultValueForSchema,
  validateAgainstSchema,
  resolveRef,
} from './schema-form';
export type {
  SchemaFormProps,
  CompletionProvider,
  RecordEntryRenderer,
  RecordEntryContext,
  SecretRefFieldProps,
  SecretRef,
  JsonSchema,
  JsonSchemaType,
  Discriminator,
  SchemaFormErrors,
} from './schema-form';

// -- Schema-editor (validated JSON-Schema authoring control) -----------------
export { SchemaEditor, lintSchemaText } from './schema-editor';
export type { SchemaEditorProps, SchemaEditorChange, SchemaLintResult } from './schema-editor';

// -- MCP context widgets (elicitation / progress / completions / output) -----
export { ProgressBar } from './components/progress-bar';
export type { ProgressBarProps } from './components/progress-bar';
export { CompletionInput } from './components/completion-input';
export type { CompletionInputProps } from './components/completion-input';
export { ElicitationForm } from './elicitation/ElicitationForm';
export type { ElicitationFormProps } from './elicitation/ElicitationForm';
export { StructuredOutput } from './structured-output/StructuredOutput';
export type { StructuredOutputProps } from './structured-output/StructuredOutput';
