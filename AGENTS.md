# AGENTS.md

Contributor and agent rules for this repository. Terse by design.

## Commits

Conventional Commits. The type sets the release:

| Type                                                                 | Release |
| -------------------------------------------------------------------- | ------- |
| `fix:`                                                               | patch   |
| `feat:`                                                              | minor   |
| `feat!:` or a `BREAKING CHANGE:` footer                              | major   |
| `chore:` `docs:` `test:` `ci:` `refactor:` `perf:` `build:` `style:` | none    |

release-please parses merged commits and raises a release PR; a human merges it,
which tags `v<version>` and publishes. Non-conforming commits and PR titles fail
the `commitlint` check.

## Build, test, lint

```sh
pnpm install --frozen-lockfile
pnpm -r build
pnpm -r typecheck
pnpm -r lint
pnpm -r format:check
pnpm format:check
pnpm -r test --coverage
```

## Comments and docs

Terse, constraint-only, present tense. State the constraint and why it holds, not
what changed. No history notes, no ticket or issue references.

## Rules

- Release notes are generated onto the GitHub Release by release-please from the
  merged commits.
- Loud errors: a failure fails the run. No silent fallbacks, no `|| true`, no
  swallowed exceptions, no compatibility shims.
- The workflows under `.github/workflows/` are the source of truth for commands;
  keep this file in step with them.
