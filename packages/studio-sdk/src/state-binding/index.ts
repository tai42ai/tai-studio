/**
 * The shared state-binding editor — the ONE binding shape every door and every flow
 * node authors. Consumed by the platform door screens, the tai42 states surface, and
 * (in the flow engine) the node State tab. Holds no edge to jq; paints from SDK
 * tokens only.
 */
export type {
  AdapterCompileResult,
  FieldRoot,
  FieldSource,
  JqSource,
  LiteralSource,
  MappingRow,
  MappingSource,
} from './adapter';
export {
  compileAdapter,
  defaultRowsForInput,
  encodeTemplateSegment,
  fieldPathToJq,
  generateTemplateCall,
  jqKey,
  parseAdapter,
  parseFieldPath,
  parseTemplateCall,
  rowValueJq,
} from './adapter';
export type { AdapterMappingProps } from './AdapterMapping';
export { AdapterMapping } from './AdapterMapping';
export type { BindingJqFieldProps, TemplateJqSuggestion } from './BindingJqField';
export { appendTjq, BindingJqField } from './BindingJqField';
export type { BindingTemplatedJqFieldProps } from './BindingTemplatedJqField';
export { BindingTemplatedJqField } from './BindingTemplatedJqField';
export {
  fieldPathsFromSchema,
  statesCatalogFromList,
  templatesCatalogFromList,
} from './build-catalog';
export type { ResolvedTemplateJq } from './catalog';
export { findByRef, resolveCallName, resolveTemplateJq } from './catalog';
export type { InjectionListProps } from './InputInjectionRow';
export { InjectionList } from './InputInjectionRow';
export type { InheritedSubject, StateAttachRowProps } from './StateAttachRow';
export { StateAttachRow } from './StateAttachRow';
export type { StateBindingEditorProps } from './StateBindingEditor';
export { StateBindingEditor } from './StateBindingEditor';
export type { StateBindingSectionProps } from './StateBindingSection';
export { StateBindingSection } from './StateBindingSection';
export type { SubjectScopeFieldsProps } from './SubjectScopeFields';
export { SubjectScopeFields } from './SubjectScopeFields';
export type { StoragePresenceQueryLike, TemplateNamesQueryLike } from './templated-text-catalog';
export { templatedTextCatalog } from './templated-text-catalog';
export type {
  BindingSourceSchemas,
  BindingStateOption,
  BindingTemplateJqOption,
  BindingTemplateOption,
  SchemaFieldPath,
  StateAttach,
  StateBinding,
  StateInjection,
  StateUpdate,
  TemplatedText,
  TemplatedTextCatalog,
} from './types';
export type { UpdateListProps } from './UpdateRow';
export { UpdateList } from './UpdateRow';
