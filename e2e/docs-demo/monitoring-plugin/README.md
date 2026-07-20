# docs-demo-monitoring

The self-contained monitoring backend used by the tai-studio **docs-screenshot
pipeline** (`e2e/scripts/docs-screenshots.sh`). It exists so the Studio
observability screens — the dashboard, the run list, and the trace drill-in —
render **populated, real data** without any external service.

## What it is

A genuine implementation of the vendor-neutral monitoring contract
(`tai_contract.monitoring`):

- `DemoWriter` — the full `MonitoringWriter`, recording live spans/events into an
  in-memory `TraceStore` (fail-safe: an emit never raises into a flow).
- `DemoReader` — the full `MonitoringReader`, doing real aggregation over the
  store (summary totals, a day/hour/week trend series, a by-model breakdown, the
  run list, and single-trace detail).
- `build_monitoring()` — the registered zero-arg builder. It seeds the store with
  a deterministic demo dataset (24 runs across ~14 days and three models) so the
  dashboard shows plausible numbers.

Only the seeded **dataset** is a demo fixture; the **read path** the dashboard
renders from is exactly the production `/api/observability/*` code.

## How it loads

Naming it in a manifest activates it — no entry point:

```yaml
monitoring_module: docs_demo_monitoring
```

Importing the package fires
`@tai_app.monitoring.register_monitoring` (an import side-effect), replacing the
skeleton's no-op default. Install it into the skeleton venv with
`uv pip install <this dir>`; the docs-screenshot runner does this automatically.

## Why not Langfuse?

The shipped Langfuse monitoring plugin reads and writes against an **external**
Langfuse server, which requires a live service, out-of-band project-key
provisioning, and ingestion lag — structural fragility inside a "one command,
rerunnable anywhere" screenshot pipeline. This backend is deterministic and
dependency-free, which is what a permanent pipeline needs. See the pipeline
overview in `../README.md`.

## Tests

```
<skeleton venv>/bin/python -m pytest tests/
```
