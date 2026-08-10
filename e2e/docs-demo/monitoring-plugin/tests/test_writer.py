"""Pins the writer's contract-critical behavior: real recording, the single
sanctioned precondition raise, and disable() suppression.

The screenshots render from the seeded reader, not the live-write path, but the
writer is shipped code that advertises fail-safe contract conformance — these
tests keep that promise honest.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from tai42_contract.monitoring import SpanKind, TraceContext

from docs_demo_monitoring.store import TraceStore
from docs_demo_monitoring.writer import DemoWriter

T0 = datetime(2026, 7, 13, 12, 0, 0, tzinfo=UTC)
T1 = datetime(2026, 7, 13, 12, 0, 5, tzinfo=UTC)


def _writer() -> tuple[DemoWriter, TraceStore]:
    store = TraceStore()
    return DemoWriter(store), store


def test_start_span_records_into_store_and_amends_via_handle() -> None:
    writer, store = _writer()
    ctx = TraceContext(trace_id="trace-a", tags=["demo"])
    assert writer.current_trace_id() is None
    with writer.start_span(name="root", kind=SpanKind.TOOL, trace_context=ctx) as span:
        assert writer.current_trace_id() == "trace-a"
        span.update(output={"ok": True}, model="claude-sonnet-4-5", usage_details={"input": 10, "output": 3})
    # Outside the block the ambient stack is popped.
    assert writer.current_trace_id() is None
    trace = store.get("trace-a")
    assert trace is not None
    assert len(trace.observations) == 1
    obs = trace.observations[0]
    assert obs.name == "root"
    assert obs.model == "claude-sonnet-4-5"
    assert obs.usage == {"input": 10, "output": 3}
    assert obs.start is not None and obs.end is not None  # end set on block exit


def test_start_span_body_exception_propagates_and_stack_is_balanced() -> None:
    writer, store = _writer()
    ctx = TraceContext(trace_id="trace-b")
    with pytest.raises(RuntimeError, match="boom"):
        with writer.start_span(name="root", kind=SpanKind.TOOL, trace_context=ctx):
            raise RuntimeError("boom")
    # The app's exception propagated (not swallowed) AND the contextvar stack was
    # reset — the span is still recorded with an end time.
    assert writer.current_trace_id() is None
    assert len(store.get("trace-b").observations) == 1


def test_record_span_requires_trace_id() -> None:
    writer, _ = _writer()
    with pytest.raises(ValueError, match="trace_id"):
        writer.record_span(
            name="gen", kind=SpanKind.LLM, start=T0, end=T1, trace_context=TraceContext()
        )


def test_record_span_persists_with_explicit_times() -> None:
    writer, store = _writer()
    writer.record_span(
        name="gen",
        kind=SpanKind.LLM,
        start=T0,
        end=T1,
        trace_context=TraceContext(trace_id="trace-c"),
        model="gpt-4o-mini",
        usage_details={"input": 5, "output": 2, "cost": 0.001},
    )
    obs = store.get("trace-c").observations
    assert len(obs) == 1
    assert obs[0].model == "gpt-4o-mini" and obs[0].start == T0 and obs[0].end == T1


def test_disable_suppresses_emission_that_creates_traces() -> None:
    # The emit methods that MINT a trace/observation record nothing while disabled.
    writer, store = _writer()
    with writer.disable():
        with writer.start_span(name="root", kind=SpanKind.TOOL, trace_context=TraceContext(trace_id="x")):
            pass
        writer.record_span(
            name="gen", kind=SpanKind.LLM, start=T0, end=T1, trace_context=TraceContext(trace_id="x")
        )
        writer.create_event(name="ev", trace_context=TraceContext(trace_id="x"))
    # Nothing was recorded while disabled.
    assert store.get("x") is None


def test_disable_suppresses_mutation_of_a_live_trace() -> None:
    # With a LIVE span on the stack, the mutating emits (update_current_span and
    # trace_attributes) inside disable() must NOT touch the observation or trace —
    # this genuinely pins the disable() guard on BOTH (each would mutate if its
    # guard were removed, since the ambient span/trace is present).
    writer, store = _writer()
    with writer.start_span(
        name="root", kind=SpanKind.TOOL, trace_context=TraceContext(trace_id="y", tags=["orig"])
    ):
        obs = store.get("y").observations[0]
        with writer.disable():
            writer.update_current_span(metadata={"suppressed": True}, output="nope")
            with writer.trace_attributes(tags=["suppressed"], name="suppressed-name"):
                pass
        # The open span was not mutated, and the trace's tags/metadata are intact.
        assert obs.metadata is None and obs.output is None
    trace = store.get("y")
    assert trace.tags == ["orig"]
    assert not (trace.metadata or {}).get("name")


def test_emit_is_fail_safe_when_the_store_raises() -> None:
    # The FAIL-SAFE invariant: an internal backend error must never propagate
    # into the calling flow. A store that raises inside add_observation must not
    # break start_span / record_span / create_event.
    class FailingStore(TraceStore):
        def add_observation(self, trace_id: str, observation: object) -> None:  # type: ignore[override]
            raise RuntimeError("store is down")

    writer = DemoWriter(FailingStore())
    ctx = TraceContext(trace_id="z")
    with writer.start_span(name="root", kind=SpanKind.TOOL, trace_context=ctx):
        pass  # must not raise despite the failing store
    writer.record_span(name="gen", kind=SpanKind.LLM, start=T0, end=T1, trace_context=ctx)
    writer.create_event(name="ev", trace_context=ctx)
    # Reaching here without an exception is the assertion.


def test_lifecycle_and_propagation_shims_are_inert_not_broken() -> None:
    writer, _ = _writer()
    # Non-langchain backend: no callbacks, empty propagation blob, no crash.
    assert writer.get_monitoring_callbacks(TraceContext()) == []
    assert writer.inject_context(TraceContext()) == {}
    writer.flush()
    writer.shutdown()
    with writer.scope("some-key"):
        pass
