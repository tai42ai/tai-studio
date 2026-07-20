"""The docs-demo monitoring reader — real aggregation over the trace store.

Implements the full :class:`~tai_contract.monitoring.MonitoringReader` contract
by aggregating the seeded (and any live-recorded) traces in-process. The Studio
dashboard, run list, and trace drill-in are all served from here, so the pixels
in the screenshots are produced by the same code path a production reader uses —
only the underlying dataset is a demo fixture.

Every clause the contract does not let this reader honor raises
``MonitoringReadNotSupportedError`` rather than being silently dropped.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime
from typing import Any

from tai_contract.monitoring import (
    MetricsFilter,
    MetricsResult,
    MetricsRow,
    MetricsView,
    MonitoringFilter,
    MonitoringObservation,
    MonitoringReadNotSupportedError,
    MonitoringTrace,
    OrderBy,
    SpanKind,
    SpanWindowItem,
    TraceNotFoundError,
)

from docs_demo_monitoring.store import TraceStore

# Measures this reader can compute. A request for anything else is loud, never
# silently zeroed.
_SUPPORTED_METRICS = frozenset({"count", "totalCost", "totalTokens", "latency"})
_SUPPORTED_GRANULARITY = frozenset({"hour", "day", "week"})


def _sorted_missing_last[T](
    items: list[T],
    value_of: Callable[[T], Any],
    id_of: Callable[[T], str],
    *,
    reverse: bool,
) -> list[T]:
    """Sort ``items`` by ``value_of`` with ``reverse`` direction, but items whose
    value is ``None`` always sort LAST regardless of direction.

    This honors the monitoring ``OrderBy`` contract ("an open span — missing
    start/end — sorts LAST") direction-independently, and never compares ``None``
    against ``None`` (which would raise). A stable ``id_of`` tie-break keeps the
    order deterministic within equal values and among the missing items.
    """
    present = [x for x in items if value_of(x) is not None]
    missing = [x for x in items if value_of(x) is None]
    present.sort(key=lambda x: (value_of(x), id_of(x)), reverse=reverse)
    missing.sort(key=id_of)
    return present + missing


def _trace_tokens(trace: MonitoringTrace) -> int:
    """Total input+output tokens across a trace's observations."""
    total = 0
    for obs in trace.observations:
        if isinstance(obs.usage, dict):
            total += int(obs.usage.get("input") or 0) + int(obs.usage.get("output") or 0)
    return total


def _trace_latency_ms(trace: MonitoringTrace) -> float:
    """Wall-clock span of a trace (max observation end − min start), in ms."""
    starts = [o.start for o in trace.observations if o.start]
    ends = [o.end for o in trace.observations if o.end]
    if not starts or not ends:
        return 0.0
    return (max(ends) - min(starts)).total_seconds() * 1000.0


def _trace_latency_s(trace: MonitoringTrace) -> float:
    return _trace_latency_ms(trace) / 1000.0


def _obs_duration_ms(obs: MonitoringObservation) -> float:
    if obs.start is None or obs.end is None:
        return 0.0
    return (obs.end - obs.start).total_seconds() * 1000.0


def _metrics_row(traces: list[MonitoringTrace], *, bucket: str | None = None) -> MetricsRow:
    """One aggregated metrics row over a set of traces.

    Metric keys are the exact names the observability support layer reads on its
    fast path (``count`` / ``totalCost`` / ``totalTokens`` / ``latency``);
    ``latency`` is the mean per-trace wall-clock span in MILLISECONDS.
    """
    count = len(traces)
    total_cost = sum(t.total_cost or 0.0 for t in traces)
    total_tokens = sum(_trace_tokens(t) for t in traces)
    mean_latency_ms = (sum(_trace_latency_ms(t) for t in traces) / count) if count else 0.0
    dimensions: dict[str, object] = {"date": bucket} if bucket is not None else {}
    return MetricsRow(
        dimensions=dimensions,
        metrics={
            "count": count,
            "totalCost": round(total_cost, 6),
            "totalTokens": total_tokens,
            "latency": round(mean_latency_ms, 3),
        },
    )


def _bucket_key(ts: datetime, granularity: str) -> str:
    if granularity == "hour":
        return ts.strftime("%Y-%m-%dT%H:00")
    if granularity == "week":
        monday = ts - _days(ts.weekday())
        return monday.strftime("%Y-%m-%d")
    return ts.strftime("%Y-%m-%d")


def _days(n: int):
    from datetime import timedelta

    return timedelta(days=n)


class DemoReader:
    """Read half of the docs-demo backend: real aggregation over ``TraceStore``."""

    def __init__(self, store: TraceStore) -> None:
        self._store = store

    # --- metrics -----------------------------------------------------------

    async def query_metrics(self, filter: MetricsFilter) -> MetricsResult:
        unknown = [m for m in filter.metrics if m not in _SUPPORTED_METRICS]
        if unknown:
            raise MonitoringReadNotSupportedError(f"unsupported metrics: {unknown}")
        # Honor every clause loudly: a metrics-level filters or order_by the reader
        # cannot apply raises rather than being silently dropped.
        if filter.filters:
            raise MonitoringReadNotSupportedError(f"metrics filters are not supported: {filter.filters}")
        if filter.order_by is not None:
            raise MonitoringReadNotSupportedError(f"metrics order_by is not supported: {filter.order_by}")

        traces = self._traces_in_window(filter.from_timestamp, filter.to_timestamp)

        if filter.view == MetricsView.TRACES:
            if filter.dimensions:
                raise MonitoringReadNotSupportedError(
                    f"unsupported trace dimensions: {filter.dimensions}"
                )
            if filter.granularity is None:
                if not traces:
                    return MetricsResult(rows=[])
                return MetricsResult(rows=[_metrics_row(traces)])
            if filter.granularity not in _SUPPORTED_GRANULARITY:
                raise MonitoringReadNotSupportedError(f"unsupported granularity: {filter.granularity}")
            buckets: dict[str, list[MonitoringTrace]] = {}
            for trace in traces:
                assert trace.timestamp is not None  # window filter guarantees it
                buckets.setdefault(_bucket_key(trace.timestamp, filter.granularity), []).append(trace)
            rows = [_metrics_row(group, bucket=key) for key, group in sorted(buckets.items())]
            return MetricsResult(rows=rows)

        if filter.view == MetricsView.OBSERVATIONS:
            if filter.dimensions != ["providedModelName"]:
                raise MonitoringReadNotSupportedError(
                    f"unsupported observation dimensions: {filter.dimensions}"
                )
            return self._by_model(traces)

        raise MonitoringReadNotSupportedError(f"unsupported view: {filter.view}")

    def _by_model(self, traces: list[MonitoringTrace]) -> MetricsResult:
        groups: dict[str, list[MonitoringObservation]] = {}
        for trace in traces:
            for obs in trace.observations:
                if obs.model:
                    groups.setdefault(obs.model, []).append(obs)
        rows: list[MetricsRow] = []
        for model, observations in groups.items():
            cost = sum(float(o.usage.get("cost") or 0.0) for o in observations if isinstance(o.usage, dict))
            tokens = sum(
                int(o.usage.get("input") or 0) + int(o.usage.get("output") or 0)
                for o in observations
                if isinstance(o.usage, dict)
            )
            durations = [_obs_duration_ms(o) for o in observations]
            mean_latency = (sum(durations) / len(durations)) if durations else 0.0
            rows.append(
                MetricsRow(
                    dimensions={"providedModelName": model},
                    metrics={
                        "count": len(observations),
                        "totalCost": round(cost, 6),
                        "totalTokens": tokens,
                        "latency": round(mean_latency, 3),
                    },
                )
            )
        return MetricsResult(rows=rows)

    # --- run list / trace detail ------------------------------------------

    async def list_traces(
        self,
        *,
        from_timestamp: datetime | None = None,
        to_timestamp: datetime | None = None,
        limit: int | None = None,
        page: int | None = None,
        filter: MonitoringFilter | None = None,
        order_by: OrderBy | None = None,
    ) -> list[MonitoringTrace]:
        traces = [
            t
            for t in self._store.all_traces()
            if _in_window(t.timestamp, from_timestamp, to_timestamp)
        ]
        if filter is not None:
            traces = [t for t in traces if self._trace_matches(t, filter)]
        traces = self._sort_traces(traces, order_by)
        if limit is not None:
            start = ((page or 1) - 1) * limit
            traces = traces[start : start + limit]
        return traces

    async def get_trace(self, trace_id: str) -> MonitoringTrace:
        trace = self._store.get(trace_id)
        if trace is None:
            raise TraceNotFoundError(f"trace {trace_id!r} not found")
        return trace

    async def list_spans_in_window(
        self,
        t0: datetime,
        t1: datetime,
        *,
        run: str | None = None,
        kind: SpanKind | None = None,
        filter: MonitoringFilter | None = None,
        order_by: OrderBy | None = None,
    ) -> list[SpanWindowItem]:
        # The tool/node-granularity unit for this backend is the generation
        # observation (the leaf work), one item per execution.
        if kind is not None and kind != SpanKind.LLM:
            # This backend's leaf spans are all model generations (LLM); no other
            # kind exists, so a narrower kind selects nothing rather than lying.
            return []
        items: list[SpanWindowItem] = []
        for trace in self._store.all_traces():
            if run is not None and trace.id != run:
                continue
            if filter is not None and not self._trace_matches(trace, filter):
                continue
            for obs in trace.observations:
                if obs.type != "GENERATION" or obs.start is None:
                    continue
                if not (t0 <= obs.start < t1):
                    continue
                items.append(
                    SpanWindowItem(
                        id=obs.id,
                        parent_id=obs.parent_id,
                        name=obs.name,
                        tags=list(trace.tags or []),
                        input=obs.input,
                        output=obs.output,
                        metadata=obs.metadata,
                        start=obs.start,
                        end=obs.end,
                    )
                )
        return self._sort_spans(items, order_by)

    # --- helpers -----------------------------------------------------------

    def _traces_in_window(self, t0: datetime, t1: datetime) -> list[MonitoringTrace]:
        return [t for t in self._store.all_traces() if _in_window(t.timestamp, t0, t1)]

    def _trace_matches(self, trace: MonitoringTrace, f: MonitoringFilter) -> bool:
        if f.name is not None or f.user_id is not None or f.session_id is not None or f.metadata:
            raise MonitoringReadNotSupportedError(
                "name/user_id/session_id/metadata filters are not supported by the docs-demo reader"
            )
        if f.tags and not set(f.tags).issubset(set(trace.tags or [])):
            return False
        if f.level is not None and not any(
            (o.level or "").upper() == f.level.value for o in trace.observations
        ):
            return False
        if f.model is not None and not any(o.model == f.model for o in trace.observations):
            return False
        cost = trace.total_cost or 0.0
        if f.min_cost is not None and cost < f.min_cost:
            return False
        if f.max_cost is not None and cost > f.max_cost:
            return False
        tokens = _trace_tokens(trace)
        if f.min_tokens is not None and tokens < f.min_tokens:
            return False
        if f.max_tokens is not None and tokens > f.max_tokens:
            return False
        latency_s = _trace_latency_s(trace)
        if f.min_latency is not None and latency_s < f.min_latency:
            return False
        if f.max_latency is not None and latency_s > f.max_latency:
            return False
        return True

    def _sort_traces(self, traces: list[MonitoringTrace], order_by: OrderBy | None) -> list[MonitoringTrace]:
        # A missing total_cost sorts as 0.0 (present), not last — the run list
        # always has a cost; the other keys never yield None for real traces.
        getters: dict[str, Callable[[MonitoringTrace], Any]] = {
            "timestamp": lambda t: t.timestamp,
            "total_cost": lambda t: t.total_cost if t.total_cost is not None else 0.0,
            "latency": _trace_latency_ms,
            "total_tokens": _trace_tokens,
            "id": lambda t: t.id,
        }
        field = order_by.field if order_by is not None else "timestamp"
        reverse = order_by.direction == "desc" if order_by is not None else True
        getter = getters.get(field)
        if getter is None:
            raise MonitoringReadNotSupportedError(f"unsupported order_by field: {order_by.field}")
        return _sorted_missing_last(traces, getter, lambda t: t.id, reverse=reverse)

    def _sort_spans(self, items: list[SpanWindowItem], order_by: OrderBy | None) -> list[SpanWindowItem]:
        getters: dict[str, Callable[[SpanWindowItem], Any]] = {
            "start": lambda s: s.start,
            "end": lambda s: s.end,
            "duration": lambda s: (s.end - s.start).total_seconds() if s.start and s.end else None,
            "name": lambda s: s.name,
            "id": lambda s: s.id,
        }
        field = order_by.field if order_by is not None else "start"
        reverse = order_by.direction == "desc" if order_by is not None else True
        getter = getters.get(field)
        if getter is None:
            raise MonitoringReadNotSupportedError(f"unsupported order_by field: {order_by.field}")
        return _sorted_missing_last(items, getter, lambda s: s.id, reverse=reverse)


def _in_window(ts: datetime | None, t0: datetime | None, t1: datetime | None) -> bool:
    if ts is None:
        return False
    if t0 is not None and ts < t0:
        return False
    if t1 is not None and ts >= t1:
        return False
    return True
