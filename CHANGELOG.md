# Changelog

All notable changes to `tai-studio` are documented here; the format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Until 1.0.0 the API is not stable: **minor (0.x) releases may contain breaking
changes.**

## [Unreleased]

First release (0.1.0) in preparation. This is the initial build of the Studio, a
React 19 + TypeScript web workbench for a running `tai-skeleton` MCP server.

### Added

- **Tools surface** — browse the skeleton's registered tools and run any tool
  from a schema-driven auto-form. Runs can be synchronous or dispatched to the
  background with a polling status panel. Results render by type: JSON trees,
  escaped code/text, and inline image/audio for tools that return media.
- **Agents surface** — list registered agents and run one with a live streaming
  timeline, plus compose and run your own authored agents, with a
  structured-output authoring UI in the compose dialog.
- **Extensions surface** — browse the extension catalog and apply an extension
  to a tool; view tool-and-extension combinations with tag filtering.
- **Presets surface** — create, version, roll back, save, and delete versioned
  tool presets.
- **Templates surface** — list, upload, delete, render-preview, and clear the
  cache of manifest and config templates.
- **Hooks surface** — list, register, and delete lifecycle hooks, filtered by
  topic.
- **Interactions surface** — a human-in-the-loop inbox for prompts, forms,
  confirmations, and external-link steps, with a global pending-count badge. A
  question also delivered through an installed channel plugin (e.g. Telegram)
  shows which channel handled it.
- **Notifications surface** — an inbox for the internal `notify_user` sink,
  listing messages recorded with no delivery channel, newest-first.
- **Connectors surface** — set up and manage OAuth connections to outside apps.
- **Settings surface** — MCP-config form plus Settings, Environment, API keys,
  and Backup tabs, with API-key provisioning and access policy.
- **Marketplace surface** — browse the curated plugin registry item by item,
  inspect a plugin's detail (versions, contained items, advisories), and install,
  update, or uninstall plugins.
- **Storage surface** — browse the content store a storage-provider plugin
  exposes, with per-resource stat, download, upload, and delete.
- **Access control** — a drag-and-drop mapper for assigning scopes to routes.
- **Observability, scheduling, system, and manifest surfaces** — a monitoring
  dashboard with runs and traces, schedule management, health and metrics, and
  a view of the skeleton's loaded manifest and derived MCP servers.
- **Plugin system** — a runtime plugin loader that mounts third-party Studio
  plugins, backed by a published plugin SDK (contract, design system, hooks, and
  schema-form components) with a version-compatibility gate.
- **Sign-in screen** for the Studio shell.

### Security

- The post-login redirect only accepts unambiguous same-origin paths; backslash,
  protocol-relative, control-character, and absolute-URL variants that could be
  normalized into a cross-origin open redirect fall back to the default landing
  route.
- Media results only render as an image or audio element when the payload's MIME
  type matches its declared kind; any other shape falls through to the plain
  JSON/text view and is never turned into an inline resource.
- Oversized tool-run results are truncated when rendered, with the full payload
  offered as a download rather than forced into the DOM, and error responses
  surface the server's message verbatim rather than a generic failure.

[Unreleased]: https://github.com/tai42ai/tai-studio/commits/main
