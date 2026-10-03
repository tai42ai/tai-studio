"""The docs-demo monitoring reader — real aggregation over the trace store.

Implements the full :class:`~tai42_contract.monitoring.MonitoringReader` contract
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
from typing import Any, Literal

from tai42_contract.monitoring import (
    Dimension,
    Measure,
    MetricsCapability,
    MetricsQuery,
    MetricsResult,
    MetricsRow,
    MonitoringFilter,
    MonitoringLevel,
    MonitoringObservation,
    MonitoringReadNotSupportedError,
    MonitoringTrace,
    MonitoringTraceSummary,
    OrderBy,
    SpanKind,
    SpanWindowItem,
    TraceNotFoundError,
    preview,
)

from docs_demo_monitoring.store import TraceStore

# The neutral measures this reader can aggregate and the dimensions it can group
# by. A query for anything outside these raises loudly, never silently zeroed.
_SUPPORTED_MEASURES = frozenset({Measure.COUNT, Measure.COST, Measure.TOKENS, Measure.LATENCY})
_SUPPORTED_DIMENSIONS = frozenset({Dimension.MODEL})
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
    """Wall-clock span of a trace (max observation end - min start), in ms."""
    starts = [o.start for o in trace.observations if o.start]
    ends = [o.end for o in trace.observations if o.end]
    if not starts or not ends:
        return 0.0
    return (max(ends) - min(starts)).total_seconds() * 1000.0


def _trace_latency_s(trace: MonitoringTrace) -> float:
    return _trace_latency_ms(trace) / 1000.0


def _trace_status(trace: MonitoringTrace) -> Literal["ok", "error"]:
    """``error`` when any observation carries an ERROR level, ``ok`` otherwise."""
    if any((o.level or "").upper() == MonitoringLevel.ERROR.value for o in trace.observations):
        return "error"
    return "ok"


def _to_summary(trace: MonitoringTrace) -> MonitoringTraceSummary:
    """A run-list row for ``trace``: list-surface attributes plus batched
    aggregates and bounded input/output previews — never a per-trace body (the
    full input/output are read through ``get_trace``). ``total_tokens`` /
    ``latency_ms`` are ``None`` when the trace carries no usage / no timing —
    never coerced to ``0``."""
    has_usage = any(isinstance(o.usage, dict) for o in trace.observations)
    has_timing = any(o.start for o in trace.observations) and any(o.end for o in trace.observations)
    return MonitoringTraceSummary(
        id=trace.id,
        timestamp=trace.timestamp,
        tags=list(trace.tags or []),
        input_preview=preview(trace.input),
        output_preview=preview(trace.output),
        latency_ms=_trace_latency_ms(trace) if has_timing else None,
        total_cost=trace.total_cost,
        total_tokens=_trace_tokens(trace) if has_usage else None,
        status=_trace_status(trace),
    )


def _obs_duration_ms(obs: MonitoringObservation) -> float:
    if obs.start is None or obs.end is None:
        return 0.0
    return (obs.end - obs.start).total_seconds() * 1000.0


def _trace_measures(traces: list[MonitoringTrace], measures: list[Measure]) -> dict[Measure, float | None]:
    """The requested neutral measures aggregated over a set of whole traces (runs).

    ``COUNT`` is the number of runs, ``COST`` / ``TOKENS`` their summed totals, and
    ``LATENCY`` the mean per-trace wall-clock span in MILLISECONDS.
    """
    count = len(traces)
    out: dict[Measure, float | None] = {}
    for measure in measures:
        if measure is Measure.COUNT:
            out[measure] = float(count)
        elif measure is Measure.COST:
            out[measure] = round(sum(t.total_cost or 0.0 for t in traces), 6)
        elif measure is Measure.TOKENS:
            out[measure] = float(sum(_trace_tokens(t) for t in traces))
        elif measure is Measure.LATENCY:
            out[measure] = round(sum(_trace_latency_ms(t) for t in traces) / count, 3) if count else 0.0
    return out


def _obs_measures(
    observations: list[MonitoringObservation], measures: list[Measure]
) -> dict[Measure, float | None]:
    """The requested neutral measures aggregated over a set of generation observations.

    ``COUNT`` is the number of per-model calls, ``COST`` / ``TOKENS`` their summed
    usage totals, and ``LATENCY`` the mean per-observation duration in MILLISECONDS.
    """
    out: dict[Measure, float | None] = {}
    for measure in measures:
        if measure is Measure.COUNT:
            out[measure] = float(len(observations))
        elif measure is Measure.COST:
            out[measure] = round(
                sum(float(o.usage.get("cost") or 0.0) for o in observations if isinstance(o.usage, dict)), 6
            )
        elif measure is Measure.TOKENS:
            out[measure] = float(
                sum(
                    int(o.usage.get("input") or 0) + int(o.usage.get("output") or 0)
                    for o in observations
                    if isinstance(o.usage, dict)
                )
            )
        elif measure is Measure.LATENCY:
            durations = [_obs_duration_ms(o) for o in observations]
            out[measure] = round(sum(durations) / len(durations), 3) if durations else 0.0
    return out


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

    def metrics_capability(self) -> MetricsCapability:
        """Declare the neutral measures and dimensions this backend aggregates / groups by.

        The dashboard reads this before any query so a panel the backend cannot serve
        is reported declared-absent, not swallowed; ``query_metrics`` raises for anything
        outside this set.
        """
        return MetricsCapability(
            measures=frozenset(_SUPPORTED_MEASURES),
            dimensions=frozenset(_SUPPORTED_DIMENSIONS),
        )

    async def query_metrics(self, query: MetricsQuery) -> MetricsResult:
        """Aggregate the requested measures over the query window.

        A measure or dimension outside :meth:`metrics_capability`, or an unsupported
        granularity, raises ``MonitoringReadNotSupportedError`` rather than returning a
        silent zero. The model dimension aggregates over generation observations; an
        ungrouped query aggregates over whole traces (runs).
        """
        self._check_served(query)
        traces = self._traces_in_window(query.from_timestamp, query.to_timestamp)
        if Dimension.MODEL in query.dimensions:
            return self._by_model(traces, query)
        return self._by_time(traces, query)

    @staticmethod
    def _check_served(query: MetricsQuery) -> None:
        unknown_measures = [m for m in query.measures if m not in _SUPPORTED_MEASURES]
        unknown_dimensions = [d for d in query.dimensions if d not in _SUPPORTED_DIMENSIONS]
        if unknown_measures or unknown_dimensions:
            raise MonitoringReadNotSupportedError(
                "docs-demo metrics query cannot serve "
                f"measures={[m.value for m in unknown_measures]} "
                f"dimensions={[d.value for d in unknown_dimensions]}"
            )
        if query.granularity is not None and query.granularity not in _SUPPORTED_GRANULARITY:
            raise MonitoringReadNotSupportedError(f"unsupported granularity: {query.granularity}")

    def _by_time(self, traces: list[MonitoringTrace], query: MetricsQuery) -> MetricsResult:
        """Trace-level aggregation: one ungrouped row, or one row per time bucket."""
        if query.granularity is None:
            if not traces:
                return MetricsResult(rows=[])
            return MetricsResult(rows=[MetricsRow(measures=_trace_measures(traces, query.measures))])
        buckets: dict[str, list[MonitoringTrace]] = {}
        for trace in traces:
            assert trace.timestamp is not None  # the window filter guarantees it
            buckets.setdefault(_bucket_key(trace.timestamp, query.granularity), []).append(trace)
        rows = [
            MetricsRow(measures=_trace_measures(group, query.measures), bucket=key)
            for key, group in sorted(buckets.items())
        ]
        return MetricsResult(rows=rows)

    def _by_model(self, traces: list[MonitoringTrace], query: MetricsQuery) -> MetricsResult:
        """Observation-level aggregation grouped by model, optionally time-bucketed.

        Without a granularity each model is one row; with one the rows are per
        (bucket, model), the bucket taken from each generation's start — an untimed
        observation cannot be placed in a time bucket and is left out of the bucketed
        grouping, matching the window's exclusion of untimed records.
        """
        if query.granularity is None:
            groups: dict[str, list[MonitoringObservation]] = {}
            for trace in traces:
                for obs in trace.observations:
                    if obs.model:
                        groups.setdefault(obs.model, []).append(obs)
            rows = [
                MetricsRow(
                    dimensions={Dimension.MODEL: model},
                    measures=_obs_measures(observations, query.measures),
                )
                for model, observations in groups.items()
            ]
            return MetricsResult(rows=rows)
        bucketed: dict[tuple[str, str], list[MonitoringObservation]] = {}
        for trace in traces:
            for obs in trace.observations:
                if obs.model and obs.start is not None:
                    bucketed.setdefault((_bucket_key(obs.start, query.granularity), obs.model), []).append(obs)
        rows = [
            MetricsRow(
                dimensions={Dimension.MODEL: model},
                measures=_obs_measures(observations, query.measures),
                bucket=bucket,
            )
            for (bucket, model), observations in sorted(bucketed.items())
        ]
        return MetricsResult(rows=rows)

    # --- run list / trace detail ------------------------------------------

    async def list_traces(
        self,
        *,
        from_timestamp: datetime | None = None,
        to_timestamp: datetime | None = None,
        limit: int | None = None,
        page: int | None = None,
        filter_: MonitoringFilter | None = None,
        order_by: OrderBy | None = None,
    ) -> list[MonitoringTraceSummary]:
        traces = [
            t
            for t in self._store.all_traces()
            if _in_window(t.timestamp, from_timestamp, to_timestamp)
        ]
        if filter_ is not None:
            traces = [t for t in traces if self._trace_matches(t, filter_)]
        traces = self._sort_traces(traces, order_by)
        if limit is not None:
            start = ((page or 1) - 1) * limit
            traces = traces[start : start + limit]
        return [_to_summary(t) for t in traces]

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
        filter_: MonitoringFilter | None = None,
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
            if filter_ is not None and not self._trace_matches(trace, filter_):
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
        return not (f.max_latency is not None and latency_s > f.max_latency)

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
            raise MonitoringReadNotSupportedError(f"unsupported order_by field: {field}")
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
            raise MonitoringReadNotSupportedError(f"unsupported order_by field: {field}")
        return _sorted_missing_last(items, getter, lambda s: s.id, reverse=reverse)


def _in_window(ts: datetime | None, t0: datetime | None, t1: datetime | None) -> bool:
    if ts is None:
        return False
    if t0 is not None and ts < t0:
        return False
    return not (t1 is not None and ts >= t1)
