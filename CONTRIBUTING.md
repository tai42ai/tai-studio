# Contributing to tai-studio

`tai-studio` is the React 19 + TypeScript web UI for a `tai42-skeleton` MCP server.
It is a pnpm-workspaces monorepo: a shell app composes feature packages that all
build on a shared SDK and a typed API client.

## Ground rules

- **Respect the import boundaries.** They are enforced by ESLint, not just
  convention:
  - a feature package (`@tai42/feature-*`) imports **only** `@tai42/studio-sdk` and
    `@tai42/api-client` — never another feature package;
  - the shell app (`@tai42/studio-app`) imports feature packages and the SDK;
  - `@tai42/studio-sdk`'s one internal edge is a **type-only** import of
    `@tai42/api-client` (a declared dependency); it ships no runtime coupling
    beyond that.
- **TypeScript strict, no escapes.** `strict` is on; do not add `any` or
  `@ts-ignore` without a written reason on the same line. The libraries emit
  `.d.ts` — keep their public types clean.
- **Client state stays local.** Server state goes through TanStack Query; reach
  for `zustand` only for genuinely client-local UI state.
- **Accessibility is a check, not a nicety.** `eslint-plugin-jsx-a11y` runs in
  CI; keep it green.

## Dev

```bash
pnpm install
pnpm -r typecheck
pnpm -r lint
pnpm -r format:check
pnpm -r test
```

Node 22+ and pnpm at the version pinned in `package.json`'s `packageManager`
field (currently 11.x) are assumed already installed; this repo never
provisions pnpm via corepack, Homebrew, or a global npm install.

`pnpm e2e` runs the Playwright suites against a real backend and is a
**maintainer command**, not part of the ordinary loop. The boot recipe
(`e2e/boot/boot.sh`) needs Docker (it brings up a loopback Redis and Postgres),
`uv`, and five checkouts beside this repo: `tai-skeleton` — run from its own
`.venv` — plus `tai42-contract`, `tai42-kit`, `tai42-toolbox`, and `tai42-identity-redis`,
which the skeleton's `uv.lock` resolves as editable siblings. CI runs it for you
on every pull request from this repo.

Before any commit, run a secret scan over the tree (e.g. `detect-secrets scan`) —
never commit a real `.env` or an API key.

## Changesets

Every PR that changes a package's code adds a changeset so its version bump and
release notes are recorded: run `pnpm changeset`, pick the affected packages and
bump level, and commit the generated `.changeset/*.md` file. CI fails a PR that
touches package code without one. A docs-only or otherwise no-release PR
satisfies the check with an empty changeset: `pnpm changeset --empty`.

## License

By contributing you agree your contributions are licensed under Apache-2.0.
