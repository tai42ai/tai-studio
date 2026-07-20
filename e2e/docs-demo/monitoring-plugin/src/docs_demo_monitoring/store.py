"""In-memory trace store shared by the docs-demo monitoring writer and reader.

Holds complete :class:`~tai42_contract.monitoring.MonitoringTrace` objects keyed by
trace id. The writer mutates it (real recording of live spans); the reader
aggregates over it. There is no external service — the whole point of the
docs-demo backend is a self-contained, deterministic observability dataset.
"""

from __future__ import annotations

from datetime import datetime

from tai42_contract.monitoring import MonitoringObservation, MonitoringTrace


class TraceStore:
    """A process-local map of ``trace_id -> MonitoringTrace``.

    Insertion order is preserved (Python dict), which the reader relies on only
    as a stable tie-break; every query sorts explicitly.
    """

    def __init__(self) -> None:
        self._traces: dict[str, MonitoringTrace] = {}

    def insert(self, trace: MonitoringTrace) -> None:
        """Store a fully-built trace, replacing any prior trace with the same id."""
        self._traces[trace.id] = trace

    def get(self, trace_id: str) -> MonitoringTrace | None:
        """The trace with this id, or ``None`` if absent."""
        return self._traces.get(trace_id)

    def all_traces(self) -> list[MonitoringTrace]:
        """Every stored trace, as a fresh list."""
        return list(self._traces.values())

    def ensure_trace(
        self,
        trace_id: str,
        *,
        timestamp: datetime,
        tags: list[str] | None = None,
        metadata: dict[str, object] | None = None,
    ) -> MonitoringTrace:
        """Return the trace for ``trace_id``, creating an empty one if absent.

        Used by the writer when a live span opens under a trace id that has not
        been recorded yet.
        """
        trace = self._traces.get(trace_id)
        if trace is None:
            trace = MonitoringTrace(
                id=trace_id,
                timestamp=timestamp,
                tags=list(tags or []),
                metadata=dict(metadata) if metadata else None,
            )
            self._traces[trace_id] = trace
        return trace

    def add_observation(self, trace_id: str, observation: MonitoringObservation) -> None:
        """Append an observation to an existing trace.

        The trace MUST already exist (the writer calls :meth:`ensure_trace`
        first); a missing trace is a caller bug and raises ``KeyError``.
        """
        self._traces[trace_id].observations.append(observation)
