/**
 * Pure helpers for the connect form: the OAuth-result discriminator and the
 * `StartConnectArgs` assembly from the form fields.
 */
import type { ApiClient, ProviderView, StartConnectArgs } from '@tai42/api-client';

type StartConnectResult = Awaited<ReturnType<ApiClient['startConnect']>>;

/** Whether a start-connect result carries an OAuth `authorize_url` (vs a no-auth completion). */
export function hasAuthorizeUrl(
  result: StartConnectResult,
): result is Extract<StartConnectResult, { authorize_url: string }> {
  return 'authorize_url' in result;
}

/** Assemble the start-connect args; a filled config field is included, a blank one omitted. */
export function buildConnectArgs(
  provider: ProviderView,
  alias: string,
  enabled: ReadonlySet<string>,
  configValues: Record<string, string>,
): StartConnectArgs {
  const values: Record<string, string> = {};
  for (const field of provider.config_fields) {
    const value = configValues[field.key];
    if (value !== undefined && value !== '') values[field.key] = value;
  }
  return {
    provider_id: provider.id,
    alias: alias.trim(),
    enabled_sub_services: [...enabled],
    ...(Object.keys(values).length > 0 ? { config_values: values } : {}),
  };
}
