/** Composition root: assembles the per-resource sub-clients into the client. */
import type { ApiConfig } from '../http';
import { agentsClient } from './agents-client';
import { authClient } from './auth-client';
import { backendClient } from './backend-client';
import { backupClient } from './backup-client';
import { capabilitiesGetCaps, capabilitiesGetMe } from './capabilities-client';
import { channelsClient } from './channels-client';
import { configClient } from './config-client';
import { connectorsClient } from './connectors-client';
import { conversationsClient } from './conversations-client';
import { hooksClient } from './hooks-client';
import { interactionsClient, interactionsStreamClient } from './interactions-client';
import { loginClient, logoutClient } from './login-client';
import { manifestClient, manifestSecretEnvClient } from './manifest-client';
import { marketplaceClient } from './marketplace-client';
import { mcpConfigSchemaClient } from './mcp-config-schema-client';
import { notificationsClient } from './notifications-client';
import { observabilityClient } from './observability-client';
import { pluginsClient } from './plugins-client';
import { policyClient } from './policy-client';
import { presetsClient } from './presets-client';
import { profilesClient } from './profiles-client';
import { schedulesClient } from './schedules-client';
import { settingsSchemaClient } from './settings-schema-client';
import { statesClient } from './states-client';
import { storageClient } from './storage-client';
import { subMcpClient } from './sub-mcp-client';
import { systemClient } from './system-client';
import { templatesClient } from './templates-client';
import { toolExtensionsClient } from './tool-extensions-client';
import { toolMetaClient } from './tool-meta-client';
import { toolsClient } from './tools-client';
import { makeTransport } from './transport';
import { triggerLinksClient } from './trigger-links-client';
import { webEntryGateClient } from './web-entry-gate-client';

export type {
  AddUrlToScopeBody,
  ApiKeyBody,
  ClaimLinkBody,
  PinRoutePublicBody,
  RoleCreateBody,
  RoleUpdateBody,
} from './auth-client';
export type { StartConnectArgs } from './connectors-client';
export type {
  ConversationMessageSearchQuery,
  ConversationThreadFilters,
  ConversationThreadMessageBody,
  ConversationTranscriptQuery,
} from './conversations-client';
export type { TopicVerifierBody } from './hooks-client';
export { isSafeApiPath } from './login-client';
export type { ApiToolsListsBody } from './manifest-client';
export type {
  MarketplaceInstallBody,
  MarketplaceInstallPreviewBody,
  MarketplaceSearchQuery,
  MarketplaceUninstallBody,
} from './marketplace-client';
export type { MetricsQuery, RunsQuery } from './observability-client';
export type { ValidateConditionBody } from './policy-client';
export type { CreatePresetBody, SavePresetVersionBody, ValidatePresetBody } from './presets-client';
export type {
  StateAttachmentBody,
  StateDeclarationBody,
  StatePageQuery,
  StateSubjectRef,
  StateTemplateBody,
} from './states-client';
export type { StorageUploadBody } from './storage-client';
export type { ToolMetaPatch } from './tool-meta-client';
export type { RunToolArgs, ToolAdminArgs } from './tools-client';
export type { TriggerLinkCreateBody } from './trigger-links-client';
export type { WebEntryCodeMintBody } from './web-entry-gate-client';

export function createApiClient(config: ApiConfig) {
  const t = makeTransport(config);
  return {
    baseUrl: config.baseUrl ?? '',
    ...toolsClient(t),
    ...presetsClient(t),
    ...statesClient(t),
    ...toolMetaClient(t),
    ...storageClient(t),
    ...backendClient(t),
    ...toolExtensionsClient(t),
    ...templatesClient(t),
    ...manifestClient(t),
    ...subMcpClient(t),
    ...configClient(t),
    ...profilesClient(t),
    ...manifestSecretEnvClient(t),
    ...connectorsClient(t),
    ...pluginsClient(t),
    ...interactionsClient(t),
    ...channelsClient(t),
    ...conversationsClient(t),
    ...webEntryGateClient(t),
    ...notificationsClient(t),
    ...agentsClient(t),
    ...hooksClient(t),
    ...triggerLinksClient(t),
    ...mcpConfigSchemaClient(t),
    ...settingsSchemaClient(t),
    ...authClient(t),
    ...capabilitiesGetMe(t),
    ...loginClient(t),
    ...capabilitiesGetCaps(t),
    ...logoutClient(t),
    ...policyClient(t),
    ...backupClient(t),
    ...schedulesClient(t),
    ...observabilityClient(t),
    ...marketplaceClient(t),
    ...systemClient(t),
    ...interactionsStreamClient(t),
  } as const;
}

export type ApiClient = ReturnType<typeof createApiClient>;
