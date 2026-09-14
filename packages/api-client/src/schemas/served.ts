/** Generated served-document schema aliases and templated-text re-exports. */
import { z } from 'zod';
import * as generated from '../generated/served-schemas';

export { templatedText, requiredTemplatedText } from '../templated-text';
export type { TemplatedText } from '../templated-text';

// Served-document schemas are GENERATED from the platform contract JSON-schema
// bundle (src/generated/served-schemas.ts) and re-exported here under the names the
// rest of the client uses. The generator maps every `x-tai42-templated-text` field
// to the shared `templatedText` zod, so a served body can never be a bare string.
export const stateInjection = generated.stateInjection;
export type StateInjection = z.infer<typeof stateInjection>;
export const stateUpdate = generated.stateUpdate;
export type StateUpdate = z.infer<typeof stateUpdate>;
export const stateAttach = generated.stateAttach;
export type StateAttach = z.infer<typeof stateAttach>;
export const stateBinding = generated.stateBinding;
export type StateBinding = z.infer<typeof stateBinding>;
export const presetBody = generated.presetBody;
export type PresetBody = z.input<typeof presetBody>;
export const conversationRoute = generated.conversationRoute;
export type ConversationRoute = z.infer<typeof conversationRoute>;
export const conversationRouteCreate = generated.conversationRouteCreate;
export type ConversationRouteCreate = z.input<typeof conversationRouteCreate>;
export const targetConversationConfig = generated.targetConversationConfig;
export type TargetConversationConfig = z.input<typeof targetConversationConfig>;
export const channelTemplate = generated.channelTemplate;
export type ChannelTemplate = z.infer<typeof channelTemplate>;
export const hookSubject = generated.hookSubject;
export type HookSubject = z.infer<typeof hookSubject>;
export const hookParams = generated.hookParams;
export type HookParams = z.infer<typeof hookParams>;
export const hookRegister = generated.hookRegister;
export type HookRegister = z.input<typeof hookRegister>;
export const stateDeclaration = generated.stateDeclaration;
export type StateDeclaration = z.infer<typeof stateDeclaration>;
export const stateTemplateDocument = generated.stateTemplateDocument;
export type StateTemplateDocument = z.infer<typeof stateTemplateDocument>;
export const templateJq = generated.stateTemplateJq;
export type TemplateJq = z.infer<typeof templateJq>;
export const templateReconcile = generated.stateTemplateReconcile;
export type TemplateReconcile = z.infer<typeof templateReconcile>;
export const templateDeclarations = generated.stateTemplateDeclarations;
export type TemplateDeclarations = z.infer<typeof templateDeclarations>;
export const policyBody = generated.accessPolicy;
export type PolicyBody = z.infer<typeof policyBody>;
export const roleBody = generated.roleDefinition;
export type RoleBody = z.infer<typeof roleBody>;
