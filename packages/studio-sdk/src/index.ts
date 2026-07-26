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
import './components/tokens.css';
import './components/fonts.css';
import './components/components.css';

// -- Plugin API --------------------------------------------------------------
export type {
  PluginContext,
  PluginEntry,
  ToolPanelProps,
  PluginPageProps,
  SettingsTabProps,
  ToolPanelContribution,
  PageContribution,
  RegisteredPage,
  SettingsTabContribution,
  RegisteredSettingsTab,
  NavEntryContribution,
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
export { ThemeProvider, useTheme } from './hooks/useTheme';
export type { Theme, ThemeState } from './hooks/useTheme';
export { useInteractionsStream } from './hooks/useSse';
export type { InteractionsStreamState, StreamInteraction } from './hooks/useSse';

// -- Navigation (shell ⇄ feature route-token contract) -----------------------
export { NavigationProvider, AppLink, useAppNavigate, useResolvePath } from './navigation';
export type {
  AppLinkProps,
  RouteToken,
  RouteSearch,
  RouteSearchByToken,
  PageProps,
  NavigationContextValue,
} from './navigation';

// -- Utilities ---------------------------------------------------------------
export { errorMessage } from './errors';
export { downloadBlob } from './download';

// -- Cross-feature query keys ------------------------------------------------
export { toolsListKey, extensionsQueryKey, subMcpKey, tokensPayloadKey } from './query-keys';

// -- Extension-combo editing helpers -----------------------------------------
export { comboElementNames, extensionElementName } from './extension-combos';

// -- Design system -----------------------------------------------------------
export { Button, Card, Skeleton, EmptyState, ErrorState, Spinner } from './components/primitives';
export type { ButtonProps } from './components/primitives';
export { ErrorBoundary } from './components/error-boundary';
export type { ErrorBoundaryProps } from './components/error-boundary';
export { Field, useFieldControl } from './components/field';
export type { FieldProps, FieldControlProps } from './components/field';
export { TextInput, Textarea, NumberInput } from './components/inputs';
export type { TextInputProps, TextareaProps, NumberInputProps } from './components/inputs';
export { Select } from './components/select';
export type { SelectProps, SelectOption, SelectGroup } from './components/select';
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
export { Tooltip } from './components/tooltip';
export type { TooltipProps } from './components/tooltip';
export { Table, THead, TBody, TR, TH, TD } from './components/table';
export { JsonTree } from './components/json-tree';
export type { JsonTreeProps } from './components/json-tree';
export { JsonDiff, diffJson } from './components/json-diff';
export type { JsonDiffProps, JsonDiffRow } from './components/json-diff';
export { TagChips, TagsInput } from './components/tags';
export { CodeBlock } from './components/code-block';
export type { CodeBlockProps } from './components/code-block';
export { FleetReport } from './components/fleet-report';
export { ExternalLinkButton, isSafeHttpUrl } from './components/external-link';
export type { ExternalLinkButtonProps } from './components/external-link';
export { ToolPicker } from './components/tool-picker';
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

// -- Schema-driven forms -----------------------------------------------------
export {
  SchemaForm,
  defaultValueForSchema,
  validateAgainstSchema,
  resolveRef,
} from './schema-form';
export type {
  SchemaFormProps,
  CompletionProvider,
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
