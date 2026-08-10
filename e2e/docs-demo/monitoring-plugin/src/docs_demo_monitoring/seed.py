"""The docs-demo observability dataset.

:func:`build_seed_traces` returns a fixed, realistic set of traces spread over
the two weeks preceding ``now`` across three models, so the Studio dashboard
renders populated summary tiles, a multi-bucket day trend, and a ranked
"Cost by model" breakdown — all from the real ``/api/observability/metrics``
route and the real reader aggregation. The dataset is the only "demo" part; the
read path is production code.

All timestamps are relative to the ``now`` passed at build time, so the data
stays inside the dashboard's default 30-day window on every rerun.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from tai42_contract.monitoring import MonitoringObservation, MonitoringTrace

# One row per trace: (days_ago, hour_utc, model, input_tokens, output_tokens,
# cost_usd, latency_seconds). Spread over 13 days and three models so the day
# trend has many buckets and the by-model bars are clearly ranked
# (12 sonnet / 7 gpt-4o-mini / 5 llama).
_SEED_ROWS: tuple[tuple[int, int, str, int, int, float, float], ...] = (
    (13, 9, "claude-sonnet-4-5", 4200, 1350, 0.049, 4.1),
    (13, 15, "gpt-4o-mini", 2600, 700, 0.004, 1.6),
    (12, 10, "claude-sonnet-4-5", 5100, 1900, 0.062, 5.0),
    (11, 11, "llama-3.3-70b", 3800, 1200, 0.011, 3.9),
    (11, 16, "claude-sonnet-4-5", 3600, 1100, 0.042, 3.5),
    (10, 9, "gpt-4o-mini", 2200, 500, 0.003, 1.2),
    (10, 14, "claude-sonnet-4-5", 6100, 2400, 0.078, 6.3),
    (9, 10, "claude-sonnet-4-5", 4400, 1500, 0.053, 4.4),
    (9, 17, "llama-3.3-70b", 4100, 1450, 0.012, 4.2),
    (8, 12, "gpt-4o-mini", 3100, 900, 0.005, 1.9),
    (7, 9, "claude-sonnet-4-5", 5600, 2100, 0.070, 5.7),
    (7, 13, "claude-sonnet-4-5", 3900, 1250, 0.046, 3.8),
    (6, 10, "gpt-4o-mini", 2800, 800, 0.004, 1.5),
    (6, 15, "llama-3.3-70b", 4600, 1600, 0.013, 4.8),
    (5, 11, "claude-sonnet-4-5", 4800, 1700, 0.058, 4.7),
    (5, 16, "gpt-4o-mini", 2400, 650, 0.003, 1.3),
    (4, 9, "claude-sonnet-4-5", 5300, 2000, 0.066, 5.4),
    (4, 14, "llama-3.3-70b", 3500, 1100, 0.010, 3.6),
    (3, 10, "claude-sonnet-4-5", 4100, 1400, 0.050, 4.0),
    (3, 15, "gpt-4o-mini", 2900, 850, 0.005, 1.7),
    (2, 11, "claude-sonnet-4-5", 4700, 1650, 0.056, 4.6),
    (2, 16, "llama-3.3-70b", 4300, 1500, 0.012, 4.4),
    (1, 10, "claude-sonnet-4-5", 5000, 1800, 0.061, 5.1),
    (1, 15, "gpt-4o-mini", 2700, 750, 0.004, 1.4),
)

# A few short, realistic prompts cycled across the traces so the run list and
# trace drill-in read like genuine agent runs rather than lorem filler.
_PROMPTS: tuple[str, ...] = (
    "Summarise the incident timeline for the service outage.",
    "Draft a release note for the new Studio observability dashboard.",
    "Classify this message and suggest a first reply.",
    "Extract the action items from the planning meeting transcript.",
)


def _trace_from_row(index: int, now: datetime, row: tuple[int, int, str, int, int, float, float]) -> MonitoringTrace:
    days_ago, hour, model, in_tok, out_tok, cost, latency_s = row
    started = (now - timedelta(days=days_ago)).replace(
        hour=hour, minute=23, second=0, microsecond=0
    )
    ended = started + timedelta(seconds=latency_s)
    trace_id = f"docs-demo-{index:03d}"
    prompt = _PROMPTS[index % len(_PROMPTS)]

    root = MonitoringObservation(
        id=f"{trace_id}-root",
        trace_id=trace_id,
        type="SPAN",
        name="tools_agent",
        level="DEFAULT",
        input={"messages": [{"role": "user", "content": prompt}]},
        start=started,
        end=ended,
    )
    generation = MonitoringObservation(
        id=f"{trace_id}-gen",
        trace_id=trace_id,
        parent_id=root.id,
        type="GENERATION",
        name="chat",
        level="DEFAULT",
        model=model,
        input={"messages": [{"role": "user", "content": prompt}]},
        output={"answer": "…"},
        usage={"input": in_tok, "output": out_tok, "total": in_tok + out_tok, "cost": cost},
        start=started + timedelta(seconds=0.2),
        end=ended - timedelta(seconds=0.1),
    )
    return MonitoringTrace(
        id=trace_id,
        timestamp=started,
        tags=["docs-demo", "tools_agent"],
        total_cost=cost,
        input={"messages": [{"role": "user", "content": prompt}]},
        output={"answer": "…"},
        metadata={"source": "docs-demo"},
        observations=[root, generation],
    )


def build_seed_traces(now: datetime) -> list[MonitoringTrace]:
    """Build the deterministic docs-demo dataset relative to ``now``.

    ``now`` should be timezone-aware (UTC). Returns 24 traces, each with a root
    span and a generation observation carrying model + token + cost usage.
    """
    return [_trace_from_row(i, now, row) for i, row in enumerate(_SEED_ROWS, start=1)]
