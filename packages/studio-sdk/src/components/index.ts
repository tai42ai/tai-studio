/**
 * The design system the package publishes: the primitives, inputs, pickers, layout
 * and report components every feature and plugin builds on, the token names, the
 * icon set and the MCP context widgets.
 */
export type { ActionMenuItem, ActionMenuProps } from './action-menu';
export { ActionMenu } from './action-menu';
export type { AgentListQuery, AgentPickerProps } from './agent-picker';
export { AgentPicker } from './agent-picker';
export type { BadgeProps } from './badge';
export { Badge } from './badge';
export type { ChannelListQuery, ChannelPickerProps } from './channel-picker';
export { channelIdentityHint, ChannelPicker } from './channel-picker';
export type { CheckboxProps } from './checkbox';
export { Checkbox } from './checkbox';
export type { ChipGroupProps, ChipOption } from './chip-group';
export { ChipGroup } from './chip-group';
export type { CodeBlockProps } from './code-block';
export { CodeBlock } from './code-block';
export type { ConfirmDialogProps } from './confirm-dialog';
export { ConfirmDialog } from './confirm-dialog';
export type { CopyFieldProps } from './copy-field';
export { CopyField } from './copy-field';
export type { DateRangePickerProps, DateRangePreset, DateRangeValue } from './date-range-picker';
export {
  DateRangePicker,
  DEFAULT_DATE_RANGE_PRESETS,
  formatRangeLabel,
  normalizeCustomRange,
} from './date-range-picker';
export type { DialogProps } from './dialog';
export { Dialog } from './dialog';
export { DirtyGuardBoundary, GuardedTabs, useRegisterDirty } from './dirty-guard';
export type { DrawerProps } from './drawer';
export { Drawer } from './drawer';
export type { EntityCardGridProps } from './entity-card-grid';
export { EntityCardGrid } from './entity-card-grid';
export type { ErrorBoundaryProps, ErrorBoundaryState } from './error-boundary';
export { ErrorBoundary } from './error-boundary';
export type { ExecutionKeyPickerProps, ExecutionKeyQuery } from './execution-key-picker';
export {
  canHoldExecutionKey,
  ExecutionKeyPicker,
  isExecutionKeyListEmpty,
} from './execution-key-picker';
export type {
  ExplorerColumn,
  ExplorerEmptyState,
  ExplorerEmptyStates,
  ExplorerSearch,
  ExplorerTags,
  ExplorerViewProps,
  TagVocabularyEntry,
} from './explorer-view';
export {
  buildTagVocabulary,
  ExplorerView,
  matchesSelectedTags,
  UNTAGGED_TOKEN,
} from './explorer-view';
export type { ExtensionComboBuilderProps } from './extension-combo-builder';
export { ExtensionComboBuilder } from './extension-combo-builder';
export type { ExtensionKindGroup } from './extension-grouping';
export { groupByKind } from './extension-grouping';
export type { ExtensionPickerProps } from './extension-picker';
export { ExtensionPicker } from './extension-picker';
export type { ExternalLinkButtonProps } from './external-link';
export { ExternalLinkButton, isSafeHttpUrl } from './external-link';
export type { FailedReplyOutcomeProps } from './failed-reply-outcome';
export { FailedReplyOutcome } from './failed-reply-outcome';
export type { FieldControlProps, FieldProps } from './field';
export { Field, useFieldControl } from './field';
export type { FleetOutcomeReportProps } from './fleet-outcome-report';
export { FleetOutcomeReport } from './fleet-outcome-report';
export type { FleetReloadReportProps } from './fleet-reload-report';
export { FleetReloadReport } from './fleet-reload-report';
export type { FleetReportProps } from './fleet-report';
export { FleetReport } from './fleet-report';
export type { FormDialogProps } from './form-dialog';
export { FormDialog } from './form-dialog';
export type {
  HolderHref,
  HolderListProps,
  HolderPreviewProps,
  HolderPreviewState,
} from './holder-list';
export { HolderList, HolderPreview, previewHolders, useHolderHref } from './holder-list';
export type { ControlRefProps, NumberInputProps, TextareaProps, TextInputProps } from './inputs';
export { NumberInput, Textarea, TextInput } from './inputs';
export type { JsonDiffProps, JsonDiffRow } from './json-diff';
export { diffJson, JsonDiff } from './json-diff';
export type { JsonTreeProps } from './json-tree';
export { JsonTree } from './json-tree';
export type { HeadingLevel, MarkdownBlock, MarkdownProps } from './markdown';
export { Markdown, parseMarkdown } from './markdown';
export type { McpListingRefusalProps, McpListingRefusalReason } from './mcp-listing-refusal';
export { McpListingRefusal, mcpListingRefusalOf } from './mcp-listing-refusal';
export type { ListReadFlags } from './named-list-picker';
export type { OpenTargetOptions, OpenTargetProps } from './open-target';
export { openTargetProps } from './open-target';
export type { OverlayDetails, OverlayDetailsFieldsProps } from './overlay-details-fields';
export { OverlayDetailsFields, overlayDetailsPatch } from './overlay-details-fields';
export { PageFillProvider, useFillViewport, usePageFillActive } from './page-fill';
export type {
  LayoutElementProps,
  PageHeaderProps,
  PageLayoutProps,
  StackProps,
} from './page-header';
export { Page, PageHeader, Stack } from './page-header';
export type {
  ButtonActionProps,
  ButtonProps,
  ButtonVariant,
  ButtonVariantProps,
  CardProps,
  EmptyStateProps,
  ErrorStateProps,
  LinkButtonProps,
  SkeletonProps,
  SpinnerProps,
  SurfaceProps,
} from './primitives';
export { Button, Card, EmptyState, ErrorState, Skeleton, Spinner } from './primitives';
export { safeHttpUrl } from './primitives';
export type { RadioGroupProps, RadioOption } from './radio-group';
export { RadioGroup } from './radio-group';
export type { RecycleRollSectionProps } from './recycle-roll';
export { RecycleRollSection } from './recycle-roll';
export type { RevealInputProps } from './reveal-input';
export { RevealInput } from './reveal-input';
export type {
  OverflowAxis,
  OverflowRegionAttributes,
  ProseScrollLabels,
  ScrollRegionProps,
} from './scroll-region';
export { ScrollRegion, useOverflowRegion, useProseScrollRegions } from './scroll-region';
export type {
  SearchableSelectArgs,
  SearchableSelectGroupsProps,
  SearchableSelectProps,
  SearchableSelectSharedProps,
} from './searchable-select';
export { SearchableSelect } from './searchable-select';
export type { SearchableSelectGroup, SearchableSelectOption } from './searchable-select-model';
export type {
  SelectArgs,
  SelectGroup,
  SelectGroupsProps,
  SelectOption,
  SelectProps,
  SelectSharedProps,
} from './select';
export { Select } from './select';
export type {
  MediaDocumentProps,
  MediaImageProps,
  MediaPlayerProps,
  ServedMediaGrammar,
} from './served-media';
export {
  isRenderableMediaSrc,
  isServedMediaUrl,
  MediaDocument,
  MediaImage,
  MediaPlayer,
  resolveMediaSrc,
} from './served-media';
export type { StepperProps, StepperStatus, StepperStep } from './stepper';
export { Stepper } from './stepper';
export type {
  SubjectSectionKeyFieldProps,
  SubjectSectionProps,
  SubjectSectionSharedProps,
  SubjectSectionTextKeyProps,
  SubjectTargetOption,
} from './subject-section';
export {
  buildSubject,
  SUBJECT_INCOMPLETE_MESSAGE,
  SubjectSection,
  toSubjectTargetOptions,
  useSubjectFields,
} from './subject-section';
export type {
  NumericColumnProps,
  TableProps,
  TableRowProps,
  TableSectionProps,
  TDProps,
  THProps,
} from './table';
export { Table, TBody, TD, TH, THead, TR } from './table';
export type { TabItem, TabsProps } from './tabs';
export { Tabs } from './tabs';
export type { TagChipsProps, TagsInputProps } from './tags';
export { TagChips, TagsInput } from './tags';
export type {
  TemplatedTextFieldProps,
  TemplatedTextInlineProps,
  TemplatedTextTemplateOption,
} from './templated-text-field';
export { TemplatedTextField, templatedTextSummary } from './templated-text-field';
export type { TokenName } from './tokens';
export { TOKEN_NAMES } from './tokens';
export type { ToolListQuery, ToolPickerProps } from './tool-picker';
export {
  BADGES_NOTE,
  TOOL_SEARCH_NAMES_ONLY_NOTE,
  ToolPicker,
  toolSearchShown,
} from './tool-picker';
export type { TooltipProps } from './tooltip';
export { Tooltip } from './tooltip';
export type { VersionHistoryEntry, VersionHistoryPanelProps } from './version-history-panel';
export { VersionHistoryPanel } from './version-history-panel';
export type { ViewMode, ViewToggleProps } from './view-toggle';
export { useViewMode, ViewToggle } from './view-toggle';
export type { WriteFailureProps } from './write-failure';
export { WriteFailure } from './write-failure';

// -- Iconography (the only sanctioned marks; Unicode glyphs are banned) -------
export type { IconComponent, IconProps } from './icons';
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
} from './icons';

// -- MCP context widgets (progress / completions) -----------------------------
export type { CompletionInputProps } from './completion-input';
export { CompletionInput } from './completion-input';
export type { ProgressBarProps } from './progress-bar';
export { ProgressBar } from './progress-bar';
