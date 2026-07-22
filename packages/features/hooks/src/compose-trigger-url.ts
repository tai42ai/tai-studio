/**
 * Compose the ABSOLUTE trigger-link URL a QR encodes from the api-client's
 * configured base and the server-returned relative `trigger_path`.
 *
 * The base wins: a trigger URL must target the API origin (a QR scan is a bare GET
 * the API must receive), so when the client is configured with an absolute
 * `baseUrl` that origin is used; only a same-origin deployment (empty `baseUrl`)
 * falls back to `window.location.origin`. The base's trailing slash is stripped
 * before the join so the result never double-slashes — `trigger_path` always
 * starts with `/`.
 *
 * This is the ONLY place in the feature that reads `window.location.origin`: URL
 * composition is a feature concern, never the api-client's (a transport).
 */
export function composeTriggerUrl(baseUrl: string, triggerPath: string): string {
  const origin = baseUrl !== '' ? baseUrl : window.location.origin;
  const trimmed = origin.replace(/\/+$/, '');
  return `${trimmed}${triggerPath}`;
}
