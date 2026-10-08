"""The docs-demo monitoring writer — a real, fail-safe recorder.

Emit methods record live spans/events into the shared ``TraceStore`` (so a tool
run during a capture session lands in the same dashboard as the seed), while
honoring the contract's FAIL-SAFE invariant: an emit never raises into
application code — it catches and logs. The only precondition that raises is
``record_span`` with no ``trace_id`` (a caller bug, per the contract).

Every recorded input, output and metadata value goes through the kit encoder, so a
``SecretValue`` is stored as ``"[secret]"`` and a ``payload_ref`` as its one-key
reference object — exactly the form a production writer records. An in-memory store
has nothing to deliver, so its export health is always zero.
"""

from __future__ import annotations

import contextlib
import logging
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar, Token
from datetime import UTC, datetime
from typing import Any

import orjson
from tai42_contract.monitoring import (
    DEFAULT_LEVEL,
    MonitoringExportHealth,
    MonitoringLevel,
    MonitoringObservation,
    RecordId,
    Span,
    SpanKind,
    TokenUsage,
    TraceContext,
)
from tai42_kit.monitoring import encode_payload

from docs_demo_monitoring.store import TraceStore

logger = logging.getLogger(__name__)

# Ambient stack of the activated spans of the current async context, and a
# suppression flag toggled by ``disable()``. An ended span stays listed when it
# was ended from another context, but never counts as current.
_SPAN_STACK: ContextVar[tuple[DemoSpan, ...]] = ContextVar("docs_demo_span_stack", default=())
_DISABLED: ContextVar[bool] = ContextVar("docs_demo_disabled", default=False)

_KIND_TO_TYPE = {
    SpanKind.LLM: "GENERATION",
    SpanKind.TOOL: "SPAN",
    SpanKind.CHAIN: "SPAN",
    SpanKind.EVENT: "EVENT",
}


def _now() -> datetime:
    return datetime.now(UTC)


def _recorded(value: Any) -> Any:
    """``value`` in the form a production writer records it (``None`` stays ``None``)."""
    if value is None:
        return None
    try:
        return orjson.loads(encode_payload(value))
    except Exception:
        logger.exception("docs-demo writer could not encode a %s value", type(value).__qualname__)
        return {"$tai42_unencodable": type(value).__qualname__}


def _store_usage(usage: TokenUsage) -> dict[str, Any]:
    """``usage`` in the store's usage vocabulary (the keys the reader aggregates)."""
    pairs = (
        ("input", usage.input_tokens),
        ("output", usage.output_tokens),
        ("total", usage.total_tokens),
        ("cost", usage.cost_usd),
    )
    return {key: value for key, value in pairs if value is not None}


def _current() -> DemoSpan | None:
    for span in reversed(_SPAN_STACK.get()):
        if not span.ended:
            return span
    return None


class _InertSpan:
    """Returned when emission is disabled or setup failed — records nothing."""

    @property
    def id(self) -> str:
        return ""

    def update(self, **_: Any) -> None:
        pass

    def set_trace_metadata(self, **_: Any) -> None:
        pass

    def end(self, *, end_time: datetime | None = None) -> None:
        pass


class DemoSpan:
    """A handle to a recorded observation. Every method is fail-safe."""

    def __init__(self, store: TraceStore, trace_id: str, observation: MonitoringObservation) -> None:
        self._store = store
        self.trace_id = trace_id
        self._obs = observation
        self.ended = False
        self._token: Token[tuple[DemoSpan, ...]] | None = None

    @property
    def id(self) -> str:
        return self._obs.id

    @property
    def observation(self) -> MonitoringObservation:
        return self._obs

    def activate(self) -> None:
        self._token = _SPAN_STACK.set((*_SPAN_STACK.get(), self))

    def update(
        self,
        *,
        output: Any = None,
        model: str | None = None,
        usage: TokenUsage | None = None,
        metadata: dict[str, Any] | None = None,
        level: MonitoringLevel | None = None,
        status_message: str | None = None,
    ) -> None:
        try:
            if output is not None:
                self._obs.output = _recorded(output)
            if model is not None:
                self._obs.model = model
            if usage is not None:
                self._obs.usage = _store_usage(usage)
            if metadata:
                self._obs.metadata = {**(self._obs.metadata or {}), **_recorded(metadata)}
            if level is not None:
                self._obs.level = level.value
            if status_message is not None:
                self._obs.status_message = status_message
        except Exception:  # fail-safe: a monitoring outage must not break a flow
            logger.exception("DemoSpan.update failed")

    def set_trace_metadata(self, *, name: str | None = None, tags: list[str] | None = None) -> None:
        try:
            trace = self._store.get(self.trace_id)
            if trace is None:
                return
            if tags is not None:
                trace.tags = list(tags)
            if name is not None:
                trace.metadata = {**(trace.metadata or {}), "name": name}
        except Exception:  # fail-safe
            logger.exception("DemoSpan.set_trace_metadata failed")

    def end(self, *, end_time: datetime | None = None) -> None:
        if self.ended:
            return
        self.ended = True
        self._obs.end = end_time or _now()
        token, self._token = self._token, None
        if token is not None:
            # Ended from another context than the one that activated it: ``ended`` keeps
            # it from ever being current there.
            with contextlib.suppress(ValueError):
                _SPAN_STACK.reset(token)


class DemoWriter:
    """Write half of the docs-demo backend: records real spans into the store."""

    def __init__(self, store: TraceStore) -> None:
        self._store = store
        self._listener: Callable[[MonitoringExportHealth], None] | None = None

    # --- emit (fail-safe) --------------------------------------------------

    def open_span(
        self,
        *,
        name: str,
        kind: SpanKind,
        trace_context: TraceContext | None = None,
        input_: Any = None,
        model: str | None = None,
        model_parameters: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
        start_time: datetime | None = None,
        activate: bool = False,
    ) -> Span:
        if _DISABLED.get():
            return _InertSpan()
        try:
            now = start_time or _now()
            trace_id = self._resolve_trace_id(trace_context)
            self._store.ensure_trace(
                trace_id,
                timestamp=now,
                tags=list(trace_context.tags) if trace_context and trace_context.tags else None,
                metadata=trace_context.metadata if trace_context else None,
            )
            obs = MonitoringObservation(
                id=uuid.uuid4().hex,
                trace_id=trace_id,
                parent_id=self._parent_id(trace_context),
                type=_KIND_TO_TYPE.get(kind, "SPAN"),
                name=name,
                level=DEFAULT_LEVEL.value,
                input=_recorded(input_),
                model=model,
                metadata=_recorded(metadata) if metadata else None,
                start=now,
            )
            self._store.add_observation(trace_id, obs)
            span = DemoSpan(self._store, trace_id, obs)
            if activate:
                span.activate()
        except Exception:  # fail-safe: never break the caller
            logger.exception("DemoWriter.open_span failed")
            return _InertSpan()
        return span

    @contextmanager
    def start_span(
        self,
        *,
        name: str,
        kind: SpanKind,
        trace_context: TraceContext | None = None,
        input_: Any = None,
        model: str | None = None,
        model_parameters: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Iterator[Span]:
        span = self.open_span(
            name=name,
            kind=kind,
            trace_context=trace_context,
            input_=input_,
            model=model,
            model_parameters=model_parameters,
            metadata=metadata,
            activate=True,
        )
        try:
            yield span
        finally:
            span.end()

    def record_span(
        self,
        *,
        name: str,
        kind: SpanKind,
        start: datetime,
        end: datetime,
        trace_context: TraceContext,
        input_: Any = None,
        output: Any = None,
        level: MonitoringLevel | None = None,
        status_message: str | None = None,
        model: str | None = None,
        usage: TokenUsage | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        # The explicit-time path has no ambient context to fall back to — a
        # missing trace_id is a caller bug and RAISES (per the contract).
        if not trace_context.trace_id:
            raise ValueError("record_span requires trace_context.trace_id")
        span = self.open_span(
            name=name,
            kind=kind,
            trace_context=trace_context,
            input_=input_,
            model=model,
            metadata=metadata,
            start_time=start,
        )
        span.update(output=output, usage=usage, level=level, status_message=status_message)
        span.end(end_time=end)

    def create_event(
        self,
        *,
        name: str,
        level: MonitoringLevel = DEFAULT_LEVEL,
        trace_context: TraceContext | None = None,
        input_: Any = None,
        output: Any = None,
        status_message: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> RecordId | None:
        span = self.open_span(
            name=name, kind=SpanKind.EVENT, trace_context=trace_context, input_=input_, metadata=metadata
        )
        if not isinstance(span, DemoSpan):
            return None
        span.update(output=output, level=level, status_message=status_message)
        span.end(end_time=span.observation.start)
        return RecordId(trace_id=span.trace_id, span_id=span.id)

    def update_current_span(
        self,
        *,
        level: MonitoringLevel | None = None,
        status_message: str | None = None,
        metadata: dict[str, Any] | None = None,
        input_: Any = None,
        output: Any = None,
    ) -> None:
        if _DISABLED.get():
            return
        span = _current()
        if span is None:
            return
        try:
            if input_ is not None:
                span.observation.input = _recorded(input_)
        except Exception:  # fail-safe
            logger.exception("DemoWriter.update_current_span failed")
        span.update(output=output, metadata=metadata, level=level, status_message=status_message)

    @contextmanager
    def trace_attributes(
        self,
        *,
        name: str | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        user_id: str | None = None,
        session_id: str | None = None,
    ) -> Iterator[None]:
        # Honor disable(): emission is suppressed within the block, so trace
        # attributes are not written either (matching the other emit methods).
        # user_id/session_id fold into the trace metadata (MonitoringTrace has no
        # dedicated fields for them) so run attribution is not silently dropped.
        if not _DISABLED.get():
            try:
                span = _current()
                trace = self._store.get(span.trace_id) if span is not None else None
                if trace is not None:
                    if tags is not None:
                        trace.tags = list(tags)
                    if metadata is not None or name is not None or user_id is not None or session_id is not None:
                        extra = dict(_recorded(metadata) or {})
                        if name is not None:
                            extra["name"] = name
                        if user_id is not None:
                            extra["user_id"] = user_id
                        if session_id is not None:
                            extra["session_id"] = session_id
                        trace.metadata = {**(trace.metadata or {}), **extra}
            except Exception:  # fail-safe
                logger.exception("DemoWriter.trace_attributes failed")
        yield

    # --- queries (never raise) --------------------------------------------

    def current_trace_id(self) -> str | None:
        span = _current()
        return span.trace_id if span is not None else None

    def current_span_id(self) -> str | None:
        span = _current()
        return span.id if span is not None else None

    def is_recording(self) -> bool:
        # It records into its store.
        return True

    def export_health(self) -> MonitoringExportHealth:
        # An in-memory store has nothing to deliver, so nothing can fail.
        return MonitoringExportHealth()

    def set_health_listener(self, listener: Callable[[MonitoringExportHealth], None] | None) -> None:
        self._listener = listener

    # --- suppression ------------------------------------------------------

    @contextmanager
    def disable(self) -> Iterator[None]:
        token = _DISABLED.set(True)
        try:
            yield
        finally:
            _DISABLED.reset(token)

    # --- lifecycle ---------------------------------------------------------

    def flush(self) -> None:
        # In-memory store: nothing is buffered.
        self._notify()

    def shutdown(self) -> None:
        # No background client to evict.
        self._notify()

    def _notify(self) -> None:
        listener = self._listener
        if listener is None:
            return
        try:
            listener(self.export_health())
        except Exception:
            logger.exception("docs-demo health listener failed")

    # --- helpers -----------------------------------------------------------

    def _resolve_trace_id(self, trace_context: TraceContext | None) -> str:
        if trace_context and trace_context.trace_id:
            return trace_context.trace_id
        span = _current()
        if span is not None:
            return span.trace_id
        return f"live-{uuid.uuid4().hex}"

    def _parent_id(self, trace_context: TraceContext | None) -> str | None:
        if trace_context and trace_context.trace_id:
            return trace_context.parent_span_id
        span = _current()
        return span.id if span is not None else None
