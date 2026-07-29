/** How a fire door reads for display. The door itself is server-derived. */
import type { TriggerAuth } from '@tai42/api-client';

/** A door's auth type as one cell; never blank. */
export function describeTriggerAuth(auth: TriggerAuth): string {
  switch (auth) {
    case 'public':
      return 'Public';
    case 'verifier':
      return 'Verifier-signed';
    case 'token':
      return 'QR token';
    case 'token+api_key':
      return 'QR token + api key';
    case 'out-of-service':
      return 'Out of service';
  }
}
