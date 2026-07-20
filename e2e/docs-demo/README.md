# docs-demo — the Studio docs-screenshot pipeline

A permanent, reproducible pipeline that regenerates **all 16 Studio screens**
(light + dark = 32 PNGs) for the documentation site and README, each fully
populated and showing the current Studio build — the full-admin screens plus the
capability-scoped screens (the owned-key views and the mint→claim-link QR). Rerun
it whenever the UI or branding changes.

## One command

```bash
cd tai-studio
bash e2e/scripts/docs-screenshots.sh
```

Outputs:

- `tai-docs/images/studio/*.png` — the 16 documentation screens × 2 themes.
- `tai-studio/docs/screenshots/*.png` — the 5 shell screens the README embeds,
  from the same capture.

Assumes sibling checkouts of `tai-skeleton`, `tai-docs`, `tai-agents`,
`tai-storage-local`, and `tai-toolbox`; override with `SKELETON_DIR`,
`TAI_DOCS_DIR`, `TAI_AGENTS_DIR`, `TAI_STORAGE_LOCAL_DIR`, `TAI_TOOLBOX_DIR`. See
the runner's header (`e2e/scripts/docs-screenshots.sh`) for every env knob
(`SKIP_SPA_BUILD`, `KEEP_UP`, `OUT_DIR`, …) and prerequisites.

## How it works

Unlike the lean end-to-end boot (`e2e/boot/manifest.yml`, which stays separate and
untouched), the **docs-demo backend** (`manifest.yml` here) loads every UI-facing
router plus the real plugins so no screen is empty:

| Screen                                        | Populated by                                                         |
| --------------------------------------------- | -------------------------------------------------------------------- |
| tools / tool-run                              | the reference-plugin demo tools                                      |
| extensions                                    | `ask_external` + the `prometheus_metrics` wrapper                    |
| settings                                      | the auto-populated settings schema                                   |
| agents                                        | `tools_agent` (from `tai-agents`)                                    |
| dashboard                                     | the seeded `docs_demo_monitoring` backend (real trend + by-model)    |
| manifest                                      | a non-empty `user_tools` set                                         |
| templates                                     | `tai-storage-local` + the seeded templates in `templates/`           |
| system                                        | the `health` + `metrics` routers (loaded before the SPA catch-all)   |
| system-kinds                                  | the `system_kinds` router's `/api/system/kinds` (Plugin-kinds table) |
| users-admin                                   | the accounts plugin's users-admin page (seeded human accounts)       |
| login                                         | the signed-out credential screen                                     |
| scoped-tools / -interactions / -notifications | the runner-minted **owned key** + its audience-addressed inbox rows  |
| mint-claim-link                               | the mint flow driven to the minted-key dialog's claim-link QR step   |

The runner builds the SPA, boots the docs-demo skeleton via a parametrized
`e2e/boot/boot.sh` (`MANIFEST_PATH` + `EXTRA_PLUGINS`), warms up the Prometheus
counters with real tool runs, seeds the demo accounts and the scoped surfaces (an
owned key whose capability projection is jq-fenced to the tools / tool-runs /
interactions / channels / notifications / auth routes — every door the scoped pages
hit — plus an audience-addressed notification and a pending audience-addressed
question), then
runs `e2e/scripts/docs-screenshots.mjs`, which
asserts populated content per screen and **fails rather than shipping an empty or
broken shot**. The capability-scoped screens authenticate as that owned key, so
they render the projection-filtered view (trimmed nav, sliced tools list, and
audience-limited inboxes). No `/login#claim=` shot exists — the claim token burns
on first load, so that leg is covered by the Playwright e2e suite, not a screenshot.

### The observability data (`monitoring-plugin/`)

The dashboard needs a read-capable monitoring backend with recorded runs (the
no-op default reads zeros). Rather than depend on an external Langfuse server
(live service + key provisioning + ingestion lag — fragile for a one-command
pipeline), this ships a small self-contained backend, `docs_demo_monitoring`, that
implements the real `MonitoringWriter`/`MonitoringReader` contract over an
in-memory store seeded with a deterministic demo dataset. Only the dataset is a
fixture; the read path the dashboard renders from is production code. See
`monitoring-plugin/README.md`.

### Contents

- `manifest.yml` — the docs-demo skeleton manifest.
- `templates/` — seeded template files for the Templates screen.
- `monitoring-plugin/` — the seeded, self-contained monitoring backend.
