/**
 * The shared state-binding editor — the ONE binding shape every door and every flow
 * node authors. Consumed by the platform door screens, the tai42 states surface, and
 * (in the flow engine) the node State tab. Holds no edge to jq; paints from SDK
 * tokens only.
 */
export { StateBindingEditor } from './StateBindingEditor';
export type { StateBindingEditorProps } from './StateBindingEditor';
export { StateBindingSection } from './StateBindingSection';
export type { StateBindingSectionProps } from './StateBindingSection';
export { StateAttachRow } from './StateAttachRow';
export type { StateAttachRowProps, InheritedSubject } from './StateAttachRow';
export { InjectionList } from './InputInjectionRow';
export type { InjectionListProps } from './InputInjectionRow';
export { UpdateList } from './UpdateRow';
export type { UpdateListProps } from './UpdateRow';
export { AdapterMapping } from './AdapterMapping';
export type { AdapterMappingProps } from './AdapterMapping';
export { SubjectScopeFields } from './SubjectScopeFields';
export type { SubjectScopeFieldsProps } from './SubjectScopeFields';
export { BindingJqField, appendTjq } from './BindingJqField';
export type { BindingJqFieldProps, TemplateJqSuggestion } from './BindingJqField';
export { resolveTemplateJq, findByRef, resolveCallName } from './catalog';
export type { ResolvedTemplateJq } from './catalog';
export {
  templatesCatalogFromList,
  statesCatalogFromList,
  fieldPathsFromSchema,
} from './build-catalog';
export {
  compileAdapter,
  rowValueJq,
  fieldPathToJq,
  jqKey,
  defaultRowsForInput,
  parseAdapter,
  parseFieldPath,
  generateTemplateCall,
  parseTemplateCall,
  encodeTemplateSegment,
} from './adapter';
export type {
  MappingRow,
  MappingSource,
  FieldSource,
  LiteralSource,
  JqSource,
  FieldRoot,
  AdapterCompileResult,
} from './adapter';
export type {
  BindingStateOption,
  BindingTemplateOption,
  BindingTemplateJqOption,
  BindingSourceSchemas,
  SchemaFieldPath,
  StateBinding,
  StateAttach,
  StateInjection,
  StateUpdate,
} from './types';
