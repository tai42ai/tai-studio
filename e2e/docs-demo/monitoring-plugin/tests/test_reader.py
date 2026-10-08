"""Pins the reader aggregation the Studio dashboard depends on.

Seeds the store with a fixed ``now`` and asserts the exact typed metric-row shape
the observability support layer reads: the neutral measures off an ungrouped
summary row, a per-day trend series carrying a ``bucket`` label, and a by-model
breakdown keyed on the ``MODEL`` dimension — plus the declared capability and that
an unserved measure or dimension raises loudly.
"""

from __future__ import annotations

import asyncio
import re
from datetime import UTC, datetime, timedelta

import pytest
from tai42_contract.monitoring import (
    Dimension,
    Measure,
    MetricsQuery,
    MonitoringLevel,
    MonitoringObservation,
    MonitoringReadNotSupportedError,
    MonitoringTrace,
    OrderBy,
    TraceNotFoundError,
)

from docs_demo_monitoring.reader import DemoReader, _sorted_missing_last
from docs_demo_monitoring.seed import build_seed_traces
from docs_demo_monitoring.store import TraceStore

NOW = datetime(2026, 7, 13, 12, 0, 0, tzinfo=UTC)
FROM = NOW - timedelta(days=30)
TO = NOW + timedelta(days=1)
MEASURES = [Measure.COUNT, Measure.COST, Measure.TOKENS, Measure.LATENCY]


def _reader() -> DemoReader:
    store = TraceStore()
    for trace in build_seed_traces(NOW):
        store.insert(trace)
    return DemoReader(store)


def test_capability_declares_served_measures_and_dimensions() -> None:
    cap = _reader().metrics_capability()
    assert cap.measures == {Measure.COUNT, Measure.COST, Measure.TOKENS, Measure.LATENCY}
    assert cap.dimensions == {Dimension.MODEL}


def test_summary_row_shape_and_values() -> None:
    reader = _reader()
    res = asyncio.run(
        reader.query_metrics(MetricsQuery(measures=MEASURES, from_timestamp=FROM, to_timestamp=TO))
    )
    assert len(res.rows) == 1
    row = res.rows[0]
    assert row.dimensions == {}
    assert row.bucket is None
    m = row.measures
    assert set(m) == {Measure.COUNT, Measure.COST, Measure.TOKENS, Measure.LATENCY}
    assert m[Measure.COUNT] == 24
    assert 0.70 < m[Measure.COST] < 0.85
    assert m[Measure.TOKENS] > 100_000
    assert m[Measure.LATENCY] > 2000  # ms — mean per-trace wall-clock span


def test_day_series_buckets() -> None:
    reader = _reader()
    res = asyncio.run(
        reader.query_metrics(
            MetricsQuery(measures=MEASURES, from_timestamp=FROM, to_timestamp=TO, granularity="day")
        )
    )
    # 13 distinct days_ago values in the seed → 13 buckets.
    assert len(res.rows) == 13
    for row in res.rows:
        # The bucket label the observability support layer reads straight off the row.
        assert isinstance(row.bucket, str)
        assert re.match(r"\d{4}-\d{2}-\d{2}", row.bucket)
    # Sorted ascending by bucket date.
    buckets = [r.bucket for r in res.rows]
    assert buckets == sorted(buckets)


def test_by_model_breakdown() -> None:
    reader = _reader()
    res = asyncio.run(
        reader.query_metrics(
            MetricsQuery(
                measures=MEASURES,
                from_timestamp=FROM,
                to_timestamp=TO,
                dimensions=[Dimension.MODEL],
            )
        )
    )
    by_model = {r.dimensions[Dimension.MODEL]: r.measures for r in res.rows}
    assert set(by_model) == {"claude-sonnet-4-5", "gpt-4o-mini", "llama-3.3-70b"}
    assert by_model["claude-sonnet-4-5"][Measure.COUNT] == 12
    assert by_model["gpt-4o-mini"][Measure.COUNT] == 7
    assert by_model["llama-3.3-70b"][Measure.COUNT] == 5
    # claude dominates cost, so it ranks first in the "Cost by model" bars.
    assert by_model["claude-sonnet-4-5"][Measure.COST] > by_model["gpt-4o-mini"][Measure.COST]
    assert by_model["claude-sonnet-4-5"][Measure.COST] > by_model["llama-3.3-70b"][Measure.COST]


def test_unsupported_granularity_raises() -> None:
    # A granularity outside the served set is loud, never silently bucketed wrong.
    # (A measure/dimension outside the capability is unconstructable — the contract's
    # typed ``MetricsQuery`` rejects a non-enum member before the reader is reached —
    # so the reader's served-check guards the case where the contract enums grow.)
    reader = _reader()
    with pytest.raises(MonitoringReadNotSupportedError):
        asyncio.run(
            reader.query_metrics(
                MetricsQuery(measures=MEASURES, from_timestamp=FROM, to_timestamp=TO, granularity="month")
            )
        )


def test_list_and_get_traces() -> None:
    reader = _reader()
    traces = asyncio.run(reader.list_traces(from_timestamp=FROM, to_timestamp=TO))
    assert len(traces) == 24
    # Default newest-first.
    assert traces[0].timestamp >= traces[-1].timestamp
    # Global cost ranking.
    ranked = asyncio.run(
        reader.list_traces(from_timestamp=FROM, to_timestamp=TO, order_by=OrderBy(field="total_cost"))
    )
    costs = [t.total_cost for t in ranked]
    assert costs == sorted(costs, reverse=True)

    one = asyncio.run(reader.get_trace("docs-demo-001"))
    assert one.id == "docs-demo-001"
    with pytest.raises(TraceNotFoundError):
        asyncio.run(reader.get_trace("does-not-exist"))


def test_list_spans_in_window() -> None:
    reader = _reader()
    spans = asyncio.run(reader.list_spans_in_window(FROM, TO))
    # One generation (leaf) span per seeded trace.
    assert len(spans) == 24
    assert spans[0].start >= spans[-1].start  # newest-first default


def _trace(trace_id: str, *, level: str, tokens: int) -> MonitoringTrace:
    start = NOW - timedelta(minutes=5)
    return MonitoringTrace(
        id=trace_id,
        timestamp=start,
        tags=["demo"],
        input={"prompt": "hello"},
        output={"reply": "world"},
        total_cost=0.01,
        observations=[
            MonitoringObservation(
                id=f"{trace_id}-gen",
                trace_id=trace_id,
                type="GENERATION",
                name="gen",
                level=level,
                input={"prompt": "hello"},
                output={"reply": "world"},
                usage={"input": tokens, "output": tokens},
                model="gpt-4o-mini",
                start=start,
                end=start + timedelta(seconds=1),
            )
        ],
    )


def test_list_traces_summary_carries_status_previews_and_tokens() -> None:
    store = TraceStore()
    store.insert(_trace("ok-trace", level=MonitoringLevel.DEFAULT.value, tokens=10))
    reader = DemoReader(store)
    summaries = asyncio.run(reader.list_traces(from_timestamp=FROM, to_timestamp=TO))
    assert len(summaries) == 1
    summary = summaries[0]
    assert summary.status == "ok"
    assert summary.input_preview == {"prompt": "hello"}
    assert summary.output_preview == {"reply": "world"}
    assert summary.total_tokens == 20


def test_list_traces_error_observation_yields_error_status() -> None:
    store = TraceStore()
    store.insert(_trace("err-trace", level=MonitoringLevel.ERROR.value, tokens=5))
    reader = DemoReader(store)
    summaries = asyncio.run(reader.list_traces(from_timestamp=FROM, to_timestamp=TO))
    assert len(summaries) == 1
    assert summaries[0].status == "error"


def test_sorted_missing_last_places_none_last_in_both_directions() -> None:
    # An item with a None sort value (e.g. an open span's end) sorts LAST
    # regardless of direction, per the monitoring OrderBy contract.
    items = [{"v": 3, "id": "a"}, {"v": None, "id": "b"}, {"v": 1, "id": "c"}]
    val = lambda x: x["v"]
    idf = lambda x: x["id"]
    desc = _sorted_missing_last(items, val, idf, reverse=True)
    assert [x["id"] for x in desc] == ["a", "c", "b"]  # 3, 1, then None last
    asc = _sorted_missing_last(items, val, idf, reverse=False)
    assert [x["id"] for x in asc] == ["c", "a", "b"]  # 1, 3, then None last


def test_get_observation_found_and_absent() -> None:
    from datetime import UTC, datetime

    import pytest
    from tai42_contract.monitoring import ObservationNotFoundError, TraceNotFoundError

    from docs_demo_monitoring.reader import DemoReader
    from docs_demo_monitoring.seed import build_seed_traces
    from docs_demo_monitoring.store import TraceStore

    store = TraceStore()
    for trace in build_seed_traces(datetime(2026, 7, 14, tzinfo=UTC)):
        store.insert(trace)
    reader = DemoReader(store)
    obs = asyncio.run(reader.get_observation("docs-demo-001", "docs-demo-001-gen"))
    assert obs.name == "chat"
    with pytest.raises(ObservationNotFoundError):
        asyncio.run(reader.get_observation("docs-demo-001", "nope"))
    with pytest.raises(TraceNotFoundError):
        asyncio.run(reader.get_observation("missing", "docs-demo-001-gen"))


def test_the_seeded_references_resolve_and_one_is_unavailable() -> None:
    from datetime import UTC, datetime

    import pytest
    from tai42_contract.monitoring import PayloadRefUnresolvedError
    from tai42_kit.monitoring import resolve_refs

    from docs_demo_monitoring.reader import DemoReader
    from docs_demo_monitoring.seed import NEWEST_ANSWER, build_seed_traces
    from docs_demo_monitoring.store import TraceStore

    store = TraceStore()
    traces = build_seed_traces(datetime(2026, 7, 14, tzinfo=UTC))
    for trace in traces:
        store.insert(trace)
    newest = max(traces, key=lambda t: t.timestamp)
    reader = DemoReader(store)
    by_name = {o.name: o for o in newest.observations}
    resolved = asyncio.run(resolve_refs(by_name["summarise"].input, reader, trace_id=newest.id))
    assert resolved == {"from_model": NEWEST_ANSWER}
    with pytest.raises(PayloadRefUnresolvedError, match="not yet available or lost"):
        asyncio.run(resolve_refs(by_name["follow_up"].input, reader, trace_id=newest.id))
