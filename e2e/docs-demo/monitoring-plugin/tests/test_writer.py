"""Pins the writer's contract-critical behavior: real recording, the single
sanctioned precondition raise, and disable() suppression.

The screenshots render from the seeded reader, not the live-write path, but the
writer is shipped code that advertises fail-safe contract conformance — these
tests keep that promise honest.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from tai42_contract.monitoring import MonitoringExportHealth, RecordId, SpanKind, TokenUsage, TraceContext
from tai42_contract.secrets import SecretValue
from tai42_kit.monitoring import payload_ref

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
        span.update(output={"ok": True}, model="claude-sonnet-4-5", usage=TokenUsage(input_tokens=10, output_tokens=3))
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
        usage=TokenUsage(input_tokens=5, output_tokens=2, cost_usd=0.001),
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


def test_lifecycle_calls_the_health_listener_with_zero_health() -> None:
    writer, _ = _writer()
    seen: list[MonitoringExportHealth] = []
    writer.set_health_listener(seen.append)
    writer.flush()
    writer.shutdown()
    assert seen == [MonitoringExportHealth(), MonitoringExportHealth()]
    assert writer.export_health() == MonitoringExportHealth()
    assert writer.is_recording() is True


def test_open_span_activates_until_end() -> None:
    writer, store = _writer()
    span = writer.open_span(name="n", kind=SpanKind.CHAIN, trace_context=TraceContext(trace_id="o"), activate=True)
    assert writer.current_span_id() == span.id
    assert writer.current_trace_id() == "o"
    writer.update_current_span(input_={"in": 1}, metadata={"a": 1})
    writer.update_current_span(metadata={"b": 2})
    span.end()
    assert writer.current_span_id() is None
    (obs,) = store.get("o").observations
    assert obs.input == {"in": 1}
    assert obs.metadata == {"a": 1, "b": 2}
    assert obs.end is not None


def test_a_secret_is_stored_as_the_placeholder() -> None:
    writer, store = _writer()
    with writer.start_span(
        name="n", kind=SpanKind.TOOL, trace_context=TraceContext(trace_id="s"), input_={"k": SecretValue("hush")}
    ) as span:
        span.update(output=[SecretValue("hush")])
    (obs,) = store.get("s").observations
    assert obs.input == {"k": "[secret]"}
    assert obs.output == ["[secret]"]


def test_a_reference_is_stored_as_its_one_key_object() -> None:
    writer, store = _writer()
    writer.open_span(
        name="n", kind=SpanKind.CHAIN, trace_context=TraceContext(trace_id="r"), input_={"x": payload_ref("a", "output")}
    ).end()
    (obs,) = store.get("r").observations
    assert obs.input == {"x": {"$tai42_ref": {"span_id": "a", "field": "output", "pointer": ""}}}


def test_create_event_returns_its_record_id() -> None:
    writer, store = _writer()
    rid = writer.create_event(name="ev", trace_context=TraceContext(trace_id="e"), output={"o": 1})
    (obs,) = store.get("e").observations
    assert rid == RecordId(trace_id="e", span_id=obs.id)
    assert obs.output == {"o": 1}
    with writer.disable():
        assert writer.create_event(name="ev", trace_context=TraceContext(trace_id="e")) is None


def test_trace_attributes_accepts_platform_run_attribution_call_shape() -> None:
    # The platform's attribute_run(writer, RunAttribution) calls trace_attributes with
    # user_id/session_id (contract Protocol since 2026-08-31). A writer missing those
    # kwargs raises TypeError at argument binding and breaks EVERY attributed tool
    # dispatch through the /api/run-tool door. Born-red on the pre-fix DemoWriter
    # signature; green once it accepts (and records) the identity dimensions.
    from tai42_contract.monitoring import RunAttribution
    from tai42_contract.monitoring.writer import attribute_run

    writer, store = _writer()
    with writer.start_span(name="root", kind=SpanKind.TOOL, trace_context=TraceContext(trace_id="a")):
        with attribute_run(writer, RunAttribution(tags=["t"], user_id="u-1", session_id="s-1")):
            pass
    trace = store.get("a")
    assert (trace.metadata or {}).get("user_id") == "u-1"
    assert (trace.metadata or {}).get("session_id") == "s-1"
