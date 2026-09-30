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
pull request from this repo. To pair a change here with one in the tai42
monorepo, add a `tai42-ref: <branch-or-sha>` line to the pull request body and
the cross-repo e2e gate runs the monorepo's harness at that ref instead of
`main`; the line is a plain body field, not a Conventional-Commits header, so it
never affects the release the pull request projects. The value must be a branch
name or a 40-character commit sha — never a fully-qualified `refs/…` ref, which
is refused.

By default `pnpm e2e` builds and boots its own stack. Set `TAI_E2E_TARGET` to a
running stack — a bare origin (for example `http://127.0.0.1:8765`) or the name of a
file in `e2e/targets/` — to point the suites at it and boot nothing; leave it unset to
boot the stack as above. A target file (see `e2e/targets/example.yml`) gives the
stack's `url`, the name of the environment variable holding its login key (`key_env`,
default `TAI_E2E_KEY`), and any facts it cannot report about itself under `provides`.

Each spec declares what it needs from the stack with `needs(...)` at the top of the
file. A need is reported by the stack (`kind:<kind>`, read from
`GET /api/system/kinds`), declared by the target file (`probe-tools`, `mutable`), or
met only by a stack the run builds itself (`no-stack`, `setting:…`, and the rest); for
example `needs('kind:states', 'mutable')` runs only against a stack that reports the
states kind and permits stack-wide writes. On a target, a spec whose needs are not met
is skipped with the missing need as its reason.

Either way each run writes a JUnit report (`junit.xml` beside the Playwright config),
which CI uploads as an artifact and shows in the job summary — the skip reasons among
them. To point one CI run at a stack, use the workflow's `workflow_dispatch`
`e2e_target` input.

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
merging that PR tags `v<version>` and publishes the packages, with the release
notes generated onto the GitHub Release.

Before it publishes, the release diffs the committed API reports
(`packages/*/etc/*.api.md` — `@tai42/studio-sdk`'s three entry points and
`@tai42/api-client`) against the previous release tag and fails when the surface
change outruns the version bump it rides; a breaking surface change must ride a
breaking-marked commit, so a major at `>=1.0`. The `release-label` check runs the
same gate before the merge: it projects the version release-please would publish
from the pull request's title and body and diffs the reports against that version,
so a mislabelled release is refused on the pull request rather than after the tag.
CI verifies the committed reports
match the built surface on every pull request and push to `main`, and a change
that moves a published
surface regenerates its report with the package's `api:update` script. The gate's
mode is configuration: `label-honesty` allows a `0.x` package the minor-breaking
slot; `strict` removes it, so a breaking change then requires the `1.0`
graduation.

## License

By contributing you agree your contributions are licensed under Apache-2.0.
