# Plugin security / trust boundary

`@tai42/studio-sdk` ships as three entry points, split along a trust boundary:

- **`@tai42/studio-sdk`** — the plugin surface. Types, `PluginContext`/`PluginEntry`,
  contribution types, the design system, and hooks. This is the only SDK entry a
  Studio plugin is allowed to import, and it is the served vendor asset
  (`/vendor/studio-sdk.js`) every plugin bundle binds through the import map.
- **`@tai42/studio-sdk/host`** — the host-only registry API: `loadPlugin` (the one
  entry a plugin's `register` contributes through) and `getContributions` (what the
  shell reads). Served as `/vendor/studio-sdk-host.js` and imported only by the host
  shell.
- **`@tai42/studio-sdk/testing`** — a test-only registry reset (`__resetContributions`).
  Never served to the browser.

The SDK is not the only shared module the import map serves to plugins. The other
is **`@tai42/jq-studio`** (`/vendor/jq-studio.js`), the standalone visual jq editor:
a separately published package, not an SDK entry point — the SDK re-exports none of
it — that a plugin rendering `JqField` imports directly. It sits on the plugin side
of the boundary: it carries no registry, and being served as one module is what
makes a plugin's editor share the host's single primitives context and evaluation
worker, exactly as the served react and `@tai42/studio-sdk` are shared.

## Why the split

The in-memory registry lives in one module and is a singleton across the plugin
boundary. If a plugin could import `loadPlugin`/`getContributions`, a compromised
bundle could forge, wipe, or enumerate every plugin's contributions. Keeping the
registry API on `@tai42/studio-sdk/host` means the served plugin asset carries no
registry at all — the registry state exists in exactly one served asset
(`/vendor/studio-sdk-host.js`).

## How the boundary is enforced

- **At plugin ingest** — the skeleton rejects any plugin bundle that references
  a host-only subpath (`@tai42/studio-sdk/host` or `@tai42/studio-sdk/testing`). This
  is the real enforcement.
- **At dev time** — an ESLint `no-restricted-imports` rule forbids plugin source
  from importing `@tai42/studio-sdk/host` or `@tai42/studio-sdk/testing`, so an author
  hits the wall before publishing.

## Threat model

The current model trusts installed plugins: they come from a curated registry,
are SRI-pinned, and are reviewed before install. Under that model the split
above is sufficient.

The shipped marketplace surface stays inside that model. It browses one curated
registry, and every install, update, and uninstall runs on the host backend
through its authed `/api/marketplace/*` routes — the browser never fetches or
installs a bundle itself. The backend resolves the listing to a pinned version,
refuses a non-withdrawn critical advisory, downloads the registry-named artifact,
and verifies its sha256 against the digest the registry captured at release
before anything is installed.

What would need stronger isolation is an OPEN submission model — anyone
publishing a plugin that installs without review. That would call for per-plugin
iframe or worker sandboxing so a hostile bundle cannot reach shared page state at
all. That is tracked as future work.
