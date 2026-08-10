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

## Naming

PyPI is a flat namespace with no owner in the path, so distributions carry the
`tai42-` prefix. GitHub repositories keep their `tai-` names, because the
`tai42ai` organisation already namespaces them. Import packages follow the
distribution.

| Surface                                             | Form           |
| --------------------------------------------------- | -------------- |
| Distribution — PyPI, `pip install`, dependency pins | `tai42-<name>` |
| Import package                                      | `tai42_<name>` |
| GitHub repository                                   | `tai-<name>`   |

So a dependency is declared as `tai42-<name>` while its repository is named
`tai-<name>`, and both spellings are correct in their own context.

Some surfaces are deliberately neither, and must not be renamed: the `tai` CLI
command (`tai42` is an alias), the Prometheus metric namespace (`tai_tool_*`),
`TAI_*` environment variables, and the `tai-plugin.yml` descriptor filename.

## Dev

```bash
pnpm install
pnpm -r build          # build first: each package resolves the others through their built declarations
pnpm -r typecheck
pnpm -r lint
pnpm -r format:check
pnpm -r test --coverage
```

`pnpm --filter @tai42/studio-app dev` starts the Vite dev server.

Node 22+ and pnpm at the version pinned in `package.json`'s `packageManager`
field (currently 11.x) are assumed already installed; this repo never
provisions pnpm via corepack, Homebrew, or a global npm install.

`pnpm e2e` runs the Playwright suites against a real backend and is a
**maintainer command**, not part of the ordinary loop. The boot recipe
(`e2e/boot/boot.sh`) needs Docker (it brings up a loopback Redis and Postgres),
`uv`, and one checkout beside this repo: the `tai42` monorepo. It runs the
skeleton (`core/skeleton`) from the monorepo's uv workspace venv (`tai42/.venv`),
which `uv sync --package tai42-skeleton` builds with every first-party dependency
resolved from the workspace; boot.sh installs the reference plugin and
`plugins/webhook-verifier-github` into that venv. CI runs it for you on every
pull request from this repo.

Before any commit, run a secret scan over the tree (e.g. `detect-secrets scan`) —
never commit a real `.env` or an API key.

## Commits and releases

Commits and PR titles follow [Conventional Commits](https://www.conventionalcommits.org)
— the `commitlint` check fails a PR that does not. The type picks the version
bump: `fix:` a patch, `feat:` a minor, `feat!:` (or a `BREAKING CHANGE:` footer)
a major; `chore:`, `docs:`, `test:`, `ci:`, `refactor:`, `perf:`, `build:` and
`style:` release nothing.

You add nothing else to the PR. On every push to `main`, release-please reads the
merged commits and opens (or updates) a release PR carrying the next version;
merging that PR tags `v<version>` and publishes the packages, with the notes
generated onto the GitHub Release. There is no changelog file to edit.

## License

By contributing you agree your contributions are licensed under Apache-2.0.
