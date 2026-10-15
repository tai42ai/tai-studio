// DO NOT EDIT — generated from the skeleton OpenAPI artifact.
// Source: packages/api-client/contract-schema/openapi.json
// Regenerate with: pnpm --filter @tai42/api-client run schema:generate
//
// One zod const + inferred type per OpenAPI component. A component that is a contract
// document re-exports the served const; `responseSchemas` maps each operation whose
// success body is the `{"data": …}` envelope to the const of its `data`.
import { z } from 'zod';

import { templatedText } from '../templated-text';
import * as served from './served-schemas';

export const channelTemplate = served.channelTemplate;
export type ChannelTemplate = served.ChannelTemplate;

export const hookParams = served.hookParams;
export type HookParams = served.HookParams;

export const hookRegister = served.hookRegister;
export type HookRegister = served.HookRegister;

export const hookSubject = served.hookSubject;
export type HookSubject = served.HookSubject;

export const roleDefinition = served.roleDefinition;
export type RoleDefinition = served.RoleDefinition;

export const scheduleCreate = served.scheduleCreate;
export type ScheduleCreate = served.ScheduleCreate;

export const scheduleListRow = served.scheduleListRow;
export type ScheduleListRow = served.ScheduleListRow;

export const stateAttach = served.stateAttach;
export type StateAttach = served.StateAttach;

export const stateBinding = served.stateBinding;
export type StateBinding = served.StateBinding;

export const stateDeclaration = served.stateDeclaration;
export type StateDeclaration = served.StateDeclaration;

export const stateInjection = served.stateInjection;
export type StateInjection = served.StateInjection;

export const stateTemplateDocument = served.stateTemplateDocument;
export type StateTemplateDocument = served.StateTemplateDocument;

export const stateUpdate = served.stateUpdate;
export type StateUpdate = served.StateUpdate;

export const targetConversationConfig = served.targetConversationConfig;
export type TargetConversationConfig = served.TargetConversationConfig;

export const addServerRequest = z.object({ "category": z.string().nullable().default(null), "description": z.string().default(""), "display_name": z.string().nullable().default(null), "icon_url": z.string().nullable().default(null), "id": z.string().nullable().default(null), "scopes": z.array(z.string()).default([]), "url": z.string() });
export type AddServerRequest = z.infer<typeof addServerRequest>;

export const jsonValue = z.unknown();
export type JsonValue = z.infer<typeof jsonValue>;

export const advisorySnapshot = z.object({ "advisories": z.array(z.record(z.string(), jsonValue)), "fetched_at": z.string() });
export type AdvisorySnapshot = z.infer<typeof advisorySnapshot>;

export const agentView = z.object({ "description": z.string(), "input_schema": jsonValue, "name": z.string(), "spec_runnable": z.boolean(), "tool_name": z.string() });
export type AgentView = z.infer<typeof agentView>;

export const agentListing = z.object({ "items": z.array(agentView), "total": z.number().int() });
export type AgentListing = z.infer<typeof agentListing>;

export const agentRunInput = z.record(z.string(), z.unknown());
export type AgentRunInput = z.infer<typeof agentRunInput>;

export const agentsConfig = z.object({ "exclude": z.array(z.string()).default([]), "include": z.array(z.string()).default([]), "module": z.string(), "title": z.string() }).strict();
export type AgentsConfig = z.infer<typeof agentsConfig>;

export const agentsEntriesAdd = z.object({ "entries": z.array(agentsConfig), "replace": z.boolean().default(false) });
export type AgentsEntriesAdd = z.infer<typeof agentsEntriesAdd>;

export const answerFormat = z.enum(["text","confirm","select","form","external","free"]);
export type AnswerFormat = z.infer<typeof answerFormat>;

export const formPageWording = z.object({ "choose_one": z.string().nullable().default(null), "date_unavailable": z.string().nullable().default(null), "failed": z.string().nullable().default(null), "network_error": z.string().nullable().default(null), "update_failed": z.string().nullable().default(null) }).strict();
export type FormPageWording = z.infer<typeof formPageWording>;

export const pageCopy = z.object({ "heading": z.string().nullable().default(null), "text": z.string().nullable().default(null) }).strict();
export type PageCopy = z.infer<typeof pageCopy>;

export const answerPageWording = z.object({ "awaiting": pageCopy.nullable().default(null), "confirm": pageCopy.nullable().default(null), "done": pageCopy.nullable().default(null), "form": formPageWording.nullable().default(null), "submitted": pageCopy.nullable().default(null) }).strict();
export type AnswerPageWording = z.infer<typeof answerPageWording>;

export const formOption = z.object({ "label": z.string().nullable().default(null), "value": z.string() }).strict();
export type FormOption = z.infer<typeof formOption>;

export const formData = z.object({ "options": z.record(z.string(), z.array(formOption)).default({}), "values": z.record(z.string(), z.unknown()).default({}) }).strict();
export type FormData = z.infer<typeof formData>;

export const displayBlock = z.object({ "alt": z.string().nullable().default(null), "kind": z.enum(["heading","body","image"]), "slot": z.string().nullable().default(null), "src": z.string().nullable().default(null), "text": z.string().nullable().default(null) }).strict();
export type DisplayBlock = z.infer<typeof displayBlock>;

export const formPage = z.object({ "button_label": z.string().nullable().default(null), "display": z.array(displayBlock).default([]), "fields": z.array(z.string()), "kind": z.enum(["input","review"]).default("input"), "title": z.string() }).strict();
export type FormPage = z.infer<typeof formPage>;

export const linkOption = z.object({ "kind": z.literal("link").default("link"), "label": z.string(), "url": z.string() }).strict();
export type LinkOption = z.infer<typeof linkOption>;

export const locationElement = z.object({ "address": z.string().nullable().default(null), "latitude": z.number(), "longitude": z.number(), "name": z.string().nullable().default(null) }).strict();
export type LocationElement = z.infer<typeof locationElement>;

export const mediaKind = z.enum(["image","link","document","video","audio"]);
export type MediaKind = z.infer<typeof mediaKind>;

export const mediaItem = z.object({ "caption": z.string().nullable().default(null), "filename": z.string().nullable().default(null), "kind": mediaKind, "url": z.string() }).strict();
export type MediaItem = z.infer<typeof mediaItem>;

export const replyOption = z.object({ "description": z.string().nullable().default(null), "id": z.string().nullable().default(null), "kind": z.literal("reply").default("reply"), "text": z.string() }).strict();
export type ReplyOption = z.infer<typeof replyOption>;

export const optionSection = z.object({ "rows": z.array(replyOption), "title": z.string() }).strict();
export type OptionSection = z.infer<typeof optionSection>;

export const answerWording = z.object({ "confirm": z.string().nullable().default(null), "decline": z.string().nullable().default(null), "open": z.string().nullable().default(null), "rejected": z.string().nullable().default(null), "rejected_final": z.string().nullable().default(null), "reply_hint": z.string().nullable().default(null), "submit": z.string().nullable().default(null) }).strict();
export type AnswerWording = z.infer<typeof answerWording>;

export const choiceWording = z.object({ "group_label": z.string().nullable().default(null), "label": z.string().nullable().default(null), "reply_hint": z.string().nullable().default(null) }).strict();
export type ChoiceWording = z.infer<typeof choiceWording>;

export const fieldWording = z.object({ "choice_label": z.string().nullable().default(null) }).strict();
export type FieldWording = z.infer<typeof fieldWording>;

export const formWording = z.object({ "back": z.string().nullable().default(null), "cancel": z.string().nullable().default(null), "fields": z.record(z.string(), fieldWording).default({}), "open": z.string().nullable().default(null), "review_empty": z.string().nullable().default(null), "submit": z.string().nullable().default(null), "title": z.string().nullable().default(null) }).strict();
export type FormWording = z.infer<typeof formWording>;

export const lineWording = z.object({ "answer_link": z.string().nullable().default(null), "deadline": z.string().nullable().default(null), "options": z.string().nullable().default(null), "reply": z.string().nullable().default(null) }).strict();
export type LineWording = z.infer<typeof lineWording>;

export const countdownWording = z.object({ "one_second_left": z.string().nullable().default(null), "seconds_left": z.string().nullable().default(null), "under_half_minute": z.string().nullable().default(null), "under_minute": z.string().nullable().default(null), "under_ten_seconds": z.string().nullable().default(null) }).strict();
export type CountdownWording = z.infer<typeof countdownWording>;

export const statusWording = z.object({ "answered": z.string().nullable().default(null), "closed": z.string().nullable().default(null), "countdown": countdownWording.nullable().default(null), "expired": z.string().nullable().default(null), "sending": z.string().nullable().default(null), "sent": z.string().nullable().default(null), "unavailable": z.string().nullable().default(null) }).strict();
export type StatusWording = z.infer<typeof statusWording>;

export const wording = z.object({ "answer": answerWording.nullable().default(null), "answer_page": answerPageWording.nullable().default(null), "choice": choiceWording.nullable().default(null), "form": formWording.nullable().default(null), "lines": lineWording.nullable().default(null), "status": statusWording.nullable().default(null) }).strict();
export type Wording = z.infer<typeof wording>;

export const answerPart = z.object({ "data": formData.nullable().default(null), "footer": z.string().nullable().default(null), "form_tag": z.string().nullable().default(null), "header": mediaItem.nullable().default(null), "location": locationElement.nullable().default(null), "media": z.array(mediaItem).nullable().default(null), "message": z.string().default(""), "options": z.array(z.discriminatedUnion("kind", [replyOption, linkOption])).nullable().default(null), "pages": z.array(formPage).nullable().default(null), "schema": z.record(z.string(), z.unknown()).nullable().default(null), "sections": z.array(optionSection).nullable().default(null), "template": channelTemplate.nullable().default(null), "wording": wording.nullable().default(null) }).strict();
export type AnswerPart = z.infer<typeof answerPart>;

export const overlapPolicy = z.object({ "deliver": z.enum(["one","all"]).default("one"), "running": z.enum(["continue","cancel"]).default("continue"), "settle_seconds": z.number().int().gte(0).lte(30).default(0) });
export type OverlapPolicy = z.infer<typeof overlapPolicy>;

export const apiConversationRouteCreate = z.object({ "callback_url": z.string().regex(new RegExp("^[hH][tT][tT][pP][sS]://[^/?#@]+(?:[/?#]|$)")).nullable().default(null), "cancel_expr": templatedText.nullable().default(null), "channel": z.null().default(null), "door": z.literal("api"), "error_reply_text": z.string().regex(new RegExp("\\S")).min(1).max(2000).nullable().default(null), "execution_key": z.string().min(1), "extras_expr": templatedText.nullable().default(null), "initial_mode": z.enum(["agent","manual"]).default("agent"), "locale": z.string().nullable().default(null), "our_identity": z.null().default(null), "overlap": overlapPolicy.default({"deliver":"one","running":"continue","settle_seconds":0}), "reply_expr": templatedText.nullable().default(null), "resume_expr": templatedText.nullable().default(null), "route_name": z.string().regex(new RegExp("^[a-z0-9-]+$")), "start_expr": templatedText.nullable().default(null), "target_kind": z.enum(["agent","tool"]), "target_name": z.string().min(1), "turns_per_hour_override": z.number().int().gt(0).nullable().default(null) });
export type ApiConversationRouteCreate = z.infer<typeof apiConversationRouteCreate>;

export const apiConversationRouteView = z.object({ "callback_url": z.string().regex(new RegExp("^[hH][tT][tT][pP][sS]://[^/?#@]+(?:[/?#]|$)")).nullable().default(null), "cancel_expr": templatedText.nullable().default(null), "channel": z.null().default(null), "door": z.literal("api"), "error_reply_text": z.string().regex(new RegExp("\\S")).min(1).max(2000).nullable().default(null), "execution_key": z.string().min(1), "execution_key_fingerprint": z.string(), "extras_expr": templatedText.nullable().default(null), "initial_mode": z.enum(["agent","manual"]).default("agent"), "locale": z.string().nullable().default(null), "our_identity": z.null().default(null), "overlap": overlapPolicy.default({"deliver":"one","running":"continue","settle_seconds":0}), "reply_expr": templatedText.nullable().default(null), "resume_expr": templatedText.nullable().default(null), "route_name": z.string().regex(new RegExp("^[a-z0-9-]+$")), "start_expr": templatedText.nullable().default(null), "target_kind": z.enum(["agent","tool"]), "target_name": z.string().min(1), "turns_per_hour_override": z.number().int().gt(0).nullable().default(null) });
export type ApiConversationRouteView = z.infer<typeof apiConversationRouteView>;

export const apiKeyCreate = z.object({ "condition": templatedText.nullable().default(null), "description": z.string().min(1), "owner_user_id": z.string().nullable().default(null), "policy_data": z.record(z.string(), z.unknown()).nullable().default(null), "scopes": z.array(z.string()), "user_id": z.string().min(1) });
export type ApiKeyCreate = z.infer<typeof apiKeyCreate>;

export const apiKeyCreateResult = z.object({ "api_key": z.string(), "key_fingerprint": z.string() });
export type ApiKeyCreateResult = z.infer<typeof apiKeyCreateResult>;

export const apiKeyEdit = z.object({ "condition": templatedText.nullable().default(null), "description": z.string().min(1).nullable().default(null), "policy_data": z.record(z.string(), z.unknown()).nullable().default(null), "scopes": z.array(z.string()).nullable().default(null) });
export type ApiKeyEdit = z.infer<typeof apiKeyEdit>;

export const apiToolsListsUpdate = z.object({ "exclude_add": z.array(z.string()).default([]), "exclude_remove": z.array(z.string()).default([]), "include_add": z.array(z.string()).default([]), "include_remove": z.array(z.string()).default([]) });
export type ApiToolsListsUpdate = z.infer<typeof apiToolsListsUpdate>;

export const awaitingWorker = z.object({ "keys": z.array(z.string()), "name": z.string() });
export type AwaitingWorker = z.infer<typeof awaitingWorker>;

export const fanoutWorkerResult = z.object({ "detail": z.string().nullable().default(null), "error": z.string().nullable().default(null), "name": z.string(), "outcome": z.string(), "payload": jsonValue.nullable().default(null) });
export type FanoutWorkerResult = z.infer<typeof fanoutWorkerResult>;

export const fanoutSummary = z.object({ "error": z.string().nullable().default(null), "local_only": z.boolean().nullable().default(null), "mode": z.string(), "note": z.string().nullable().default(null), "op": z.string().nullable().default(null), "reachable": z.boolean().nullable().default(null), "results": z.array(fanoutWorkerResult).nullable().default(null) });
export type FanoutSummary = z.infer<typeof fanoutSummary>;

export const freshLife = z.object({ "generation": z.number().int(), "kind": z.string(), "name": z.string() });
export type FreshLife = z.infer<typeof freshLife>;

export const recycleEntry = z.object({ "detail": z.string().nullable().default(null), "generation_before": z.number().int(), "kind": z.string(), "name": z.string(), "status": z.string() });
export type RecycleEntry = z.infer<typeof recycleEntry>;

export const recycleStop = z.object({ "detail": z.string(), "kind": z.string(), "name": z.string().nullable() });
export type RecycleStop = z.infer<typeof recycleStop>;

export const recycleRoll = z.object({ "fresh": z.array(freshLife), "recycle": z.array(recycleEntry), "recycle_stopped": recycleStop.nullable().default(null) });
export type RecycleRoll = z.infer<typeof recycleRoll>;

export const applyResponse = z.object({ "awaiting_respawn": z.array(awaitingWorker).default([]), "env_keys": z.number().int(), "fanout": fanoutSummary, "recycle": recycleRoll.nullable().default(null), "status": z.string() });
export type ApplyResponse = z.infer<typeof applyResponse>;

export const applyResult = z.object({ "applied": z.boolean(), "data": z.record(z.string(), z.unknown()).nullable().default(null), "seq": z.number().nullable().default(null), "skipped": z.array(z.record(z.string(), z.unknown())).default([]) }).strict();
export type ApplyResult = z.infer<typeof applyResult>;

export const stateSubject = z.object({ "key": z.string(), "kind": z.string(), "target_kind": z.enum(["agent","tool"]), "target_name": z.string().min(1) }).strict();
export type StateSubject = z.infer<typeof stateSubject>;

export const heldPendingSave = z.object({ "held_by": z.string(), "save_id": z.string(), "subjects": z.array(stateSubject).default([]) }).strict();
export type HeldPendingSave = z.infer<typeof heldPendingSave>;

export const heldPendingSaveList = z.array(heldPendingSave);
export type HeldPendingSaveList = z.infer<typeof heldPendingSaveList>;

export const attachAck = z.object({ "attached": z.boolean(), "held": heldPendingSaveList.optional(), "state": z.string(), "template": z.string() });
export type AttachAck = z.infer<typeof attachAck>;

export const attachUpdateAck = z.object({ "state": z.string(), "template": z.string(), "updated": z.boolean() });
export type AttachUpdateAck = z.infer<typeof attachUpdateAck>;

export const authHealthState = z.enum(["healthy","reconnect_required","refresh_failing"]);
export type AuthHealthState = z.infer<typeof authHealthState>;

export const backendInfo = z.object({ "backend": z.string().nullable().default(null), "module": z.string().nullable().default(null), "present": z.boolean() });
export type BackendInfo = z.infer<typeof backendInfo>;

export const backupExport = z.object({ "sections": z.array(z.string()) });
export type BackupExport = z.infer<typeof backupExport>;

export const backupExportDocument = z.object({ "created_at": z.string(), "errors": z.record(z.string(), z.string()), "sections": z.record(z.string(), z.unknown()), "version": z.number().int() });
export type BackupExportDocument = z.infer<typeof backupExportDocument>;

export const backupImport = z.object({ "document": z.record(z.string(), z.unknown()), "mode": z.enum(["skip","overwrite"]).default("skip"), "sections": z.array(z.string()) });
export type BackupImport = z.infer<typeof backupImport>;

export const backupSectionReport = z.object({ "awaiting_respawn": z.array(awaitingWorker).default([]), "created": z.number().int().default(0), "details": z.record(z.string(), z.unknown()).default({}), "errors": z.array(z.string()).default([]), "fanout": fanoutSummary.nullable().default(null), "recycle": recycleRoll.nullable().default(null), "skipped": z.number().int().default(0), "updated": z.number().int().default(0) }).strict();
export type BackupSectionReport = z.infer<typeof backupSectionReport>;

export const backupImportResult = z.object({ "ok": z.boolean(), "sections": z.record(z.string(), backupSectionReport) });
export type BackupImportResult = z.infer<typeof backupImportResult>;

export const backupSectionInfo = z.object({ "name": z.string(), "secret": z.boolean() });
export type BackupSectionInfo = z.infer<typeof backupSectionInfo>;

export const backupSectionListing = z.array(backupSectionInfo);
export type BackupSectionListing = z.infer<typeof backupSectionListing>;

export const buttonMethod = z.object({ "href": z.string(), "icon": z.string().nullable().default(null), "id": z.string().min(1), "label": z.string().min(1), "shape": z.literal("button").default("button") }).strict();
export type ButtonMethod = z.infer<typeof buttonMethod>;

export const cacheClearResult = z.object({ "cleared": z.boolean(), "fanout": fanoutSummary });
export type CacheClearResult = z.infer<typeof cacheClearResult>;

export const channelConversationRouteCreate = z.object({ "callback_url": z.null().default(null), "cancel_expr": templatedText.nullable().default(null), "channel": z.string().regex(new RegExp("^[^:]*[^:\\s][^:]*$")), "door": z.literal("channel"), "error_reply_text": z.string().regex(new RegExp("\\S")).min(1).max(2000).nullable().default(null), "execution_key": z.string().min(1), "extras_expr": templatedText.nullable().default(null), "initial_mode": z.enum(["agent","manual"]).default("agent"), "locale": z.string().nullable().default(null), "our_identity": z.string().regex(new RegExp("\\S")), "overlap": overlapPolicy.default({"deliver":"one","running":"continue","settle_seconds":0}), "reply_expr": templatedText.nullable().default(null), "resume_expr": templatedText.nullable().default(null), "route_name": z.string().regex(new RegExp("^[a-z0-9-]+$")), "start_expr": templatedText.nullable().default(null), "target_kind": z.enum(["agent","tool"]), "target_name": z.string().min(1), "turns_per_hour_override": z.number().int().gt(0).nullable().default(null) });
export type ChannelConversationRouteCreate = z.infer<typeof channelConversationRouteCreate>;

export const channelConversationRouteView = z.object({ "callback_url": z.null().default(null), "cancel_expr": templatedText.nullable().default(null), "channel": z.string().regex(new RegExp("^[^:]*[^:\\s][^:]*$")), "door": z.literal("channel"), "error_reply_text": z.string().regex(new RegExp("\\S")).min(1).max(2000).nullable().default(null), "execution_key": z.string().min(1), "execution_key_fingerprint": z.string(), "extras_expr": templatedText.nullable().default(null), "initial_mode": z.enum(["agent","manual"]).default("agent"), "locale": z.string().nullable().default(null), "our_identity": z.string().regex(new RegExp("\\S")), "overlap": overlapPolicy.default({"deliver":"one","running":"continue","settle_seconds":0}), "reply_expr": templatedText.nullable().default(null), "resume_expr": templatedText.nullable().default(null), "route_name": z.string().regex(new RegExp("^[a-z0-9-]+$")), "start_expr": templatedText.nullable().default(null), "target_kind": z.enum(["agent","tool"]), "target_name": z.string().min(1), "turns_per_hour_override": z.number().int().gt(0).nullable().default(null) });
export type ChannelConversationRouteView = z.infer<typeof channelConversationRouteView>;

export const channelListing = z.object({ "channels": z.array(z.string()) });
export type ChannelListing = z.infer<typeof channelListing>;

export const checkpointSweepResult = z.object({ "finished_minutes": z.number().int(), "finished_swept": z.array(z.string()), "provider": z.string(), "skipped": z.string().nullable().default(null), "spared": z.array(z.string()), "swept_count": z.number().int(), "waiting_minutes": z.number().int(), "waiting_swept": z.array(z.string()) });
export type CheckpointSweepResult = z.infer<typeof checkpointSweepResult>;

export const claimExchange = z.object({ "token": z.string().min(1) });
export type ClaimExchange = z.infer<typeof claimExchange>;

export const claimExchangeResult = z.object({ "token": z.string(), "user_id": z.string() });
export type ClaimExchangeResult = z.infer<typeof claimExchangeResult>;

export const claimLinkCreate = z.object({ "api_key": z.string().min(1), "ttl_seconds": z.number().int().nullable().default(null) });
export type ClaimLinkCreate = z.infer<typeof claimLinkCreate>;

export const claimLinkResult = z.object({ "claim_path": z.string(), "expires_at": z.string(), "token": z.string() });
export type ClaimLinkResult = z.infer<typeof claimLinkResult>;

export const compatStatus = z.object({ "reason": z.string().nullable(), "status": z.enum(["compatible","incompatible","unknown"]) });
export type CompatStatus = z.infer<typeof compatStatus>;

export const completedOrigin = z.object({ "actor": z.string().nullable().default(null), "consumer": z.string().nullable().default(null), "door": z.enum(["conversation","hook","schedule","tool","api","operator"]), "inbound_id": z.string().nullable().default(null), "meta": z.record(z.string(), z.unknown()).nullable().default(null), "op_id": z.string().nullable().default(null), "run_id": z.string().nullable().default(null), "turn_id": z.string().nullable().default(null) }).strict();
export type CompletedOrigin = z.infer<typeof completedOrigin>;

export const conditionCheckResult = z.object({ "ok": z.boolean(), "result": z.boolean().nullable() });
export type ConditionCheckResult = z.infer<typeof conditionCheckResult>;

export const conditionValidation = z.object({ "condition": templatedText.nullable().default(null), "sample_context": z.record(z.string(), z.unknown()).nullable().default(null) });
export type ConditionValidation = z.infer<typeof conditionValidation>;

export const configFieldSpec = z.object({ "key": z.string(), "label": z.string().min(1), "required": z.boolean().default(true), "secret": z.boolean().default(false), "target": z.enum(["env","header"]) });
export type ConfigFieldSpec = z.infer<typeof configFieldSpec>;

export const configModeView = z.object({ "config_mode": z.string() });
export type ConfigModeView = z.infer<typeof configModeView>;

export const connectedAccountView = z.object({ "account_identity": z.string().nullable().default(null), "alias": z.string(), "auth_health_state": authHealthState, "connection_id": z.string(), "created_at": z.string().datetime({ offset: true }), "enabled_sub_services": z.array(z.string()), "granted_scopes": z.array(z.string()), "kind": z.enum(["oauth","none"]), "provider_id": z.string(), "scopes_wanted": z.array(z.string()).default([]), "unreachable_sub_services": z.array(z.string()).default([]) });
export type ConnectedAccountView = z.infer<typeof connectedAccountView>;

export const connectionsListResponse = z.object({ "items": z.array(connectedAccountView), "total": z.number().int(), "unhealthy": z.number().int() });
export type ConnectionsListResponse = z.infer<typeof connectionsListResponse>;

export const connectorCategoryView = z.object({ "display_name": z.string(), "id": z.string(), "sort_order": z.number().int() });
export type ConnectorCategoryView = z.infer<typeof connectorCategoryView>;

export const connectorReencryptResult = z.object({ "cas_retries": z.number().int(), "clients_failed": z.number().int(), "clients_reencrypted": z.number().int(), "clients_scanned": z.number().int(), "clients_skipped": z.number().int(), "failed": z.number().int(), "failed_client_row_ids": z.array(z.string()), "failed_connection_ids": z.array(z.string()), "reencrypted": z.number().int(), "scanned": z.number().int(), "skipped": z.number().int() });
export type ConnectorReencryptResult = z.infer<typeof connectorReencryptResult>;

export const connectorRef = z.object({ "connection_id": z.string(), "provider_id": z.string().min(1).max(64), "sub_service": z.string().min(1).max(64) });
export type ConnectorRef = z.infer<typeof connectorRef>;

export const consumerLink = z.object({ "plugin_path": z.string().nullable().default(null), "search": z.record(z.string(), z.unknown()).nullable().default(null), "token": z.string().nullable().default(null) }).strict();
export type ConsumerLink = z.infer<typeof consumerLink>;

export const consumerRow = z.object({ "detail": z.string().nullable().default(null), "kind": z.string(), "link": consumerLink.nullable().default(null), "name": z.string().nullable().default(null), "unavailable": z.string().nullable().default(null) }).strict();
export type ConsumerRow = z.infer<typeof consumerRow>;

export const contributions = z.object({ "nav_entries": z.array(z.string()).default([]), "pages": z.array(z.string()).default([]), "route_panels": z.array(z.string()).default([]), "settings_tabs": z.array(z.string()).default([]), "tool_panels": z.record(z.string(), z.string()).default({}) }).strict();
export type Contributions = z.infer<typeof contributions>;

export const conversationAnswer = z.object({ "answer": z.string().nullable().default(null), "message_id": z.string().min(1), "parts": z.array(answerPart).nullable().default(null), "status": z.enum(["answered","error","silent","merged","superseded"]), "successor_id": z.string().nullable().default(null), "thread_id": z.string().min(1) });
export type ConversationAnswer = z.infer<typeof conversationAnswer>;

export const conversationConfigDeleteResult = z.object({ "removed": z.boolean(), "target_kind": z.enum(["agent","tool"]), "target_name": z.string() });
export type ConversationConfigDeleteResult = z.infer<typeof conversationConfigDeleteResult>;

export const conversationConfigListEnvelope = z.object({ "items": z.array(targetConversationConfig), "total": z.number().int(), "unreadable": z.number().int().default(0) });
export type ConversationConfigListEnvelope = z.infer<typeof conversationConfigListEnvelope>;

export const conversationConfigSetResult = z.object({ "config": targetConversationConfig, "created": z.boolean(), "target_kind": z.enum(["agent","tool"]), "target_name": z.string() });
export type ConversationConfigSetResult = z.infer<typeof conversationConfigSetResult>;

export const conversationEvent = z.object({ "event_id": z.string(), "kind": z.string(), "payload": z.record(z.string(), z.unknown()).default({}) }).strict();
export type ConversationEvent = z.infer<typeof conversationEvent>;

export const conversationEventSubmission = z.object({ "address": z.string().nullable().default(null), "event": conversationEvent, "thread_id": z.string().nullable().default(null), "wait_seconds": z.number().int().gte(0).default(0) }).strict();
export type ConversationEventSubmission = z.infer<typeof conversationEventSubmission>;

export const conversationMessage = z.object({ "attachments": z.array(mediaItem).nullable().default(null), "external_user_id": z.string().min(1), "form": z.record(z.string(), z.unknown()).nullable().default(null), "form_tag": z.string().nullable().default(null), "locale": z.string().nullable().default(null), "location": locationElement.nullable().default(null), "params": z.record(z.string(), z.string()).nullable().default(null), "text": z.string().min(1), "wait_seconds": z.number().int().gte(0).nullable().default(null) });
export type ConversationMessage = z.infer<typeof conversationMessage>;

export const deliveryStatus = z.enum(["accepted","pending_delivery","provisional","delivered","failed","shed","silent","merged","superseded"]);
export type DeliveryStatus = z.infer<typeof deliveryStatus>;

export const conversationRecordView = z.object({ "answer": z.string().nullable().default(null), "answer_parts": z.array(answerPart).nullable().default(null), "answer_status": z.enum(["answered","error","silent","merged","superseded"]).nullable().default(null), "attempts": z.number().int().nullable().default(null), "callback_url": z.string().nullable().default(null), "caller_principal": z.string().nullable().default(null), "channel": z.string().nullable().default(null), "client_address": z.string().min(1).max(256), "created_at": z.number(), "delivery_status": deliveryStatus.default("pending_delivery"), "door": z.enum(["api","channel"]), "error": z.string().nullable().default(null), "inbound_attachments": z.array(mediaItem).nullable().default(null), "inbound_event": z.record(z.string(), z.unknown()).nullable().default(null), "inbound_form": z.record(z.string(), z.unknown()).nullable().default(null), "inbound_form_tag": z.string().nullable().default(null), "inbound_kind": z.enum(["message","event"]).default("message"), "inbound_locale": z.string().nullable().default(null), "inbound_location": locationElement.nullable().default(null), "inbound_text": z.string(), "message_id": z.string().min(1), "operator_send": z.boolean().default(false), "origin": z.enum(["client","operator"]), "our_identity": z.string().nullable().default(null), "outbound_message_ids": z.array(z.string()).nullable().default(null), "pending_receipt": deliveryStatus.nullable().default(null), "provider_message_id": z.string().min(1).nullable().default(null), "route_missing": z.boolean().default(false), "route_name": z.string().min(1), "submitted_by": z.string().nullable().default(null), "successor_id": z.string().nullable().default(null), "thread_id": z.string().min(1), "updated_at": z.number() });
export type ConversationRecordView = z.infer<typeof conversationRecordView>;

export const conversationRouteCreateBody = z.discriminatedUnion("door", [apiConversationRouteCreate, channelConversationRouteCreate]);
export type ConversationRouteCreateBody = z.infer<typeof conversationRouteCreateBody>;

export const conversationRouteCreateResult = z.object({ "callback_secret": z.string().nullable(), "created": z.boolean(), "route": z.discriminatedUnion("door", [apiConversationRouteView, channelConversationRouteView]), "route_name": z.string() });
export type ConversationRouteCreateResult = z.infer<typeof conversationRouteCreateResult>;

export const conversationRouteListEnvelope = z.object({ "items": z.array(z.discriminatedUnion("door", [apiConversationRouteView, channelConversationRouteView])), "total": z.number().int(), "unreadable": z.number().int().default(0) });
export type ConversationRouteListEnvelope = z.infer<typeof conversationRouteListEnvelope>;

export const conversationRouteViewBody = z.discriminatedUnion("door", [apiConversationRouteView, channelConversationRouteView]);
export type ConversationRouteViewBody = z.infer<typeof conversationRouteViewBody>;

export const conversationTurnAck = z.object({ "answer": conversationAnswer.nullable().default(null), "message_id": z.string(), "thread_id": z.string() });
export type ConversationTurnAck = z.infer<typeof conversationTurnAck>;

export const crontabCadence = z.object({ "day_of_month": z.string().default("*"), "day_of_week": z.string().default("*"), "hour": z.string().default("*"), "kind": z.literal("crontab").default("crontab"), "minute": z.string().default("*"), "month_of_year": z.string().default("*") }).strict();
export type CrontabCadence = z.infer<typeof crontabCadence>;

export const detachAck = z.object({ "detached": z.boolean(), "state": z.string(), "template": z.string() });
export type DetachAck = z.infer<typeof detachAck>;

export const dirDeleted = z.object({ "deleted": z.boolean(), "dir": z.string() });
export type DirDeleted = z.infer<typeof dirDeleted>;

export const disconnectResponse = z.object({ "connection_id": z.string(), "fanout": z.record(z.string(), z.unknown()).nullable().default(null), "removed_manifest_entries": z.array(z.string()), "upstream_revoke_outcome": z.enum(["success","failed","skipped"]), "upstream_revoke_status": z.number().int().nullable().default(null) });
export type DisconnectResponse = z.infer<typeof disconnectResponse>;

export const discoverServerRequest = z.object({ "provider_id": z.string().nullable().default(null), "url": z.string().nullable().default(null) });
export type DiscoverServerRequest = z.infer<typeof discoverServerRequest>;

export const discoveredServerView = z.object({ "authorization_servers": z.array(z.string()), "automatic_client": z.boolean(), "client_issuer": z.string().nullable().default(null), "issuer": z.string(), "redirect_uri": z.string().nullable().default(null), "registration_supported": z.boolean(), "resource": z.string(), "resource_name": z.string().nullable().default(null), "scopes_supported": z.array(z.string()), "suggested_display_name": z.string(), "suggested_id": z.string(), "url": z.string() });
export type DiscoveredServerView = z.infer<typeof discoveredServerView>;

export const documentVersion = z.object({ "body": z.record(z.string(), z.unknown()), "created_at": z.string(), "is_current": z.boolean().default(false), "tags": z.array(z.string()).default([]), "version": z.number().int() });
export type DocumentVersion = z.infer<typeof documentVersion>;

export const documentVersionList = z.array(documentVersion);
export type DocumentVersionList = z.infer<typeof documentVersionList>;

export const envUpdate = z.object({ "env": z.record(z.string(), z.string()), "secret_keys": z.array(z.string()).nullable().default(null) }).strict();
export type EnvUpdate = z.infer<typeof envUpdate>;

export const envView = z.object({ "env": z.record(z.string(), z.string()), "secret_keys": z.array(z.string()) });
export type EnvView = z.infer<typeof envView>;

export const eraseAck = z.object({ "erased": z.boolean() });
export type EraseAck = z.infer<typeof eraseAck>;

export const error = z.object({ "code": z.string().optional(), "error": z.string() });
export type Error = z.infer<typeof error>;

export const extensionView = z.object({ "kind": z.string(), "multiple": z.boolean(), "name": z.string() });
export type ExtensionView = z.infer<typeof extensionView>;

export const extensionListing = z.array(extensionView);
export type ExtensionListing = z.infer<typeof extensionListing>;

export const failedConversationsEnvelope = z.object({ "items": z.array(conversationRecordView), "total": z.number().int(), "unreadable": z.number().int().default(0) });
export type FailedConversationsEnvelope = z.infer<typeof failedConversationsEnvelope>;

export const failedMcp = z.object({ "category": z.string(), "http_status": z.number().int().nullable(), "message": z.string(), "status": z.string(), "title": z.string() });
export type FailedMcp = z.infer<typeof failedMcp>;

export const opOutcome = z.enum(["applied","failed","missing","departed","timed_out","resyncing","recycling","stale"]);
export type OpOutcome = z.infer<typeof opOutcome>;

export const workerResult = z.object({ "detail": z.string().nullable().default(null), "error": z.string().nullable().default(null), "name": z.string(), "outcome": opOutcome, "payload": z.unknown().nullable().default(null) });
export type WorkerResult = z.infer<typeof workerResult>;

export const fleetResult = z.object({ "error": z.string().nullable().default(null), "local_only": z.boolean().default(false), "ok": z.boolean().readonly(), "op": z.string(), "reachable": z.boolean().default(true), "results": z.array(workerResult).default([]) });
export type FleetResult = z.infer<typeof fleetResult>;

export const foldSubjectRef = z.object({ "key": z.string(), "kind": z.string() });
export type FoldSubjectRef = z.infer<typeof foldSubjectRef>;

export const foldReport = z.object({ "already": z.boolean(), "flattened": z.number().int(), "from": foldSubjectRef, "into": foldSubjectRef, "merged_members": z.array(z.string()).nullable().default(null), "mode": z.enum(["switch","merge"]) });
export type FoldReport = z.infer<typeof foldReport>;

export const folderCreate = z.object({ "name": z.string(), "parent_id": z.string().nullable().default(null) });
export type FolderCreate = z.infer<typeof folderCreate>;

export const folderDeleted = z.object({ "deleted": z.boolean(), "folder_id": z.string() });
export type FolderDeleted = z.infer<typeof folderDeleted>;

export const folderMove = z.object({ "parent_id": z.string().nullable().default(null) });
export type FolderMove = z.infer<typeof folderMove>;

export const folderRecord = z.object({ "id": z.string(), "name": z.string(), "parent_id": z.string().nullable().default(null) });
export type FolderRecord = z.infer<typeof folderRecord>;

export const folderRename = z.object({ "name": z.string() });
export type FolderRename = z.infer<typeof folderRename>;

export const formField = z.object({ "autocomplete": z.string().nullable().default(null), "label": z.string().min(1), "name": z.string().min(1), "secret": z.boolean().default(false) }).strict();
export type FormField = z.infer<typeof formField>;

export const formMethod = z.object({ "fields": z.array(formField).min(1), "id": z.string().min(1), "purpose": z.enum(["login","invite"]).default("login"), "shape": z.literal("form").default("form"), "submit_path": z.string(), "title": z.string().min(1) }).strict();
export type FormMethod = z.infer<typeof formMethod>;

export const hookListView = z.object({ "items": z.array(hookParams), "topic_verifiers": z.record(z.string(), jsonValue), "total": z.number().int(), "trigger_auth": z.record(z.string(), z.enum(["public","verifier","token","token+api_key","out-of-service"])) });
export type HookListView = z.infer<typeof hookListView>;

export const hookRegisterResult = z.object({ "name": z.string(), "registered": z.boolean() });
export type HookRegisterResult = z.infer<typeof hookRegisterResult>;

export const previewItemRoute = z.object({ "full_path": z.string(), "methods": z.array(z.enum(["GET","POST","PUT","PATCH","DELETE"])), "path": z.string(), "public": z.boolean() });
export type PreviewItemRoute = z.infer<typeof previewItemRoute>;

export const previewItem = z.object({ "base": z.string(), "default_base": z.string(), "item": z.string(), "kind": z.string(), "routes": z.array(previewItemRoute) });
export type PreviewItem = z.infer<typeof previewItem>;

export const publicRouteRow = z.object({ "full_path": z.string(), "item": z.string(), "methods": z.array(z.enum(["GET","POST","PUT","PATCH","DELETE"])) });
export type PublicRouteRow = z.infer<typeof publicRouteRow>;

export const requiredEnvVar = z.object({ "name": z.string(), "secret": z.boolean() });
export type RequiredEnvVar = z.infer<typeof requiredEnvVar>;

export const routeCollision = z.object({ "conflict_owner": z.string(), "conflict_path": z.string(), "full_path": z.string(), "item": z.string(), "methods": z.array(z.enum(["GET","POST","PUT","PATCH","DELETE"])) });
export type RouteCollision = z.infer<typeof routeCollision>;

export const installPreview = z.object({ "collisions": z.array(routeCollision), "delivery": z.enum(["package","descriptor"]), "items": z.array(previewItem), "missing_env": z.array(z.string()), "new_public_routes": z.array(publicRouteRow), "public_routes": z.array(publicRouteRow), "ref": z.string(), "required_env": z.array(requiredEnvVar), "requires_public_acceptance": z.boolean(), "version": z.string() });
export type InstallPreview = z.infer<typeof installPreview>;

export const mountedRoute = z.object({ "full_path": z.string(), "item": z.string(), "methods": z.array(z.enum(["GET","POST","PUT","PATCH","DELETE"])), "public": z.boolean() });
export type MountedRoute = z.infer<typeof mountedRoute>;

export const installResult = z.object({ "advisories": z.array(jsonValue), "notes": z.array(z.string()), "package": z.string().nullable(), "pip_output": z.string().nullable(), "ref": z.string(), "reload": applyResponse, "routes": z.array(mountedRoute), "version": z.string() });
export type InstallResult = z.infer<typeof installResult>;

export const itemRef = z.object({ "kind": z.string(), "name": z.string() });
export type ItemRef = z.infer<typeof itemRef>;

export const installedRow = z.object({ "compat": compatStatus, "delivery": z.enum(["package","descriptor"]), "incompatible_newer": z.string().nullable(), "installed_at": z.string(), "items": z.array(itemRef), "latest": z.string().nullable(), "missing_upstream": z.boolean(), "ref": z.string(), "route_mounts": z.record(z.string(), z.string()), "source": z.string(), "update_available": z.boolean(), "version": z.string() });
export type InstalledRow = z.infer<typeof installedRow>;

export const installedInventory = z.object({ "installed": z.array(installedRow) });
export type InstalledInventory = z.infer<typeof installedInventory>;

export const interactionActionResult = z.object({ "interaction_id": z.string(), "status": z.string() });
export type InteractionActionResult = z.infer<typeof interactionActionResult>;

export const interactionAnswer = z.object({ "answer": z.unknown() });
export type InteractionAnswer = z.infer<typeof interactionAnswer>;

export const interactionCallbackAck = z.object({ "interaction_id": z.string().nullable().default(null), "status": z.enum(["answered","already_answered"]) });
export type InteractionCallbackAck = z.infer<typeof interactionCallbackAck>;

export const interactionFrame = z.object({ "answer_format": answerFormat, "audience": z.string().nullable().default(null), "channel": z.string().nullable().default(null), "created_at": z.string(), "format_payload": jsonValue, "group_id": z.string(), "interaction_id": z.string(), "media": z.array(mediaItem).nullable().default(null), "origin": z.string().nullable().default(null), "question": z.string(), "recipient": z.string().nullable().default(null), "sensitive": z.boolean(), "server_verified": z.boolean().nullable().default(null), "timeout_at": z.string() });
export type InteractionFrame = z.infer<typeof interactionFrame>;

export const interactionReact = z.object({ "event": z.record(z.string(), z.unknown()), "values": z.record(z.string(), z.unknown()) });
export type InteractionReact = z.infer<typeof interactionReact>;

export const interactionReactionAck = z.object({ "update": z.record(z.string(), z.unknown()) });
export type InteractionReactionAck = z.infer<typeof interactionReactionAck>;

export const interactionReactionResult = z.object({ "interaction_id": z.string(), "update": z.record(z.string(), z.unknown()) });
export type InteractionReactionResult = z.infer<typeof interactionReactionResult>;

export const interactionWindow = z.object({ "items": z.array(interactionFrame), "next_page": z.number().int().nullable().default(null), "page": z.number().int(), "page_size": z.number().int(), "total": z.number().int(), "truncated": z.boolean() });
export type InteractionWindow = z.infer<typeof interactionWindow>;

export const intervalCadence = z.object({ "every": z.number().gt(0), "kind": z.literal("interval").default("interval"), "relative": z.boolean().default(false) }).strict();
export type IntervalCadence = z.infer<typeof intervalCadence>;

export const inviteCredential = z.object({ "email": z.string().min(1), "kind": z.literal("invite").default("invite") }).strict();
export type InviteCredential = z.infer<typeof inviteCredential>;

export const inviteRow = z.object({ "action_keys": z.array(z.string()).default([]), "created_at": z.string().datetime({ offset: true }), "email": z.string().min(1), "expires_at": z.string().datetime({ offset: true }), "handle": z.string().min(1), "id": z.string().min(1), "role": z.string().min(1).nullable() }).strict();
export type InviteRow = z.infer<typeof inviteRow>;

export const invokeMemberActionRequest = z.object({ "action_key": z.string().min(1), "input": z.record(z.string(), z.unknown()).default({}), "target_handle": z.string().nullable().default(null) });
export type InvokeMemberActionRequest = z.infer<typeof invokeMemberActionRequest>;

export const invokeMemberActionResult = z.object({ "result": z.record(z.string(), z.unknown()) }).strict();
export type InvokeMemberActionResult = z.infer<typeof invokeMemberActionResult>;

export const keyScopesModify = z.object({ "add": z.array(z.string()).default([]), "remove": z.array(z.string()).default([]) });
export type KeyScopesModify = z.infer<typeof keyScopesModify>;

export const kindStatus = z.object({ "detail": z.string(), "kind": z.string(), "plugin": z.string().nullable(), "state": z.enum(["active","default","off"]) });
export type KindStatus = z.infer<typeof kindStatus>;

export const lastOp = z.object({ "at": z.string(), "op": z.string(), "outcome": z.string() });
export type LastOp = z.infer<typeof lastOp>;

export const setupLogin = z.object({ "kinds": z.array(z.enum(["password","invite"])) });
export type SetupLogin = z.infer<typeof setupLogin>;

export const loginMethodsListing = z.object({ "claim_fragment_key": z.string(), "methods": z.array(z.discriminatedUnion("shape", [formMethod, buttonMethod])), "needs_setup": z.boolean(), "setup_login": setupLogin.nullable().default(null) });
export type LoginMethodsListing = z.infer<typeof loginMethodsListing>;

export const logoutResult = z.object({ "revoked": z.boolean() });
export type LogoutResult = z.infer<typeof logoutResult>;

export const mCPConfig = z.object({ "args": z.array(z.string()).default([]), "command": z.string().nullable().default(null), "env": z.record(z.string(), z.string()).default({}), "headers": z.record(z.string(), z.string()).default({}), "type": z.string().nullable().default(null), "uds": z.string().nullable().default(null), "url": z.string().nullable().default(null) });
export type MCPConfig = z.infer<typeof mCPConfig>;

export const manifestReplace = z.object({ "manifest_text": z.string() });
export type ManifestReplace = z.infer<typeof manifestReplace>;

export const marketplaceInstall = z.object({ "accept_public_routes": z.boolean().default(false), "env": z.record(z.string(), z.string()).nullable().default(null), "ref": z.string(), "route_mounts": z.record(z.string(), z.string()).nullable().default(null), "secret_keys": z.array(z.string()).nullable().default(null), "version": z.string().nullable().default(null) });
export type MarketplaceInstall = z.infer<typeof marketplaceInstall>;

export const marketplaceInstallPreview = z.object({ "ref": z.string(), "route_mounts": z.record(z.string(), z.string()).nullable().default(null), "version": z.string().nullable().default(null) });
export type MarketplaceInstallPreview = z.infer<typeof marketplaceInstallPreview>;

export const marketplaceUninstall = z.object({ "ref": z.string() });
export type MarketplaceUninstall = z.infer<typeof marketplaceUninstall>;

export const marketplaceUpdate = z.object({ "accept_public_routes": z.boolean().default(false), "env": z.record(z.string(), z.string()).nullable().default(null), "ref": z.string(), "route_mounts": z.record(z.string(), z.string()).nullable().default(null), "secret_keys": z.array(z.string()).nullable().default(null), "version": z.string().nullable().default(null) });
export type MarketplaceUpdate = z.infer<typeof marketplaceUpdate>;

export const taiMCPConfig = z.object({ "config": mCPConfig, "exclude": z.array(z.string()).default([]), "extensions": z.record(z.string(), z.array(z.array(z.union([z.string(), z.record(z.string(), z.unknown())])))).default({}), "include": z.array(z.string()).default([]), "managed": connectorRef.nullable().default(null), "title": z.string() });
export type TaiMCPConfig = z.infer<typeof taiMCPConfig>;

export const mcpConfigUpdate = z.object({ "mcp": z.array(taiMCPConfig) });
export type McpConfigUpdate = z.infer<typeof mcpConfigUpdate>;

export const mcpEntriesAdd = z.object({ "entries": z.array(taiMCPConfig), "replace": z.boolean().default(false) });
export type McpEntriesAdd = z.infer<typeof mcpEntriesAdd>;

export const mcpEnvRef = z.object({ "has_default": z.boolean(), "pointer": z.string(), "set": z.boolean(), "var": z.string() });
export type McpEnvRef = z.infer<typeof mcpEnvRef>;

export const mcpEnvRefList = z.array(mcpEnvRef);
export type McpEnvRefList = z.infer<typeof mcpEnvRefList>;

export const mcpHealth = z.object({ "consecutive_failures": z.number().int(), "failing_since": z.string().nullable(), "last_error": z.record(z.string(), z.string()).nullable(), "last_success": z.string().nullable() });
export type McpHealth = z.infer<typeof mcpHealth>;

export const mcpStatusSnapshot = z.object({ "bound": z.record(z.string(), z.array(z.string())), "failed": z.array(failedMcp), "health": z.record(z.string(), mcpHealth) });
export type McpStatusSnapshot = z.infer<typeof mcpStatusSnapshot>;

export const mcpTargets = z.object({ "targets": z.array(z.string()).nullable().default(null) });
export type McpTargets = z.infer<typeof mcpTargets>;

export const memberActionDescriptor = z.object({ "destructive": z.boolean(), "input_schema": z.record(z.string(), z.unknown()), "key": z.string().min(1), "label": z.string(), "result_schema": z.record(z.string(), z.unknown()), "scope": z.enum(["page","member_row","invite_row"]) }).strict();
export type MemberActionDescriptor = z.infer<typeof memberActionDescriptor>;

export const memberActionCatalog = z.object({ "actions": z.array(memberActionDescriptor) }).strict();
export type MemberActionCatalog = z.infer<typeof memberActionCatalog>;

export const memberPrincipalState = z.object({ "disabled": z.boolean(), "role": z.string().min(1).nullable(), "user_id": z.string().min(1) }).strict();
export type MemberPrincipalState = z.infer<typeof memberPrincipalState>;

export const memberRow = z.object({ "action_keys": z.array(z.string()).default([]), "created_at": z.string().datetime({ offset: true }), "disabled": z.boolean(), "email": z.string().min(1), "handle": z.string().min(1), "id": z.string().min(1), "principals": z.array(memberPrincipalState), "role": z.string().min(1).nullable() }).strict();
export type MemberRow = z.infer<typeof memberRow>;

export const memberDirectory = z.object({ "invites": z.array(inviteRow), "members": z.array(memberRow) }).strict();
export type MemberDirectory = z.infer<typeof memberDirectory>;

export const messageSearchEnvelope = z.object({ "items": z.array(conversationRecordView), "next_page": z.number().int().nullable(), "page": z.number().int(), "page_size": z.number().int(), "total": z.number().int(), "truncated": z.boolean(), "unreadable": z.number().int().default(0) });
export type MessageSearchEnvelope = z.infer<typeof messageSearchEnvelope>;

export const metricsSummary = z.object({ "averageLatencyMs": z.number().int(), "avgCostPerRun": z.number(), "avgTokensPerRun": z.number().int(), "timeToFirstTokenMs": z.number().int().nullable().default(null), "totalCost": z.number(), "totalRuns": z.number().int(), "totalTokens": z.number().int() });
export type MetricsSummary = z.infer<typeof metricsSummary>;

export const metricsTimePoint = z.object({ "avgLatencyMs": z.number().int(), "bucket": z.string().nullable().default(null), "cost": z.number(), "runs": z.number().int(), "totalTokens": z.number().int() });
export type MetricsTimePoint = z.infer<typeof metricsTimePoint>;

export const modelUsageRow = z.object({ "avgLatencyMs": z.number().int(), "calls": z.number().int(), "cost": z.number(), "model": z.string(), "totalTokens": z.number().int() });
export type ModelUsageRow = z.infer<typeof modelUsageRow>;

export const metricsResult = z.object({ "byModel": z.array(modelUsageRow), "byModelAvailable": z.boolean().default(true), "granularity": z.enum(["hour","day","week"]), "summary": metricsSummary, "timeSeries": z.array(metricsTimePoint) });
export type MetricsResult = z.infer<typeof metricsResult>;

export const providerCapability = z.object({ "mintable": z.boolean(), "name": z.string() });
export type ProviderCapability = z.infer<typeof providerCapability>;

export const mintCapabilities = z.object({ "mintable": z.boolean(), "providers": z.array(providerCapability) });
export type MintCapabilities = z.infer<typeof mintCapabilities>;

export const notificationRecord = z.object({ "audience": z.string().nullable().default(null), "created_at": z.string(), "footer": z.string().nullable().default(null), "header": mediaItem.nullable().default(null), "id": z.string(), "location": locationElement.nullable().default(null), "media": z.array(mediaItem).nullable().default(null), "message": z.string(), "options": z.array(z.discriminatedUnion("kind", [replyOption, linkOption])).nullable().default(null), "recipient": z.string().nullable().default(null), "schema": jsonValue.default(null), "sections": z.array(optionSection).nullable().default(null), "template": channelTemplate.nullable().default(null) });
export type NotificationRecord = z.infer<typeof notificationRecord>;

export const notificationListing = z.object({ "notifications": z.array(notificationRecord) });
export type NotificationListing = z.infer<typeof notificationListing>;

export const notifyResult = z.string();
export type NotifyResult = z.infer<typeof notifyResult>;

export const notifyUser = z.object({ "audience": z.string().nullable().default(null), "channel": z.string().nullable().default(null), "data": formData.nullable().default(null), "footer": z.string().nullable().default(null), "form_tag": z.string().nullable().default(null), "header": mediaItem.nullable().default(null), "location": locationElement.nullable().default(null), "media": z.array(mediaItem).nullable().default(null), "message": z.string(), "options": z.array(z.discriminatedUnion("kind", [replyOption, linkOption])).nullable().default(null), "pages": z.array(formPage).nullable().default(null), "recipient": z.string().nullable().default(null), "schema": z.record(z.string(), z.unknown()).nullable().default(null), "sections": z.array(optionSection).nullable().default(null), "sender_identity": z.string().nullable().default(null), "template": channelTemplate.nullable().default(null), "wording": wording.nullable().default(null) }).strict();
export type NotifyUser = z.infer<typeof notifyUser>;

export const oAuthCancelled = z.object({ "kind": z.literal("cancelled"), "message": z.string() });
export type OAuthCancelled = z.infer<typeof oAuthCancelled>;

export const oAuthComplete = z.object({ "code": z.string().nullable().default(null), "error": z.string().nullable().default(null), "iss": z.string().nullable().default(null), "state": z.string().nullable().default(null) });
export type OAuthComplete = z.infer<typeof oAuthComplete>;

export const oAuthFailed = z.object({ "kind": z.literal("failed"), "reason": z.string() });
export type OAuthFailed = z.infer<typeof oAuthFailed>;

export const oAuthNotConfigured = z.object({ "kind": z.literal("not_configured") });
export type OAuthNotConfigured = z.infer<typeof oAuthNotConfigured>;

export const oAuthSuccess = z.object({ "connection_id": z.string(), "fanout": fanoutSummary, "kind": z.literal("success"), "return_url": z.string() });
export type OAuthSuccess = z.infer<typeof oAuthSuccess>;

export const oAuthCompletionResult = z.discriminatedUnion("kind", [oAuthNotConfigured, oAuthCancelled, oAuthFailed, oAuthSuccess]);
export type OAuthCompletionResult = z.infer<typeof oAuthCompletionResult>;

export const observabilityMetricsCapabilities = z.object({ "dimensions": z.array(z.string()), "measures": z.array(z.string()) });
export type ObservabilityMetricsCapabilities = z.infer<typeof observabilityMetricsCapabilities>;

export const observabilityCapabilities = z.object({ "incompatibleFilters": z.record(z.string(), z.array(z.string())), "metrics": observabilityMetricsCapabilities, "pageSizeMax": z.number().int(), "sortKeys": z.array(z.enum(["createdAt","cost","latencyMs","totalTokens"])) });
export type ObservabilityCapabilities = z.infer<typeof observabilityCapabilities>;

export const observabilityRunView = z.object({ "cost": z.number().nullable().default(null), "createdAt": z.string().nullable().default(null), "id": z.string(), "inputPreview": jsonValue, "latencyMs": z.number().int().nullable().default(null), "outputPreview": jsonValue, "status": z.enum(["error","success"]), "tags": z.array(z.string()), "totalTokens": z.number().int().nullable().default(null), "traceId": z.string() });
export type ObservabilityRunView = z.infer<typeof observabilityRunView>;

export const observabilityRunsPage = z.object({ "items": z.array(observabilityRunView), "nextPage": z.number().int().nullable().default(null), "page": z.number().int() });
export type ObservabilityRunsPage = z.infer<typeof observabilityRunsPage>;

export const okResult = z.object({ "ok": z.boolean() });
export type OkResult = z.infer<typeof okResult>;

export const opaqueJson = jsonValue;
export type OpaqueJson = z.infer<typeof opaqueJson>;

export const parkedEntry = z.object({ "answer_format": z.string().nullable().default(null), "asked_by": z.array(z.string()).nullable().default(null), "audience": z.string().nullable().default(null), "channel": z.string().nullable().default(null), "created_at": z.string().nullable().default(null), "error": z.unknown().default(null), "expiry_at": z.string().nullable().default(null), "format_payload": z.record(z.string(), z.unknown()).nullable().default(null), "group_id": z.string().nullable().default(null), "id": z.string(), "media": z.array(z.record(z.string(), z.unknown())).nullable().default(null), "on_expiry": z.enum(["kill","resume"]).nullable().default(null), "payload": z.record(z.string(), z.unknown()).nullable().default(null), "question": z.string().nullable().default(null), "recipient": z.string().nullable().default(null), "result": z.unknown().default(null), "status": z.enum(["asking","running","finished","failed"]), "thread_id": z.string().nullable().default(null), "to": z.enum(["user","caller"]).nullable().default(null) }).strict();
export type ParkedEntry = z.infer<typeof parkedEntry>;

export const passwordCredential = z.object({ "email": z.string().min(1), "kind": z.literal("password").default("password"), "password": z.string().min(1) }).strict();
export type PasswordCredential = z.infer<typeof passwordCredential>;

export const patchSubServicesRequest = z.object({ "enabled_sub_services": z.array(z.string()).min(1).max(64), "return_url": z.string().nullable().default(null) });
export type PatchSubServicesRequest = z.infer<typeof patchSubServicesRequest>;

export const patchSubServicesResponse = z.object({ "added_manifest_entries": z.array(z.string()).default([]), "authorize_url": z.string().nullable().default(null), "connection_id": z.string(), "consent_required": z.boolean(), "enabled_sub_services": z.array(z.string()), "fanout": z.record(z.string(), z.unknown()).nullable().default(null), "flow_id": z.string().nullable().default(null), "removed_manifest_entries": z.array(z.string()).default([]) });
export type PatchSubServicesResponse = z.infer<typeof patchSubServicesResponse>;

export const patternEntry = z.object({ "open_prefix": z.string().nullable(), "pattern": z.string(), "scope_id": z.string() });
export type PatternEntry = z.infer<typeof patternEntry>;

export const pendingInteraction = z.object({ "audience": z.string().nullable().default(null), "channel": z.string().nullable().default(null), "created_at": z.string(), "expiry_at": z.string().nullable().default(null), "group_id": z.string(), "interaction_id": z.string(), "mode": z.string(), "question": z.string(), "recipient": z.string().nullable().default(null), "thread_id": z.string().nullable().default(null) });
export type PendingInteraction = z.infer<typeof pendingInteraction>;

export const pendingInteractionListing = z.object({ "count": z.number().int(), "items": z.array(pendingInteraction) });
export type PendingInteractionListing = z.infer<typeof pendingInteractionListing>;

export const personAddress = z.object({ "address": z.string().min(1), "channel": z.string().nullable().default(null), "door": z.enum(["api","channel"]), "linked_at": z.string(), "our_identity": z.string().nullable().default(null), "routes": z.array(z.string()).min(1) });
export type PersonAddress = z.infer<typeof personAddress>;

export const person = z.object({ "addresses": z.array(personAddress).min(1), "created_at": z.string(), "locale": z.string().nullable().default(null), "person_id": z.string().min(1), "target_kind": z.enum(["agent","tool"]), "target_name": z.string().min(1) });
export type Person = z.infer<typeof person>;

export const personDeleteResult = z.object({ "erased": z.boolean(), "person_id": z.string(), "removed": z.number().int() });
export type PersonDeleteResult = z.infer<typeof personDeleteResult>;

export const policyRollback = z.object({ "version": z.number().int() });
export type PolicyRollback = z.infer<typeof policyRollback>;

export const policyRollbackResult = z.object({ "active_version": z.number().int(), "user_id": z.string() });
export type PolicyRollbackResult = z.infer<typeof policyRollbackResult>;

export const preservedManifestView = z.object({ "mcp": z.array(z.record(z.string(), z.unknown())), "user_tools": z.array(z.string()) });
export type PreservedManifestView = z.infer<typeof preservedManifestView>;

export const presetCreate = z.object({ "base_tool": z.string(), "description": z.string(), "extensions": z.array(z.array(z.union([z.string(), z.record(z.string(), z.unknown())]))).default([]), "fixed_kwargs": z.record(z.string(), z.unknown()).default({}), "input_schema": z.union([templatedText, z.record(z.string(), z.unknown()), z.null()]).default(null), "name": z.string(), "output_schema": z.union([templatedText, z.record(z.string(), z.unknown()), z.null()]).default(null), "state_binding": stateBinding.nullable().default(null) });
export type PresetCreate = z.infer<typeof presetCreate>;

export const presetCreateResult = z.object({ "active_version": z.number().int(), "base_tool": z.string(), "conflicted": z.boolean(), "conflicted_reason": z.string().nullable(), "description": z.string(), "extensions": z.array(z.array(z.union([z.string(), z.record(z.string(), z.unknown())]))), "fanout": fanoutSummary, "input_schema": z.record(z.string(), z.unknown()).nullable(), "name": z.string(), "output_schema": z.record(z.string(), z.unknown()).nullable(), "used_by": z.array(z.string()), "uses": z.array(z.string()) });
export type PresetCreateResult = z.infer<typeof presetCreateResult>;

export const presetDeleteResult = z.object({ "deleted": z.boolean(), "fanout": fanoutSummary, "name": z.string() });
export type PresetDeleteResult = z.infer<typeof presetDeleteResult>;

export const presetDetailView = z.object({ "active_version": z.number().int(), "base_tool": z.string(), "conflicted": z.boolean(), "conflicted_reason": z.string().nullable(), "description": z.string(), "extensions": z.array(z.array(z.union([z.string(), z.record(z.string(), z.unknown())]))), "fixed_kwargs": z.record(z.string(), z.unknown()), "input_schema": z.record(z.string(), z.unknown()).nullable(), "name": z.string(), "output_schema": z.record(z.string(), z.unknown()).nullable(), "used_by": z.array(z.string()), "uses": z.array(z.string()) });
export type PresetDetailView = z.infer<typeof presetDetailView>;

export const presetRecordView = z.object({ "active_version": z.number().int(), "base_tool": z.string(), "conflicted": z.boolean(), "conflicted_reason": z.string().nullable(), "description": z.string(), "extensions": z.array(z.array(z.union([z.string(), z.record(z.string(), z.unknown())]))), "input_schema": z.record(z.string(), z.unknown()).nullable(), "name": z.string(), "output_schema": z.record(z.string(), z.unknown()).nullable(), "used_by": z.array(z.string()), "uses": z.array(z.string()) });
export type PresetRecordView = z.infer<typeof presetRecordView>;

export const presetRecordList = z.array(presetRecordView);
export type PresetRecordList = z.infer<typeof presetRecordList>;

export const presetRefereesResult = z.object({ "name": z.string(), "referees": z.array(z.string()) });
export type PresetRefereesResult = z.infer<typeof presetRefereesResult>;

export const presetRename = z.object({ "new_name": z.string() });
export type PresetRename = z.infer<typeof presetRename>;

export const presetRenameResult = z.object({ "active_version": z.number().int(), "fanout": fanoutSummary, "name": z.string(), "renamed_from": z.string() });
export type PresetRenameResult = z.infer<typeof presetRenameResult>;

export const presetRollback = z.object({ "version": z.number().int() });
export type PresetRollback = z.infer<typeof presetRollback>;

export const presetRollbackResult = z.object({ "active_version": z.number().int(), "fanout": fanoutSummary, "name": z.string() });
export type PresetRollbackResult = z.infer<typeof presetRollbackResult>;

export const presetValidate = z.object({ "base_tool": z.string().nullable().default(null), "description": z.string().nullable().default(null), "extensions": z.array(z.array(z.union([z.string(), z.record(z.string(), z.unknown())]))).nullable().default(null), "fixed_kwargs": z.record(z.string(), z.unknown()).nullable().default(null), "input_schema": z.union([templatedText, z.record(z.string(), z.unknown()), z.null()]).default(null), "name": z.string(), "output_schema": z.union([templatedText, z.record(z.string(), z.unknown()), z.null()]).default(null), "state_binding": stateBinding.nullable().default(null) });
export type PresetValidate = z.infer<typeof presetValidate>;

export const presetValidateVerdict = z.object({ "error": z.string().nullable(), "valid": z.boolean() });
export type PresetValidateVerdict = z.infer<typeof presetValidateVerdict>;

export const presetVersionSave = z.object({ "description": z.string().nullable().default(null), "extensions": z.array(z.array(z.union([z.string(), z.record(z.string(), z.unknown())]))).nullable().default(null), "fixed_kwargs": z.record(z.string(), z.unknown()).nullable().default(null), "input_schema": z.union([templatedText, z.record(z.string(), z.unknown()), z.null()]).default(null), "output_schema": z.union([templatedText, z.record(z.string(), z.unknown()), z.null()]).default(null), "state_binding": stateBinding.nullable().default(null) });
export type PresetVersionSave = z.infer<typeof presetVersionSave>;

export const presetVersionSaveResult = z.object({ "body": z.record(z.string(), z.unknown()), "created_at": z.string(), "fanout": fanoutSummary, "is_current": z.boolean().default(false), "tags": z.array(z.string()).default([]), "version": z.number().int() });
export type PresetVersionSaveResult = z.infer<typeof presetVersionSaveResult>;

export const presetVersionTags = z.object({ "tags": z.array(z.string()) });
export type PresetVersionTags = z.infer<typeof presetVersionTags>;

export const presetVersionTagsResult = z.object({ "name": z.string(), "tags": z.array(z.string()), "version": z.number().int() });
export type PresetVersionTagsResult = z.infer<typeof presetVersionTagsResult>;

export const principal = z.object({ "created_at": z.string().datetime({ offset: true }), "created_by": z.string().nullable().default(null), "disabled": z.boolean().default(false), "display_name": z.string(), "kind": z.enum(["human","service"]), "user_id": z.string() }).strict();
export type Principal = z.infer<typeof principal>;

export const principalCreate = z.object({ "display_name": z.string().min(1), "kind": z.enum(["human","service"]), "role": z.string().min(1), "user_id": z.string().nullable().default(null) });
export type PrincipalCreate = z.infer<typeof principalCreate>;

export const principalDeleted = z.object({ "deleted": z.boolean(), "user_id": z.string() });
export type PrincipalDeleted = z.infer<typeof principalDeleted>;

export const principalListing = z.array(principal);
export type PrincipalListing = z.infer<typeof principalListing>;

export const principalRef = z.object({ "display_name": z.string(), "kind": z.enum(["human","service"]), "user_id": z.string() });
export type PrincipalRef = z.infer<typeof principalRef>;

export const principalUpdate = z.object({ "disabled": z.boolean().nullable().default(null), "display_name": z.string().min(1).nullable().default(null) });
export type PrincipalUpdate = z.infer<typeof principalUpdate>;

export const profileApplyResponse = z.object({ "awaiting_respawn": z.array(awaitingWorker).default([]), "fanout": fanoutSummary, "fresh": z.array(freshLife), "hot": z.array(z.string()), "recycle": z.array(recycleEntry), "recycle_stopped": recycleStop.nullable().default(null), "refused": z.array(z.string()) });
export type ProfileApplyResponse = z.infer<typeof profileApplyResponse>;

export const profileDiffChange = z.object({ "key": z.string(), "new": z.string(), "old": z.string() });
export type ProfileDiffChange = z.infer<typeof profileDiffChange>;

export const profileDiff = z.object({ "added": z.array(z.string()), "changed": z.array(profileDiffChange), "recycle_keys": z.array(z.string()), "refused_keys": z.array(z.string()), "removed": z.array(z.string()) });
export type ProfileDiff = z.infer<typeof profileDiff>;

export const profileSummary = z.object({ "description": z.string(), "name": z.string() });
export type ProfileSummary = z.infer<typeof profileSummary>;

export const profileListResponse = z.array(profileSummary);
export type ProfileListResponse = z.infer<typeof profileListResponse>;

export const profileRollback = z.object({ "version": z.number().int() });
export type ProfileRollback = z.infer<typeof profileRollback>;

export const profileVersionSummary = z.object({ "created_at": z.string(), "is_current": z.boolean(), "tags": z.array(z.string()), "version": z.number().int() });
export type ProfileVersionSummary = z.infer<typeof profileVersionSummary>;

export const profileVersionListResponse = z.array(profileVersionSummary);
export type ProfileVersionListResponse = z.infer<typeof profileVersionListResponse>;

export const settingsProfileBody = z.object({ "description": z.string().default(""), "env": z.record(z.string(), z.string()).default({}), "secret_keys": z.array(z.string()).default([]) });
export type SettingsProfileBody = z.infer<typeof settingsProfileBody>;

export const profileVersionView = z.object({ "body": settingsProfileBody, "created_at": z.string(), "is_current": z.boolean(), "tags": z.array(z.string()), "version": z.number().int() });
export type ProfileVersionView = z.infer<typeof profileVersionView>;

export const profileWriteResult = z.object({ "ok": z.boolean(), "version": z.number().int() });
export type ProfileWriteResult = z.infer<typeof profileWriteResult>;

export const routeEntry = z.object({ "methods": z.array(z.string()), "path": z.string() });
export type RouteEntry = z.infer<typeof routeEntry>;

export const subMcpEntry = z.object({ "access_pattern": z.string(), "mount_url": z.string(), "slug": z.string(), "tools": z.array(z.string()), "transport": z.string() });
export type SubMcpEntry = z.infer<typeof subMcpEntry>;

export const projectionResult = z.object({ "admin": z.boolean(), "agents": z.array(z.string()), "mintable": z.boolean(), "owner_user_id": z.string().nullable(), "principal": principalRef.nullable(), "public_resource_id": z.string(), "route_patterns": z.array(patternEntry), "routes": z.array(routeEntry), "scopes": z.array(z.string()), "sub_mcp": z.array(subMcpEntry), "tools": z.array(z.string()), "user_id": z.string() });
export type ProjectionResult = z.infer<typeof projectionResult>;

export const subServiceView = z.object({ "description": z.string().default(""), "display_name": z.string(), "id": z.string(), "scopes": z.array(z.string()).default([]) });
export type SubServiceView = z.infer<typeof subServiceView>;

export const providerCatalogEntry = z.object({ "category": z.string(), "client_source": z.enum(["env","manual","dynamic","unset"]).nullable().default(null), "config_fields": z.array(configFieldSpec).default([]), "description": z.string().default(""), "display_name": z.string(), "icon_url": z.string().nullable().default(null), "id": z.string(), "kind": z.enum(["oauth","none"]), "origin": z.enum(["system","community"]), "removable": z.boolean().default(false), "sub_services": z.array(subServiceView) });
export type ProviderCatalogEntry = z.infer<typeof providerCatalogEntry>;

export const providerCatalogResponse = z.object({ "categories": z.array(connectorCategoryView), "providers": z.array(providerCatalogEntry) });
export type ProviderCatalogResponse = z.infer<typeof providerCatalogResponse>;

export const providerMutationResponse = z.object({ "fanout": z.record(z.string(), z.unknown()).nullable().default(null), "provider": providerCatalogEntry });
export type ProviderMutationResponse = z.infer<typeof providerMutationResponse>;

export const pruneResult = z.object({ "held": heldPendingSaveList.optional(), "pruned": z.record(z.string(), z.number().int()) });
export type PruneResult = z.infer<typeof pruneResult>;

export const publicRoutePin = z.object({ "pattern": z.string().nullable().default(null), "url": z.string() });
export type PublicRoutePin = z.infer<typeof publicRoutePin>;

export const publicRouteUnpin = z.object({ "url": z.string() });
export type PublicRouteUnpin = z.infer<typeof publicRouteUnpin>;

export const reloadConfig = z.object({ "targets": z.array(z.string()).nullable().default(null) });
export type ReloadConfig = z.infer<typeof reloadConfig>;

export const reloadConfigRequest = z.object({ "targets": z.array(z.string()).nullable().default(null) });
export type ReloadConfigRequest = z.infer<typeof reloadConfigRequest>;

export const reloadingError = z.object({ "error": z.literal("reloading — the server is applying a config reload; retry shortly"), "reloading": z.literal(true) });
export type ReloadingError = z.infer<typeof reloadingError>;

export const removeProviderResponse = z.object({ "fanout": z.record(z.string(), z.unknown()).nullable().default(null), "provider_id": z.string(), "removed_clients": z.number().int() });
export type RemoveProviderResponse = z.infer<typeof removeProviderResponse>;

export const removedByName = z.object({ "name": z.string(), "removed": z.boolean() });
export type RemovedByName = z.infer<typeof removedByName>;

export const removedByTopic = z.object({ "removed": z.boolean(), "topic": z.string() });
export type RemovedByTopic = z.infer<typeof removedByTopic>;

export const renderedTemplate = z.object({ "rendered": z.string() });
export type RenderedTemplate = z.infer<typeof renderedTemplate>;

export const resolvedSpanValue = z.object({ "field": z.enum(["input","output"]), "pointer": z.string(), "spanId": z.string(), "traceId": z.string(), "value": jsonValue.default(null) });
export type ResolvedSpanValue = z.infer<typeof resolvedSpanValue>;

export const resourceContent = z.union([z.string(), jsonValue]);
export type ResourceContent = z.infer<typeof resourceContent>;

export const resourceDeleted = z.object({ "deleted": z.boolean(), "id": z.string() });
export type ResourceDeleted = z.infer<typeof resourceDeleted>;

export const resourceGet = z.object({ "kwargs": z.record(z.string(), z.unknown()).nullable().default(null), "resource_id": z.string() });
export type ResourceGet = z.infer<typeof resourceGet>;

export const resourceList = z.object({ "resources": z.array(z.string()) });
export type ResourceList = z.infer<typeof resourceList>;

export const resourceStat = z.object({ "content_type": z.string().nullable(), "id": z.string() });
export type ResourceStat = z.infer<typeof resourceStat>;

export const resourceStored = z.object({ "id": z.string(), "stored": z.boolean() });
export type ResourceStored = z.infer<typeof resourceStored>;

export const revokeAck = z.object({ "revoked": z.boolean(), "user_id": z.string() });
export type RevokeAck = z.infer<typeof revokeAck>;

export const roleCreate = z.object({ "base_tier": z.string(), "description": z.string().default(""), "grants": z.record(z.string(), z.enum(["none","read","write"])).default({}), "name": z.string() });
export type RoleCreate = z.infer<typeof roleCreate>;

export const roleDefinitionList = z.array(roleDefinition);
export type RoleDefinitionList = z.infer<typeof roleDefinitionList>;

export const roleDeleted = z.object({ "deleted": z.boolean(), "name": z.string() });
export type RoleDeleted = z.infer<typeof roleDeleted>;

export const roleGrantsModify = z.object({ "remove": z.array(z.string()).default([]), "upsert": z.record(z.string(), z.enum(["none","read","write"])).default({}) });
export type RoleGrantsModify = z.infer<typeof roleGrantsModify>;

export const roleRollback = z.object({ "version": z.number().int() });
export type RoleRollback = z.infer<typeof roleRollback>;

export const roleUpdate = z.object({ "description": z.string().nullable().default(null), "grants": z.record(z.string(), z.enum(["none","read","write"])).nullable().default(null) });
export type RoleUpdate = z.infer<typeof roleUpdate>;

export const roleVersionsView = z.object({ "audit": z.array(z.record(z.string(), jsonValue)), "versions": z.array(documentVersion) });
export type RoleVersionsView = z.infer<typeof roleVersionsView>;

export const routeMappingRow = z.object({ "action": z.enum(["read","write","fenced","secret"]).nullable(), "declared_public": z.boolean(), "mapped": z.string().nullable(), "methods": z.array(z.string()), "path": z.string(), "summary": z.string(), "tags": z.array(z.string()) });
export type RouteMappingRow = z.infer<typeof routeMappingRow>;

export const routeMappingList = z.array(routeMappingRow);
export type RouteMappingList = z.infer<typeof routeMappingList>;

export const routeRemoveResult = z.object({ "removed": z.boolean(), "route_name": z.string() });
export type RouteRemoveResult = z.infer<typeof routeRemoveResult>;

export const suspendedInteraction = z.object({ "caller_interaction_ids": z.array(z.string()).default([]), "expiry_at": z.string().datetime({ offset: true }).nullable().default(null), "interaction_id": z.string(), "interaction_ids": z.array(z.string()).default([]), "resume_owner": z.string().nullable().default(null) });
export type SuspendedInteraction = z.infer<typeof suspendedInteraction>;

export const runAsksAnswer = z.object({ "asks": z.array(parkedEntry), "kind": z.literal("asks").default("asks"), "suspended": suspendedInteraction });
export type RunAsksAnswer = z.infer<typeof runAsksAnswer>;

export const runNoneAnswer = z.object({ "kind": z.literal("none").default("none") });
export type RunNoneAnswer = z.infer<typeof runNoneAnswer>;

export const runParkedAnswer = z.object({ "kind": z.literal("parked").default("parked"), "suspended": suspendedInteraction });
export type RunParkedAnswer = z.infer<typeof runParkedAnswer>;

export const runResultAnswer = z.object({ "kind": z.literal("result").default("result"), "result": z.unknown() });
export type RunResultAnswer = z.infer<typeof runResultAnswer>;

export const runAnswerResponse = z.discriminatedUnion("kind", [runResultAnswer, runAsksAnswer, runParkedAnswer, runNoneAnswer]);
export type RunAnswerResponse = z.infer<typeof runAnswerResponse>;

export const runSubmitted = z.object({ "run_id": z.string() });
export type RunSubmitted = z.infer<typeof runSubmitted>;

export const runToolRequest = z.object({ "arguments": z.record(z.string(), z.unknown()).default({}), "subject": stateSubject.nullable().default(null), "tool_name": z.string().min(1) });
export type RunToolRequest = z.infer<typeof runToolRequest>;

export const spanOutlineView = z.object({ "end": z.string().nullable().default(null), "id": z.string(), "inputTokens": z.number().int().nullable().default(null), "kind": z.enum(["LLM","TOOL","CHAIN","EVENT"]).nullable().default(null), "level": z.string().nullable().default(null), "metadata": jsonValue.default(null), "model": z.string().nullable().default(null), "name": z.string().nullable().default(null), "outputTokens": z.number().int().nullable().default(null), "parentId": z.string().nullable().default(null), "start": z.string().nullable().default(null), "statusMessage": z.string().nullable().default(null), "totalTokens": z.number().int().nullable().default(null), "traceId": z.string().nullable().default(null) });
export type SpanOutlineView = z.infer<typeof spanOutlineView>;

export const runTraceOutlineView = z.object({ "spans": z.array(spanOutlineView), "traceId": z.string() });
export type RunTraceOutlineView = z.infer<typeof runTraceOutlineView>;

export const spanView = z.object({ "end": z.string().nullable().default(null), "id": z.string(), "input": jsonValue.default(null), "inputTokens": z.number().int().nullable().default(null), "kind": z.enum(["LLM","TOOL","CHAIN","EVENT"]).nullable().default(null), "level": z.string().nullable().default(null), "metadata": jsonValue.default(null), "model": z.string().nullable().default(null), "name": z.string().nullable().default(null), "output": jsonValue.default(null), "outputTokens": z.number().int().nullable().default(null), "parentId": z.string().nullable().default(null), "start": z.string().nullable().default(null), "statusMessage": z.string().nullable().default(null), "totalTokens": z.number().int().nullable().default(null), "traceId": z.string().nullable().default(null) });
export type SpanView = z.infer<typeof spanView>;

export const runTraceView = z.object({ "input": jsonValue.default(null), "metadata": jsonValue.default(null), "output": jsonValue.default(null), "spans": z.array(spanView), "tags": z.array(z.string()), "timestamp": z.string().nullable().default(null), "totalCost": z.number().nullable().default(null), "traceId": z.string() });
export type RunTraceView = z.infer<typeof runTraceView>;

export const runView = z.object({ "endedAt": z.string().nullable().default(null), "interactionId": z.string().nullable().default(null), "outcome": z.string(), "preset": z.string(), "resumedInteractions": z.array(z.string()), "runId": z.string(), "session": z.string().nullable().default(null), "startedAt": z.string(), "traceId": z.string().nullable().default(null), "user": z.string().nullable().default(null), "version": z.number().int().nullable().default(null) });
export type RunView = z.infer<typeof runView>;

export const runsPage = z.object({ "items": z.array(runView), "nextPage": z.number().int().nullable().default(null), "page": z.number().int() });
export type RunsPage = z.infer<typeof runsPage>;

export const runsPruneResult = z.object({ "cutoff": z.string().nullable().default(null), "pruned_count": z.number().int(), "retention_days": z.number().int().nullable().default(null), "skipped": z.string().nullable().default(null) });
export type RunsPruneResult = z.infer<typeof runsPruneResult>;

export const sandboxPolicy = z.object({ "durable": z.boolean(), "egress": z.string(), "isolation": z.string(), "scrub_transcript": z.boolean() });
export type SandboxPolicy = z.infer<typeof sandboxPolicy>;

export const sandboxInfo = z.object({ "module": z.string().nullable().default(null), "policy": sandboxPolicy, "present": z.boolean(), "provider": z.string().nullable().default(null), "sessions": z.number().int() });
export type SandboxInfo = z.infer<typeof sandboxInfo>;

export const scheduleListResponse = z.array(scheduleListRow);
export type ScheduleListResponse = z.infer<typeof scheduleListResponse>;

export const scheduleRowError = z.object({ "at_iso": z.string().nullable().default(null), "message": z.string() }).strict();
export type ScheduleRowError = z.infer<typeof scheduleRowError>;

export const scopeDeleteResult = z.object({ "deleted_keys": z.number().int(), "scope_id": z.string() });
export type ScopeDeleteResult = z.infer<typeof scopeDeleteResult>;

export const scopeUrlAck = z.object({ "scope_id": z.string(), "url": z.string() });
export type ScopeUrlAck = z.infer<typeof scopeUrlAck>;

export const scopeUrlAdd = z.object({ "pattern": z.string().nullable().default(null), "scope_id": z.string(), "url": z.string() });
export type ScopeUrlAdd = z.infer<typeof scopeUrlAdd>;

export const scopeUrlMap = z.record(z.string(), z.string());
export type ScopeUrlMap = z.infer<typeof scopeUrlMap>;

export const scopeUrlRemove = z.object({ "url": z.string() });
export type ScopeUrlRemove = z.infer<typeof scopeUrlRemove>;

export const scopesUpdateAck = z.object({ "scopes": z.array(z.string()), "updated": z.boolean(), "user_id": z.string() });
export type ScopesUpdateAck = z.infer<typeof scopesUpdateAck>;

export const stateAttachmentView = z.object({ "declarations": z.record(z.string(), jsonValue), "parameters": z.record(z.string(), jsonValue), "path": z.array(z.string()), "template": z.string() });
export type StateAttachmentView = z.infer<typeof stateAttachmentView>;

export const servedStateView = z.object({ "attachments": z.array(stateAttachmentView), "default_subject_kind": z.string(), "description": z.string(), "effective_schema": z.record(z.string(), jsonValue), "name": z.string(), "regimes": z.array(z.record(z.string(), jsonValue)), "retention_days": z.number().int().nullable(), "schema": z.record(z.string(), jsonValue), "subject_kinds": z.array(z.string()), "updated_at": z.string().nullable() });
export type ServedStateView = z.infer<typeof servedStateView>;

export const setConnectorClientRequest = z.object({ "client_id": z.string().min(1), "client_secret": z.string().nullable().default(null), "issuer": z.string().nullable().default(null), "token_endpoint_auth_method": z.enum(["client_secret_post","client_secret_basic","none"]).nullable().default(null) });
export type SetConnectorClientRequest = z.infer<typeof setConnectorClientRequest>;

export const setMcpSecretEnv = z.object({ "key": z.string().nullable().default(null), "key_hint": z.string().nullable().default(null), "manifest_pointer": z.string(), "value": z.string() });
export type SetMcpSecretEnv = z.infer<typeof setMcpSecretEnv>;

export const settingsGroupView = z.object({ "fields": z.array(z.record(z.string(), jsonValue)), "module": z.string(), "name": z.string(), "qualname": z.string() });
export type SettingsGroupView = z.infer<typeof settingsGroupView>;

export const settingsSchemaView = z.object({ "groups": z.array(settingsGroupView) });
export type SettingsSchemaView = z.infer<typeof settingsSchemaView>;

export const setupRequest = z.object({ "key_description": z.string().default("owner key"), "key_user_id": z.string().nullable().default(null), "login": z.discriminatedUnion("kind", [passwordCredential, inviteCredential]).nullable().default(null), "owner_display_name": z.string().min(1), "owner_user_id": z.string().nullable().default(null), "setup_token": z.string().default("") }).strict();
export type SetupRequest = z.infer<typeof setupRequest>;

export const setupResult = z.object({ "api_key": z.string(), "invite_token": z.string().nullable().default(null), "key_fingerprint": z.string(), "key_user_id": z.string(), "login_attached": z.boolean(), "login_path": z.string().nullable().default(null), "owner_user_id": z.string() }).strict();
export type SetupResult = z.infer<typeof setupResult>;

export const startConnectNoAuthResponse = z.object({ "added_manifest_entries": z.array(z.string()).default([]), "connection_id": z.string(), "fanout": z.record(z.string(), z.unknown()).nullable().default(null) });
export type StartConnectNoAuthResponse = z.infer<typeof startConnectNoAuthResponse>;

export const startConnectResponse = z.object({ "authorize_url": z.string(), "flow_id": z.string() });
export type StartConnectResponse = z.infer<typeof startConnectResponse>;

export const startConnectOutcome = z.union([startConnectResponse, startConnectNoAuthResponse]);
export type StartConnectOutcome = z.infer<typeof startConnectOutcome>;

export const startConnectRequest = z.object({ "alias": z.string(), "config_values": z.record(z.string(), z.string()).default({}), "enabled_sub_services": z.array(z.string()).min(1).max(64), "provider_id": z.string(), "return_url": z.string().nullable().default(null) });
export type StartConnectRequest = z.infer<typeof startConnectRequest>;

export const startReconnectRequest = z.object({ "enabled_sub_services": z.array(z.string()).min(1).max(64), "return_url": z.string().nullable().default(null) });
export type StartReconnectRequest = z.infer<typeof startReconnectRequest>;

export const stateAttachmentRow = z.object({ "declarations": z.record(z.string(), jsonValue), "parameters": z.record(z.string(), jsonValue), "path": z.array(z.string()), "state": z.string(), "template": z.string() });
export type StateAttachmentRow = z.infer<typeof stateAttachmentRow>;

export const stateAttachmentList = z.array(stateAttachmentRow);
export type StateAttachmentList = z.infer<typeof stateAttachmentList>;

export const stateConsumerList = z.array(consumerRow);
export type StateConsumerList = z.infer<typeof stateConsumerList>;

export const stateDeclarationList = z.array(stateDeclaration);
export type StateDeclarationList = z.infer<typeof stateDeclarationList>;

export const stateRegimeRule = z.object({ "path": z.array(z.string().min(1)), "regime": z.enum(["single","composing","free"]) }).strict();
export type StateRegimeRule = z.infer<typeof stateRegimeRule>;

export const stateDeclarationPutResponse = z.object({ "default_subject_kind": z.string(), "description": z.string().default(""), "effective_schema": z.record(z.string(), z.unknown()).nullable().default(null), "held": heldPendingSaveList.optional(), "name": z.string(), "regimes": z.array(stateRegimeRule).nullable().default(null), "retention_days": z.number().int().gt(0).lte(2147483647).nullable().default(null), "schema": z.union([templatedText, z.record(z.string(), z.unknown())]).optional(), "subject_kinds": z.array(z.string()).min(1), "updated_at": z.string().datetime({ offset: true }).nullable().default(null) }).strict();
export type StateDeclarationPutResponse = z.infer<typeof stateDeclarationPutResponse>;

export const stateDeleteResult = z.object({ "deleted": z.boolean(), "name": z.string() });
export type StateDeleteResult = z.infer<typeof stateDeleteResult>;

export const statePendingSaveCall = z.object({ "kind": z.string(), "target": z.string() });
export type StatePendingSaveCall = z.infer<typeof statePendingSaveCall>;

export const statePendingSaveSubject = z.object({ "state": z.string(), "subject": stateSubject });
export type StatePendingSaveSubject = z.infer<typeof statePendingSaveSubject>;

export const statePendingSave = z.object({ "attempts": z.number().int(), "calls": z.array(statePendingSaveCall), "created_at": z.string().datetime({ offset: true }), "failed_at": z.string().datetime({ offset: true }).nullable(), "failed_phase": z.enum(["records","calls"]).nullable(), "id": z.string(), "last_error": z.string().nullable(), "run_id": z.string().nullable(), "states": z.array(z.string()), "status": z.enum(["pending","calls","running","failed"]), "subjects": z.array(statePendingSaveSubject) });
export type StatePendingSave = z.infer<typeof statePendingSave>;

export const statePendingSaveDiscarded = z.object({ "discarded": z.string() });
export type StatePendingSaveDiscarded = z.infer<typeof statePendingSaveDiscarded>;

export const statePendingSaveRetried = z.object({ "id": z.string(), "last_error": z.string().nullable(), "status": z.enum(["applied","pending","calls","running","failed"]) });
export type StatePendingSaveRetried = z.infer<typeof statePendingSaveRetried>;

export const statePendingSavesPage = z.object({ "failed": z.number().int(), "items": z.array(statePendingSave), "next_cursor": z.string().nullable(), "outstanding": z.number().int() });
export type StatePendingSavesPage = z.infer<typeof statePendingSavesPage>;

export const stateRecord = z.object({ "canonical_subject": stateSubject, "data": z.record(z.string(), z.unknown()).default({}), "folded_from": z.array(stateSubject).default([]), "seq": z.number(), "state": z.string(), "subject": stateSubject }).strict();
export type StateRecord = z.infer<typeof stateRecord>;

export const stateRecordOrNull = stateRecord.nullable();
export type StateRecordOrNull = z.infer<typeof stateRecordOrNull>;

export const stateSubjectEntry = z.object({ "subject": stateSubject, "updated_at": z.number() });
export type StateSubjectEntry = z.infer<typeof stateSubjectEntry>;

export const stateSearchPage = z.object({ "held": heldPendingSaveList.optional(), "matches": z.array(stateSubjectEntry), "next_cursor": z.string().nullable() });
export type StateSearchPage = z.infer<typeof stateSearchPage>;

export const stateStats = z.object({ "consumers": z.number().int(), "held": heldPendingSaveList.optional(), "per_field": z.record(z.string(), z.number().int()), "per_kind": z.record(z.string(), z.number().int()), "records": z.number().int() });
export type StateStats = z.infer<typeof stateStats>;

export const stateSubjectsPage = z.object({ "held": heldPendingSaveList.optional(), "next_cursor": z.string().nullable(), "subjects": z.array(stateSubjectEntry) });
export type StateSubjectsPage = z.infer<typeof stateSubjectsPage>;

export const stateTemplateDeclarations = z.object({ "check": templatedText.nullable().default(null), "schema": z.record(z.string(), z.unknown()) }).strict();
export type StateTemplateDeclarations = z.infer<typeof stateTemplateDeclarations>;

export const stateTemplateJq = z.record(z.string(), z.unknown());
export type StateTemplateJq = z.infer<typeof stateTemplateJq>;

export const stateTemplateParameter = z.record(z.string(), z.unknown());
export type StateTemplateParameter = z.infer<typeof stateTemplateParameter>;

export const stateTemplateReconcile = z.object({ "close": templatedText, "orphans": templatedText, "resolutions": templatedText }).strict();
export type StateTemplateReconcile = z.infer<typeof stateTemplateReconcile>;

export const stateTemplateTrace = z.object({ "enabled": z.boolean().default(false) }).strict();
export type StateTemplateTrace = z.infer<typeof stateTemplateTrace>;

export const stateTemplateCatalogEntry = z.object({ "attached_to": z.number().int(), "declarations": stateTemplateDeclarations.nullable().default(null), "description": z.string().default(""), "kind": z.literal("state-template").default("state-template"), "name": z.string(), "parameters": z.record(z.string(), stateTemplateParameter).default({}), "reconcile": stateTemplateReconcile.nullable().default(null), "regimes": z.array(stateRegimeRule).default([]), "schema": z.union([templatedText, z.record(z.string(), z.unknown())]).optional(), "shipped_default": z.boolean(), "template_jq": z.record(z.string(), stateTemplateJq).nullable().default(null), "trace": stateTemplateTrace.optional() }).strict();
export type StateTemplateCatalogEntry = z.infer<typeof stateTemplateCatalogEntry>;

export const stateTemplateCatalog = z.array(stateTemplateCatalogEntry);
export type StateTemplateCatalog = z.infer<typeof stateTemplateCatalog>;

export const storageInfo = z.object({ "module": z.string().nullable(), "present": z.boolean(), "provider": z.string().nullable() });
export type StorageInfo = z.infer<typeof storageInfo>;

export const storageUpload = z.object({ "content_base64": z.string().nullable().default(null), "content_text": z.string().nullable().default(null), "id": z.string() });
export type StorageUpload = z.infer<typeof storageUpload>;

export const stringList = z.array(z.string());
export type StringList = z.infer<typeof stringList>;

export const stringListResponse = z.array(z.string());
export type StringListResponse = z.infer<typeof stringListResponse>;

export const studioPluginListingEntry = z.object({ "api_version": z.number().int(), "contributions": contributions, "entry": z.string(), "integrity": z.record(z.string(), z.string()), "mounts": z.record(z.string(), z.string()), "name": z.string(), "version": z.string() }).strict();
export type StudioPluginListingEntry = z.infer<typeof studioPluginListingEntry>;

export const studioPluginListing = z.array(studioPluginListingEntry);
export type StudioPluginListing = z.infer<typeof studioPluginListing>;

export const subMcpListingEntry = z.object({ "access_pattern": z.string(), "mount_url": z.string(), "tools": z.array(z.string()), "transport": z.string() });
export type SubMcpListingEntry = z.infer<typeof subMcpListingEntry>;

export const subMcpMapListing = z.record(z.string(), subMcpListingEntry);
export type SubMcpMapListing = z.infer<typeof subMcpMapListing>;

export const subMcpRegistration = z.object({ "slug": z.string().min(1), "tools": z.array(z.string()), "transport": z.string().default("http") });
export type SubMcpRegistration = z.infer<typeof subMcpRegistration>;

export const subMcpRegistrationResult = z.object({ "slug": z.string(), "tools": z.array(z.string()), "transport": z.string() });
export type SubMcpRegistrationResult = z.infer<typeof subMcpRegistrationResult>;

export const subMcpRemovalResult = z.object({ "removed": z.boolean(), "slug": z.string() });
export type SubMcpRemovalResult = z.infer<typeof subMcpRemovalResult>;

export const systemKindsListing = z.array(kindStatus);
export type SystemKindsListing = z.infer<typeof systemKindsListing>;

export const templateDelete = z.object({ "path": z.string() });
export type TemplateDelete = z.infer<typeof templateDelete>;

export const templateDeleteResult = z.object({ "deleted": z.boolean(), "fanout": fanoutSummary, "path": z.string() });
export type TemplateDeleteResult = z.infer<typeof templateDeleteResult>;

export const templateDirDelete = z.object({ "path": z.string() });
export type TemplateDirDelete = z.infer<typeof templateDirDelete>;

export const templateFetch = z.object({ "template_id": z.string() });
export type TemplateFetch = z.infer<typeof templateFetch>;

export const templateFetchView = z.object({ "schema": z.record(z.string(), jsonValue), "template": z.string() });
export type TemplateFetchView = z.infer<typeof templateFetchView>;

export const templateJqApplyResult = z.object({ "applied": z.boolean(), "data": z.record(z.string(), z.unknown()).nullable().default(null), "name": z.string(), "seq": z.number().nullable().default(null), "skipped": z.array(z.record(z.string(), z.unknown())).default([]) }).strict();
export type TemplateJqApplyResult = z.infer<typeof templateJqApplyResult>;

export const templateJqResult = z.object({ "name": z.string(), "purpose": z.literal("input").default("input"), "value": z.unknown().default(null) }).strict();
export type TemplateJqResult = z.infer<typeof templateJqResult>;

export const templateRender = z.object({ "text": templatedText });
export type TemplateRender = z.infer<typeof templateRender>;

export const templateUpload = z.object({ "content": z.string(), "path": z.string() });
export type TemplateUpload = z.infer<typeof templateUpload>;

export const templateUploadResult = z.object({ "fanout": fanoutSummary, "path": z.string(), "uploaded": z.boolean() });
export type TemplateUploadResult = z.infer<typeof templateUploadResult>;

export const threadDeleteResult = z.object({ "removed": z.number().int(), "route_name": z.string(), "thread_id": z.string() });
export type ThreadDeleteResult = z.infer<typeof threadDeleteResult>;

export const threadMessageAck = z.object({ "message_id": z.string(), "thread_id": z.string() });
export type ThreadMessageAck = z.infer<typeof threadMessageAck>;

export const threadMessageSend = z.object({ "address": z.string().nullable().default(null), "footer": z.string().nullable().default(null), "header": z.record(z.string(), jsonValue).nullable().default(null), "location": z.record(z.string(), jsonValue).nullable().default(null), "media": z.array(z.record(z.string(), jsonValue)).nullable().default(null), "options": z.array(z.record(z.string(), jsonValue)).nullable().default(null), "schema": z.record(z.string(), jsonValue).nullable().default(null), "sections": z.array(z.record(z.string(), jsonValue)).nullable().default(null), "template": z.record(z.string(), jsonValue).nullable().default(null), "text": z.string().regex(new RegExp("\\S")).min(1), "thread_id": z.string().regex(new RegExp("\\S")).min(1) });
export type ThreadMessageSend = z.infer<typeof threadMessageSend>;

export const threadModeSet = z.object({ "mode": z.enum(["agent","manual"]), "thread_id": z.string().regex(new RegExp("\\S")).min(1) });
export type ThreadModeSet = z.infer<typeof threadModeSet>;

export const threadModeSetResult = z.object({ "mode": z.enum(["agent","manual"]), "route_name": z.string(), "source": z.enum(["thread","route"]), "thread_id": z.string() });
export type ThreadModeSetResult = z.infer<typeof threadModeSetResult>;

export const threadModeView = z.object({ "mode": z.enum(["agent","manual"]), "source": z.enum(["thread","route"]) });
export type ThreadModeView = z.infer<typeof threadModeView>;

export const threadSummaryRow = z.object({ "client_address": z.string(), "last_activity_at": z.number(), "last_delivery_status": deliveryStatus, "message_count": z.number().int(), "thread_id": z.string() });
export type ThreadSummaryRow = z.infer<typeof threadSummaryRow>;

export const threadSummaryEnvelope = z.object({ "items": z.array(threadSummaryRow), "next_page": z.number().int().nullable(), "page": z.number().int(), "page_size": z.number().int(), "total": z.number().int(), "truncated": z.boolean(), "unreadable": z.number().int().default(0) });
export type ThreadSummaryEnvelope = z.infer<typeof threadSummaryEnvelope>;

export const tokenPayloadRow = z.object({ "condition": templatedText.nullable().default(null), "description": z.string(), "orphaned": z.boolean().default(false), "policy_data": z.record(z.string(), z.unknown()).nullable().default(null), "principal": principalRef.nullable().default(null), "scopes": z.array(z.string()).nullable().default(null), "user_id": z.string() });
export type TokenPayloadRow = z.infer<typeof tokenPayloadRow>;

export const tokenPayloadList = z.array(tokenPayloadRow);
export type TokenPayloadList = z.infer<typeof tokenPayloadList>;

export const toolExtensionCombosModify = z.object({ "add": z.array(z.array(z.union([z.string(), z.record(z.string(), z.unknown())]))).default([]), "remove": z.array(z.array(z.union([z.string(), z.record(z.string(), z.unknown())]))).default([]) });
export type ToolExtensionCombosModify = z.infer<typeof toolExtensionCombosModify>;

export const toolExtensionsUpdate = z.object({ "combos": z.array(z.array(z.union([z.string(), z.record(z.string(), z.unknown())]))) });
export type ToolExtensionsUpdate = z.infer<typeof toolExtensionsUpdate>;

export const toolExtensionsView = z.object({ "available": z.array(extensionView), "combos": z.array(z.array(z.union([z.string(), z.record(z.string(), z.unknown())]))) });
export type ToolExtensionsView = z.infer<typeof toolExtensionsView>;

export const toolMetaDeleted = z.object({ "deleted": z.boolean(), "tool_name": z.string() });
export type ToolMetaDeleted = z.infer<typeof toolMetaDeleted>;

export const toolMetaRecord = z.object({ "badges": z.array(z.string()).default([]), "display_name": z.string().nullable().default(null), "folder_id": z.string().nullable().default(null), "hidden": z.boolean().nullable().default(null), "tags": z.array(z.string()).default([]), "tool_name": z.string() });
export type ToolMetaRecord = z.infer<typeof toolMetaRecord>;

export const toolMetaListView = z.object({ "folders": z.array(folderRecord), "meta": z.array(toolMetaRecord) });
export type ToolMetaListView = z.infer<typeof toolMetaListView>;

export const toolMetaUpsert = z.object({ "badges": z.array(z.string()).default([]), "display_name": z.string().nullable().default(null), "folder_id": z.string().nullable().default(null), "hidden": z.boolean().nullable().default(null), "tags": z.array(z.string()).default([]) });
export type ToolMetaUpsert = z.infer<typeof toolMetaUpsert>;

export const toolReloadRequest = z.object({ "kind": z.string().min(1), "name": z.string().min(1), "targets": z.array(z.string()).nullable().default(null) });
export type ToolReloadRequest = z.infer<typeof toolReloadRequest>;

export const toolRunListItem = z.object({ "finished_at": z.string().nullable().default(null), "run_id": z.string(), "started_at": z.string(), "status": z.string(), "tool_name": z.string() });
export type ToolRunListItem = z.infer<typeof toolRunListItem>;

export const toolRunListResponse = z.array(toolRunListItem);
export type ToolRunListResponse = z.infer<typeof toolRunListResponse>;

export const toolRunSubmission = z.object({ "arguments": z.record(z.string(), z.unknown()).default({}), "subject": stateSubject.nullable().default(null), "tool_name": z.string().min(1) });
export type ToolRunSubmission = z.infer<typeof toolRunSubmission>;

export const toolRunView = z.object({ "error": z.string().nullable().default(null), "finished_at": z.string().nullable().default(null), "outcome": jsonValue.nullable().default(null), "result": jsonValue.nullable().default(null), "resumed_interactions": z.array(z.string()).nullable().default(null), "run_id": z.string(), "started_at": z.string(), "status": z.string(), "tool_name": z.string() });
export type ToolRunView = z.infer<typeof toolRunView>;

export const toolSchemaView = z.object({ "description": z.string().nullable(), "input": z.record(z.string(), jsonValue), "output": z.record(z.string(), jsonValue).nullable() });
export type ToolSchemaView = z.infer<typeof toolSchemaView>;

export const toolTagRow = z.object({ "badges": z.array(z.string()), "hidden": z.boolean(), "name": z.string(), "schedulable": z.boolean(), "tags": z.array(z.string()) });
export type ToolTagRow = z.infer<typeof toolTagRow>;

export const toolTagListResponse = z.array(toolTagRow);
export type ToolTagListResponse = z.infer<typeof toolTagListResponse>;

export const toolsConfig = z.object({ "exclude": z.array(z.string()).default([]), "extensions": z.record(z.string(), z.array(z.array(z.union([z.string(), z.record(z.string(), z.unknown())])))).default({}), "include": z.array(z.string()).default([]), "module": z.string(), "title": z.string() });
export type ToolsConfig = z.infer<typeof toolsConfig>;

export const toolsEntriesAdd = z.object({ "entries": z.array(toolsConfig), "replace": z.boolean().default(false) });
export type ToolsEntriesAdd = z.infer<typeof toolsEntriesAdd>;

export const toolsSchemaMap = z.record(z.string(), toolSchemaView);
export type ToolsSchemaMap = z.infer<typeof toolsSchemaMap>;

export const topicVerifierBinding = z.object({ "config": z.record(z.string(), z.unknown()).default({}), "verifier": z.string().min(1) });
export type TopicVerifierBinding = z.infer<typeof topicVerifierBinding>;

export const topicVerifierView = z.object({ "topic": z.string(), "verifier": z.string() });
export type TopicVerifierView = z.infer<typeof topicVerifierView>;

export const transcriptEnvelope = z.object({ "items": z.array(conversationRecordView), "next_page": z.number().int().nullable(), "order": z.enum(["asc","desc"]), "page": z.number().int(), "page_size": z.number().int(), "person_id": z.string().nullable(), "total": z.number().int(), "truncated": z.boolean(), "unreadable": z.number().int().default(0) });
export type TranscriptEnvelope = z.infer<typeof transcriptEnvelope>;

export const triggerLinkCreate = z.object({ "execution_key": z.string().min(1), "name": z.string().nullable().default(null), "require_api_key": z.boolean().default(false), "tool_kwargs": z.record(z.string(), z.unknown()).nullable().default(null), "topic": z.string().min(1), "ttl_seconds": z.number().int().nullable() });
export type TriggerLinkCreate = z.infer<typeof triggerLinkCreate>;

export const triggerLinkCreated = z.object({ "expires_at": z.string().nullable(), "name": z.string(), "token": z.string(), "topic": z.string(), "trigger_path": z.string() });
export type TriggerLinkCreated = z.infer<typeof triggerLinkCreated>;

export const triggerLinkView = z.object({ "created_at": z.string(), "created_by": z.string().nullable(), "execution_key": z.string(), "execution_key_fingerprint": z.string(), "expires_at": z.string().nullable(), "name": z.string(), "require_api_key": z.boolean(), "token_hash_prefix": z.string(), "tool_kwargs": z.record(z.string(), jsonValue).nullable(), "topic": z.string(), "trigger_auth": z.enum(["public","verifier","token","token+api_key","out-of-service"]) });
export type TriggerLinkView = z.infer<typeof triggerLinkView>;

export const triggerLinkListView = z.object({ "items": z.array(triggerLinkView), "total": z.number().int() });
export type TriggerLinkListView = z.infer<typeof triggerLinkListView>;

export const uninstallResult = z.object({ "notes": z.array(z.string()), "ref": z.string(), "reload": applyResponse.nullable(), "uninstalled": z.boolean() });
export type UninstallResult = z.infer<typeof uninstallResult>;

export const upgradeRow = z.object({ "detail": z.string(), "outcome": z.enum(["upgraded","up-to-date","no-compatible-version","failed"]), "ref": z.string() });
export type UpgradeRow = z.infer<typeof upgradeRow>;

export const upgradeAllResult = z.object({ "results": z.array(upgradeRow) });
export type UpgradeAllResult = z.infer<typeof upgradeAllResult>;

export const urlAck = z.object({ "url": z.string() });
export type UrlAck = z.infer<typeof urlAck>;

export const userUpdateAck = z.object({ "updated": z.boolean(), "user_id": z.string() });
export type UserUpdateAck = z.infer<typeof userUpdateAck>;

export const workerKind = z.enum(["serve","backend"]);
export type WorkerKind = z.infer<typeof workerKind>;

export const workerState = z.enum(["ready","resyncing","recycling"]);
export type WorkerState = z.infer<typeof workerState>;

export const workerListingRow = z.object({ "beat_at": z.string(), "generation": z.number().int(), "joined_at": z.string(), "kind": workerKind, "last_op": lastOp.nullable().default(null), "name": z.string(), "pid": z.number().int(), "stale": z.boolean(), "state": workerState });
export type WorkerListingRow = z.infer<typeof workerListingRow>;

export const workerListing = z.object({ "workers": z.array(workerListingRow) });
export type WorkerListing = z.infer<typeof workerListing>;

export const writeEntry = z.object({ "at": z.string().datetime({ offset: true }), "origin": completedOrigin, "paths": z.array(z.array(z.union([z.string(), z.number().int()]))).default([]), "seq": z.number() }).strict();
export type WriteEntry = z.infer<typeof writeEntry>;

export const writesPage = z.object({ "items": z.array(writeEntry).default([]), "next_cursor": z.string().nullable().default(null) }).strict();
export type WritesPage = z.infer<typeof writesPage>;

/** The const of each operation's `{"data": …}` success body, by operationId. */
export const responseSchemas = {
  delete_api_agents_config_entries_title: applyResponse,
  delete_api_auth_api_keys_user_id: revokeAck,
  delete_api_auth_principals_user_id: principalDeleted,
  delete_api_auth_public_routes: urlAck,
  delete_api_auth_roles_name: roleDeleted,
  delete_api_auth_scopes_scope_id: scopeDeleteResult,
  delete_api_auth_scopes_urls: urlAck,
  delete_api_config_profiles_name: okResult,
  delete_api_connectors_connections_connection_id: disconnectResponse,
  delete_api_connectors_providers_provider_id: removeProviderResponse,
  delete_api_conversation_configs_target_kind_target_name: conversationConfigDeleteResult,
  delete_api_conversations_persons_person_id: personDeleteResult,
  delete_api_conversations_route_name: routeRemoveResult,
  delete_api_conversations_route_name_thread: threadDeleteResult,
  delete_api_hooks_name: removedByName,
  delete_api_hooks_topics_topic_verifier: removedByTopic,
  delete_api_hooks_trigger_links_name: removedByName,
  delete_api_mcp_config_entries_title: applyResponse,
  delete_api_presets_name: presetDeleteResult,
  delete_api_schedules_schedule_name: opaqueJson,
  delete_api_state_pending_saves_id: statePendingSaveDiscarded,
  delete_api_state_templates_name: stateDeleteResult,
  delete_api_states_name: stateDeleteResult,
  delete_api_states_name_attachments_template: detachAck,
  delete_api_states_name_records_target_kind_target_name_kind_key: eraseAck,
  delete_api_storage_dirs_dir_path: dirDeleted,
  delete_api_storage_resources_resource_id: resourceDeleted,
  delete_api_sub_mcp_slug: subMcpRemovalResult,
  delete_api_tool_meta_folders_folder_id: folderDeleted,
  delete_api_tool_meta_tools_tool_name: toolMetaDeleted,
  delete_api_tools_config_entries_title: applyResponse,
  get_api_agents: agentListing,
  get_api_agents_spec_runnable: agentListing,
  get_api_auth_api_keys_user_id_policy_versions: documentVersionList,
  get_api_auth_capabilities: mintCapabilities,
  get_api_auth_me: projectionResult,
  get_api_auth_member_actions: memberActionCatalog,
  get_api_auth_members: memberDirectory,
  get_api_auth_principals: principalListing,
  get_api_auth_public_routes: stringList,
  get_api_auth_roles: roleDefinitionList,
  get_api_auth_roles_name_versions: roleVersionsView,
  get_api_auth_routes: routeMappingList,
  get_api_auth_scopes: scopeUrlMap,
  get_api_auth_tokens_payload: tokenPayloadList,
  get_api_backend: backendInfo,
  get_api_backup_sections: backupSectionListing,
  get_api_channels: channelListing,
  get_api_config_env: envView,
  get_api_config_mode: configModeView,
  get_api_config_profiles: profileListResponse,
  get_api_config_profiles_name: settingsProfileBody,
  get_api_config_profiles_name_versions: profileVersionListResponse,
  get_api_config_profiles_name_versions_version: profileVersionView,
  get_api_config_settings_schema: settingsSchemaView,
  get_api_connectors_connections: connectionsListResponse,
  get_api_connectors_connections_connection_id: connectedAccountView,
  get_api_connectors_providers: providerCatalogResponse,
  get_api_conversation_configs: conversationConfigListEnvelope,
  get_api_conversation_configs_target_kind_target_name: targetConversationConfig,
  get_api_conversations: conversationRouteListEnvelope,
  get_api_conversations_messages_failed: failedConversationsEnvelope,
  get_api_conversations_persons_person_id: person,
  get_api_conversations_route_name: conversationRouteViewBody,
  get_api_conversations_route_name_messages_message_id: conversationRecordView,
  get_api_conversations_route_name_messages_search: messageSearchEnvelope,
  get_api_conversations_route_name_thread_mode: threadModeView,
  get_api_conversations_route_name_threads: threadSummaryEnvelope,
  get_api_conversations_route_name_transcript: transcriptEnvelope,
  get_api_extensions: extensionListing,
  get_api_fleet_workers: workerListing,
  get_api_hooks: hookListView,
  get_api_hooks_trigger_links: triggerLinkListView,
  get_api_hooks_verifiers: stringListResponse,
  get_api_interactions: interactionWindow,
  get_api_interactions_pending: pendingInteractionListing,
  get_api_login_methods: loginMethodsListing,
  get_api_manifest: preservedManifestView,
  get_api_manifest_mcp_env_refs: mcpEnvRefList,
  get_api_manifest_preserved: preservedManifestView,
  get_api_marketplace_advisories: advisorySnapshot,
  get_api_marketplace_categories: stringList,
  get_api_marketplace_installed: installedInventory,
  get_api_marketplace_kinds: stringList,
  get_api_marketplace_plugins_ns_name: opaqueJson,
  get_api_marketplace_search: opaqueJson,
  get_api_mcp_config_schema: opaqueJson,
  get_api_mcp_status: mcpStatusSnapshot,
  get_api_mcp_status_failed: fleetResult,
  get_api_notifications: notificationListing,
  get_api_observability_capabilities: observabilityCapabilities,
  get_api_observability_metrics: metricsResult,
  get_api_observability_runs: observabilityRunsPage,
  get_api_observability_runs_trace_id_spans_span_id_resolved: resolvedSpanValue,
  get_api_observability_runs_trace_id_trace: runTraceView,
  get_api_observability_runs_trace_id_trace_outline: runTraceOutlineView,
  get_api_plugins: studioPluginListing,
  get_api_presets: presetRecordList,
  get_api_presets_name: presetDetailView,
  get_api_presets_name_referees: presetRefereesResult,
  get_api_presets_name_versions: documentVersionList,
  get_api_presets_name_versions_version: documentVersion,
  get_api_resources_get: resourceContent,
  get_api_runs: runsPage,
  get_api_sandbox: sandboxInfo,
  get_api_schedules: scheduleListResponse,
  get_api_schedules_server_datetime: opaqueJson,
  get_api_state_pending_saves: statePendingSavesPage,
  get_api_state_templates: stateTemplateCatalog,
  get_api_state_templates_name: stateTemplateDocument,
  get_api_states: stateDeclarationList,
  get_api_states_name: servedStateView,
  get_api_states_name_attachments: stateAttachmentList,
  get_api_states_name_attachments_template: stateAttachmentRow,
  get_api_states_name_consumers: stateConsumerList,
  get_api_states_name_records_target_kind_target_name_kind_key: stateRecordOrNull,
  get_api_states_name_records_target_kind_target_name_kind_key_template_jq_program: templateJqResult,
  get_api_states_name_records_target_kind_target_name_kind_key_writes: writesPage,
  get_api_states_name_stats: stateStats,
  get_api_states_name_subjects: stateSubjectsPage,
  get_api_storage: storageInfo,
  get_api_storage_resources: resourceList,
  get_api_storage_resources_resource_id_stat: resourceStat,
  get_api_sub_mcp: subMcpMapListing,
  get_api_system_kinds: systemKindsListing,
  get_api_templates: stringListResponse,
  get_api_tool_meta: toolMetaListView,
  get_api_tool_runs: toolRunListResponse,
  get_api_tool_runs_run_id: toolRunView,
  get_api_tools: stringListResponse,
  get_api_tools_name_extensions: toolExtensionsView,
  get_api_tools_schema: toolsSchemaMap,
  get_api_tools_tags: toolTagListResponse,
  get_api_tools_tool_name_schema: toolSchemaView,
  patch_api_connectors_connections_connection_id_sub_services: patchSubServicesResponse,
  patch_api_states_name_attachments_template: attachUpdateAck,
  patch_api_states_name_records_target_kind_target_name_kind_key: stateRecord,
  patch_api_tool_meta_tools_tool_name: toolMetaRecord,
  post_api_agents_config_entries: applyResponse,
  post_api_api_tools: applyResponse,
  post_api_auth_api_keys: apiKeyCreateResult,
  post_api_auth_api_keys_user_id_policy_rollback: policyRollbackResult,
  post_api_auth_api_keys_user_id_scopes: scopesUpdateAck,
  post_api_auth_claim_links: claimLinkResult,
  post_api_auth_logout: logoutResult,
  post_api_auth_member_actions_invoke: invokeMemberActionResult,
  post_api_auth_principals: principal,
  post_api_auth_public_routes: urlAck,
  post_api_auth_roles: roleDefinition,
  post_api_auth_roles_name_grants: roleDefinition,
  post_api_auth_roles_name_rollback: roleDefinition,
  post_api_auth_scopes: scopeUrlAck,
  post_api_auth_validate_condition: conditionCheckResult,
  post_api_backup_import: backupImportResult,
  post_api_checkpoints_sweep: checkpointSweepResult,
  post_api_clear_templates_cache: cacheClearResult,
  post_api_config_env: applyResponse,
  post_api_config_profiles_name_apply: profileApplyResponse,
  post_api_config_profiles_name_diff: profileDiff,
  post_api_config_profiles_name_rollback: profileWriteResult,
  post_api_config_reload: fleetResult,
  post_api_connectors_connections_connection_id_reconnect: startConnectResponse,
  post_api_connectors_connections_start: startConnectOutcome,
  post_api_connectors_oauth_complete: oAuthCompletionResult,
  post_api_connectors_providers: providerMutationResponse,
  post_api_connectors_providers_discover: discoveredServerView,
  post_api_connectors_tokens_reencrypt: connectorReencryptResult,
  post_api_conversations_route_name: conversationRouteCreateResult,
  post_api_conversations_route_name_events: conversationTurnAck,
  post_api_conversations_route_name_messages: conversationTurnAck,
  post_api_conversations_route_name_thread_messages: threadMessageAck,
  post_api_delete_template: templateDeleteResult,
  post_api_delete_template_dir: templateDeleteResult,
  post_api_fleet_reload_config: fleetResult,
  post_api_hooks: hookRegisterResult,
  post_api_hooks_trigger_links: triggerLinkCreated,
  post_api_interactions_callback_ticket: interactionCallbackAck,
  post_api_interactions_callback_ticket_react: interactionReactionAck,
  post_api_interactions_interaction_id_answer: interactionActionResult,
  post_api_interactions_interaction_id_cancel: interactionActionResult,
  post_api_interactions_interaction_id_react: interactionReactionResult,
  post_api_login_claim: claimExchangeResult,
  post_api_manifest_replace: applyResponse,
  post_api_marketplace_install: installResult,
  post_api_marketplace_install_preview: installPreview,
  post_api_marketplace_uninstall: uninstallResult,
  post_api_marketplace_update: installResult,
  post_api_marketplace_upgrade_all: upgradeAllResult,
  post_api_mcp_config: applyResponse,
  post_api_mcp_config_entries: applyResponse,
  post_api_mcp_config_secret_env: applyResponse,
  post_api_mcp_status_reload_failed: fleetResult,
  post_api_mcp_status_title_deregister: fleetResult,
  post_api_mcp_status_title_reload: fleetResult,
  post_api_notifications: notifyResult,
  post_api_presets: presetCreateResult,
  post_api_presets_name_rename: presetRenameResult,
  post_api_presets_name_rollback: presetRollbackResult,
  post_api_presets_name_versions: presetVersionSaveResult,
  post_api_presets_validate: presetValidateVerdict,
  post_api_render_template: renderedTemplate,
  post_api_resources_get: resourceContent,
  post_api_run_tool: runAnswerResponse,
  post_api_runs_prune: runsPruneResult,
  post_api_schedules: opaqueJson,
  post_api_setup: setupResult,
  post_api_state_pending_saves_id_retry: statePendingSaveRetried,
  post_api_state_retention_prune: pruneResult,
  post_api_states_name_records_search: stateSearchPage,
  post_api_states_name_records_target_kind_target_name_kind_key_deltas: applyResult,
  post_api_states_name_records_target_kind_target_name_kind_key_fold: foldReport,
  post_api_states_name_records_target_kind_target_name_kind_key_template_jq_program: templateJqApplyResult,
  post_api_storage_resources: resourceStored,
  post_api_sub_mcp: subMcpRegistrationResult,
  post_api_template: templateFetchView,
  post_api_tool_meta_folders: folderRecord,
  post_api_tool_meta_folders_folder_id_move: folderRecord,
  post_api_tool_meta_folders_folder_id_rename: folderRecord,
  post_api_tool_runs: runSubmitted,
  post_api_tools_config_entries: applyResponse,
  post_api_tools_name_extensions: applyResponse,
  post_api_tools_name_extensions_combos: toolExtensionsView,
  post_api_tools_reload: fleetResult,
  post_api_tools_remove: fleetResult,
  post_api_upload_template: templateUploadResult,
  put_api_auth_api_keys_user_id: userUpdateAck,
  put_api_auth_principals_user_id: principal,
  put_api_auth_roles_name: roleDefinition,
  put_api_config_profiles_name: profileWriteResult,
  put_api_connectors_providers_provider_id_client: providerMutationResponse,
  put_api_conversation_configs_target_kind_target_name: conversationConfigSetResult,
  put_api_conversations_persons_person_id_locale: person,
  put_api_conversations_route_name_thread_mode: threadModeSetResult,
  put_api_hooks_topics_topic_verifier: topicVerifierView,
  put_api_presets_name_versions_version_tags: presetVersionTagsResult,
  put_api_state_templates_name: stateTemplateDocument,
  put_api_states_name: stateDeclarationPutResponse,
  put_api_states_name_attachments_template: attachAck,
  put_api_states_name_records_target_kind_target_name_kind_key: stateRecord,
} as const;
