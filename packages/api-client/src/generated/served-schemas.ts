// DO NOT EDIT — generated from the platform contract JSON-schema bundle.
// Source: packages/api-client/contract-schema/contract-schema.json
// Regenerate with: pnpm --filter @tai42/api-client run schema:generate
//
// One zod const + inferred type per published served document and per shared
// sub-shape. A templated-text field is the shared `templatedText` zod, never a
// bare string, so a body can never drift back to `z.string()`.
import { z } from 'zod';

import { templatedText } from '../templated-text';

export const hookSubject = z.object({ "key_expr": templatedText, "kind": z.string(), "target_kind": z.enum(["agent","tool"]), "target_name": z.string().min(1) }).strict();
export type HookSubject = z.infer<typeof hookSubject>;

export const mediaKind = z.enum(["image","link","document","video","audio"]);
export type MediaKind = z.infer<typeof mediaKind>;

export const mediaItem = z.object({ "caption": z.union([z.string(), z.null()]).default(null), "filename": z.union([z.string(), z.null()]).default(null), "kind": mediaKind, "url": z.string() });
export type MediaItem = z.infer<typeof mediaItem>;

export const overlapPolicy = z.object({ "deliver": z.enum(["one","all"]).default("one"), "running": z.enum(["continue","cancel"]).default("continue"), "settle_seconds": z.number().int().gte(0).lte(30).default(0) });
export type OverlapPolicy = z.infer<typeof overlapPolicy>;

export const presetSeedToolMeta = z.object({ "display_name": z.union([z.string(), z.null()]).default(null), "folder_path": z.union([z.string(), z.null()]).default(null), "tags": z.union([z.array(z.string()), z.null()]).default(null) });
export type PresetSeedToolMeta = z.infer<typeof presetSeedToolMeta>;

export const presetSpec = z.object({ "base_tool": z.string(), "description": z.string().default(""), "fixed_kwargs": z.record(z.string(), z.unknown()).default({}), "name": z.string() });
export type PresetSpec = z.infer<typeof presetSpec>;

export const quickReplyButtonParam = z.object({ "kind": z.literal("quick_reply").default("quick_reply"), "payload": z.string() });
export type QuickReplyButtonParam = z.infer<typeof quickReplyButtonParam>;

export const stateInjection = z.object({ "into": z.string().min(1), "jq": z.union([templatedText, z.null()]).default(null), "template_jq": z.union([z.string(), z.null()]).default(null) }).strict();
export type StateInjection = z.infer<typeof stateInjection>;

export const stateUpdate = z.object({ "adapter": z.union([templatedText, z.null()]).default(null), "jq": z.union([templatedText, z.null()]).default(null), "op_id": z.union([templatedText, z.null()]).default(null), "template_jq": z.union([z.string(), z.null()]).default(null) }).strict();
export type StateUpdate = z.infer<typeof stateUpdate>;

export const stateAttach = z.object({ "input_injections": z.array(stateInjection).default([]), "scope_expr": z.union([templatedText, z.null()]).default(null), "state": z.string(), "subject_expr": templatedText, "templates": z.array(z.string()).default([]), "updates": z.array(stateUpdate).default([]) }).strict();
export type StateAttach = z.infer<typeof stateAttach>;

export const stateBinding = z.object({ "states": z.array(stateAttach).min(1) }).strict();
export type StateBinding = z.infer<typeof stateBinding>;

export const stateTemplateDeclarations = z.object({ "check": z.union([templatedText, z.null()]).default(null), "schema": z.record(z.string(), z.unknown()) }).strict();
export type StateTemplateDeclarations = z.infer<typeof stateTemplateDeclarations>;

export const stateTemplateJq = z.object({ "description": z.string().default(""), "jq": templatedText, "params": z.array(z.string()).default([]), "purpose": z.enum(["input","update"]), "reads": z.array(z.array(z.string())).default([]), "writes": z.array(z.array(z.string())).default([]) }).strict();
export type StateTemplateJq = z.infer<typeof stateTemplateJq>;

export const stateTemplateReconcile = z.object({ "close": templatedText, "orphans": templatedText, "resolutions": templatedText }).strict();
export type StateTemplateReconcile = z.infer<typeof stateTemplateReconcile>;

export const subAgentSpec: z.ZodType = z.lazy(() => z.object({ "description": z.string().default(""), "inline_skills": z.array(z.record(z.string(), z.unknown())).default([]), "name": z.string(), "presets": z.array(presetSpec).default([]), "response_format": z.union([z.unknown(), templatedText, z.record(z.string(), z.unknown()), z.null()]).default(null), "skills": z.array(z.string()).default([]), "strategy": z.union([z.string(), z.null()]).default(null), "subagents": z.array(subAgentSpec).default([]), "system_prompt": z.union([templatedText, z.null()]).default(null), "tool_names": z.array(z.string()).default([]), "tools": z.array(z.unknown()).default([]) }));
export type SubAgentSpec = z.infer<typeof subAgentSpec>;

export const urlButtonParam = z.object({ "kind": z.literal("url").default("url"), "url_parameter": z.string() });
export type UrlButtonParam = z.infer<typeof urlButtonParam>;

export const accessPolicy = z.object({ "condition": z.union([templatedText, z.null()]).default(null), "policy_data": z.record(z.string(), z.unknown()).default({}), "scopes": z.array(z.string()).default([]) });
export type AccessPolicy = z.infer<typeof accessPolicy>;

export const callbackSchema = z.object({ "condition": z.union([templatedText, z.null()]).default(null), "expr": z.union([templatedText, z.null()]).default(null), "tool": z.string().default("") });
export type CallbackSchema = z.infer<typeof callbackSchema>;

export const channelTemplate = z.object({ "body_parameters": z.array(z.string()).default([]), "buttons": z.array(z.unknown().superRefine((x, ctx) => {
    const schemas = [quickReplyButtonParam, urlButtonParam];
    const { errors, failed } = schemas.reduce<{
      errors: z.core.$ZodIssue[];
      failed: number;
    }>(
      ({ errors, failed }, schema) =>
        ((result) =>
          result.error
            ? {
                errors: [...errors, ...result.error.issues],
                failed: failed + 1,
              }
            : { errors, failed })(
          schema.safeParse(x),
        ),
      { errors: [], failed: 0 },
    );
    const passed = schemas.length - failed;
    if (passed !== 1) {
      ctx.addIssue(errors.length ? {
        path: [],
        code: "invalid_union",
        errors: [errors],
        message: "Invalid input: Should pass single schema. Passed " + passed,
      } : {
        path: [],
        code: "custom",
        errors: [errors],
        message: "Invalid input: Should pass single schema. Passed " + passed,
      });
    }
  })).default([]), "header_media": z.union([mediaItem, z.null()]).default(null), "language": z.string(), "name": z.string() });
export type ChannelTemplate = z.infer<typeof channelTemplate>;

export const conversationRoute = z.object({ "callback_secret": z.union([z.string(), z.null()]).default(null), "callback_url": z.union([z.string(), z.null()]).default(null), "channel": z.union([z.string(), z.null()]).default(null), "door": z.enum(["api","channel"]), "error_reply_text": z.union([z.string().min(1).max(2000), z.null()]).default(null), "execution_key": z.string().min(1), "execution_key_fingerprint": z.string().min(1), "initial_mode": z.enum(["agent","manual"]).default("agent"), "locale": z.union([z.string(), z.null()]).default(null), "our_identity": z.union([z.string(), z.null()]).default(null), "overlap": overlapPolicy.default({"deliver":"one","running":"continue","settle_seconds":0}), "payload_expr": z.union([templatedText, z.null()]).default(null), "reply_expr": z.union([templatedText, z.null()]).default(null), "route_name": z.string(), "target_kind": z.enum(["agent","tool"]), "target_name": z.string().min(1), "turns_per_hour_override": z.union([z.number().int().gt(0), z.null()]).default(null) });
export type ConversationRoute = z.infer<typeof conversationRoute>;

export const conversationRouteCreate = z.object({ "callback_url": z.union([z.string(), z.null()]).default(null), "channel": z.union([z.string(), z.null()]).default(null), "door": z.enum(["api","channel"]), "error_reply_text": z.union([z.string().min(1).max(2000), z.null()]).default(null), "execution_key": z.string().min(1), "initial_mode": z.enum(["agent","manual"]).default("agent"), "locale": z.union([z.string(), z.null()]).default(null), "our_identity": z.union([z.string(), z.null()]).default(null), "overlap": overlapPolicy.default({"deliver":"one","running":"continue","settle_seconds":0}), "payload_expr": z.union([templatedText, z.null()]).default(null), "reply_expr": z.union([templatedText, z.null()]).default(null), "route_name": z.string(), "target_kind": z.enum(["agent","tool"]), "target_name": z.string().min(1), "turns_per_hour_override": z.union([z.number().int().gt(0), z.null()]).default(null) });
export type ConversationRouteCreate = z.infer<typeof conversationRouteCreate>;

export const hookParams = z.object({ "condition": z.union([templatedText, z.null()]).default(null), "execution_key": z.string().min(1), "execution_key_fingerprint": z.string().min(1), "expr": z.union([templatedText, z.null()]).default(null), "name": z.string().min(1), "state_binding": z.union([stateBinding, z.null()]).default(null), "subject": z.union([hookSubject, z.null()]).default(null), "tool": z.string().min(1), "tool_kwargs": z.record(z.string(), z.unknown()).default({}), "topic": z.string().min(1) });
export type HookParams = z.infer<typeof hookParams>;

export const hookRegister = z.object({ "condition": z.union([templatedText, z.null()]).default(null), "execution_key": z.string().min(1), "expr": z.union([templatedText, z.null()]).default(null), "name": z.string().min(1), "state_binding": z.union([stateBinding, z.null()]).default(null), "subject": z.union([hookSubject, z.null()]).default(null), "tool": z.string().min(1), "tool_kwargs": z.record(z.string(), z.unknown()).default({}), "topic": z.string().min(1) });
export type HookRegister = z.infer<typeof hookRegister>;

export const presetBody = z.object({ "base_tool": z.string(), "description": z.string().default(""), "extensions": z.array(z.array(z.union([z.string(), z.record(z.string(), z.unknown())]))).default([]), "fixed_kwargs": z.record(z.string(), z.unknown()).default({}), "input_schema": z.union([templatedText, z.record(z.string(), z.unknown()), z.null()]).default(null), "output_schema": z.union([templatedText, z.record(z.string(), z.unknown()), z.null()]).default(null), "state_binding": z.union([stateBinding, z.null()]).default(null) });
export type PresetBody = z.infer<typeof presetBody>;

export const presetSeed = z.object({ "base_tool": z.string(), "description": z.string(), "fixed_kwargs": z.record(z.string(), z.unknown()).default({}), "input_schema": z.union([templatedText, z.record(z.string(), z.unknown()), z.null()]).default(null), "name": z.string(), "output_schema": z.union([templatedText, z.record(z.string(), z.unknown()), z.null()]).default(null), "state_binding": z.union([stateBinding, z.null()]).default(null), "tool_meta": z.union([presetSeedToolMeta, z.null()]).default(null) });
export type PresetSeed = z.infer<typeof presetSeed>;

export const roleDefinition = z.object({ "allow_all": z.boolean().default(false), "base_tier": z.union([z.string(), z.null()]).default(null), "condition": z.union([templatedText, z.null()]).default(null), "description": z.string(), "grants": z.record(z.string(), z.enum(["none","read","write"])), "name": z.string(), "scopes": z.array(z.string()).default([]) });
export type RoleDefinition = z.infer<typeof roleDefinition>;

export const stateDeclaration = z.object({ "default_subject_kind": z.string(), "description": z.string().default(""), "effective_schema": z.union([z.record(z.string(), z.unknown()), z.null()]).default(null), "name": z.string(), "regimes": z.union([z.array(z.record(z.string(), z.unknown())), z.null()]).default(null), "retention_days": z.union([z.number().int().gt(0).lte(2147483647), z.null()]).default(null), "schema": z.union([templatedText, z.record(z.string(), z.unknown())]).optional(), "subject_kinds": z.array(z.string()).min(1), "updated_at": z.union([z.string().datetime({ offset: true }), z.null()]).default(null) }).strict();
export type StateDeclaration = z.infer<typeof stateDeclaration>;

export const stateTemplateDocument = z.object({ "declarations": z.union([stateTemplateDeclarations, z.null()]).default(null), "description": z.string().default(""), "kind": z.literal("state-template").default("state-template"), "name": z.string(), "parameters": z.record(z.string(), z.unknown()).default({}), "reconcile": z.union([stateTemplateReconcile, z.null()]).default(null), "regimes": z.array(z.record(z.string(), z.unknown())).default([]), "schema": z.union([templatedText, z.record(z.string(), z.unknown())]).optional(), "template_jq": z.union([z.record(z.string(), stateTemplateJq), z.null()]).default(null), "trace": z.record(z.string(), z.unknown()).default({}) }).strict();
export type StateTemplateDocument = z.infer<typeof stateTemplateDocument>;

export const targetConversationConfig = z.object({ "greeting_template": z.union([z.string(), z.null()]).default(null), "multichannel": z.boolean().default(false), "state_binding": z.union([stateBinding, z.null()]).default(null), "target_kind": z.enum(["agent","tool"]), "target_name": z.string().min(1) });
export type TargetConversationConfig = z.infer<typeof targetConversationConfig>;
