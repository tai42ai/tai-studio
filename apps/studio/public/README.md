# Static public assets

Files here are copied verbatim to the built SPA root by Vite and served
byte-constant by the skeleton (no import-map injection, no per-response nonce).

## Brand marks

`tai42-logo-icon.png` (155x155) is the tab favicon, wired from `index.html`;
`apple-touch-icon.png` (180x180) is its iOS home-screen counterpart.
`tai42-logo-icon-dark.png` is the same mark redrawn for dark surfaces — the
gradient runs to near-black at one end, so the light mark is not legible against
a dark ground and the shell picks the variant that matches the active theme.

## OAuth popup relay

Connector OAuth runs in a popup window. Two byte-constant pages relay the
provider result back to the application window, which performs the authed
exchange itself:

1. `oauth-bridge.html` / `oauth-bridge.js` — the fixed `redirect_uri` the
   provider returns to. Reads the originating deployment origin from the signed
   `state` (the `o` claim, validated as a well-formed http(s) origin) and
   forwards the popup to that origin's `oauth-callback.html`, query string
   intact. Handles the shared-bridge hop; a no-op same-origin forward when no
   bridge is configured.
2. `oauth-callback.html` / `oauth-callback.js` — served on the originating
   origin. Posts the raw result to `window.opener` and closes.

### postMessage contract

The callback posts, with `targetOrigin` set to its own origin:

```ts
{
  type: 'tai:oauth:callback',
  code: string | null,
  state: string | null,
  error: string | null,
}
```

The application window (the connectors feature) MUST, before trusting it:

- check `event.origin === window.location.origin`;
- check `event.source` is the popup handle it opened;
- check `event.data.type === 'tai:oauth:callback'`.

It then calls `POST /api/connectors/oauth/complete` with `{ code, state, error }`
(the authed request that holds the session token) and handles the
`{ kind: 'success' | 'failed' | 'cancelled' }` result.

The scripts are external (not inline) because the strict CSP served with these
pages is `script-src 'self'` with no nonce injected here — an inline script
would be blocked.
