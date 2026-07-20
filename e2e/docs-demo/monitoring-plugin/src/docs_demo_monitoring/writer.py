"""The docs-demo monitoring writer — a real, fail-safe recorder.

Emit methods record live spans/events into the shared ``TraceStore`` (so a tool
run during a capture session lands in the same dashboard as the seed), while
honoring the contract's FAIL-SAFE invariant: an emit never raises into
application code — it catches and logs. The only precondition that raises is
``record_span`` with no ``trace_id`` (a caller bug, per the contract).

This backend records via ``start_span`` / ``record_span`` rather than LangChain
callbacks, so ``get_monitoring_callbacks`` returns no handlers and
``inject_context`` returns an empty blob — the documented shape of a
non-callback backend (mirrors the reference in-memory example).
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

from tai_contract.monitoring import (
    DEFAULT_LEVEL,
    MonitoringLevel,
    MonitoringObservation,
    Span,
    SpanKind,
    TraceContext,
)

from docs_demo_monitoring.store import TraceStore

logger = logging.getLogger(__name__)

# Ambient stack of (trace_id, observation_id) for the current async context, and
# a suppression flag toggled by ``disable()``.
_SPAN_STACK: ContextVar[tuple[tuple[str, str], ...]] = ContextVar("docs_demo_span_stack", default=())
_DISABLED: ContextVar[bool] = ContextVar("docs_demo_disabled", default=False)

_KIND_TO_TYPE = {
    SpanKind.LLM: "GENERATION",
    SpanKind.TOOL: "SPAN",
    SpanKind.CHAIN: "SPAN",
    SpanKind.EVENT: "EVENT",
}


def _now() -> datetime:
    return datetime.now(UTC)


class _InertSpan:
    """Returned when emission is disabled or setup failed — records nothing."""

    @property
    def id(self) -> str:
        return ""

    def update(self, **_: Any) -> None:
        pass

    def set_trace_metadata(self, **_: Any) -> None:
        pass


class DemoSpan:
    """A handle to a recorded observation. Both methods are fail-safe."""

    def __init__(self, store: TraceStore, trace_id: str, observation: MonitoringObservation) -> None:
        self._store = store
        self._trace_id = trace_id
        self._obs = observation

    @property
    def id(self) -> str:
        return self._obs.id

    def update(
        self,
        *,
        output: Any = None,
        model: str | None = None,
        usage_details: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
        level: MonitoringLevel | None = None,
        status_message: str | None = None,
    ) -> None:
        try:
            if output is not None:
                self._obs.output = output
            if model is not None:
                self._obs.model = model
            if usage_details is not None:
                self._obs.usage = {**(self._obs.usage or {}), **usage_details}
            if metadata is not None:
                self._obs.metadata = {**(self._obs.metadata or {}), **metadata}
            if level is not None:
                self._obs.level = level.value
            if status_message is not None:
                self._obs.status_message = status_message
        except Exception:  # fail-safe: a monitoring outage must not break a flow
            logger.warning("DemoSpan.update failed", exc_info=True)

    def set_trace_metadata(self, *, name: str | None = None, tags: list[str] | None = None) -> None:
        try:
            trace = self._store.get(self._trace_id)
            if trace is None:
                return
            if tags is not None:
                trace.tags = list(tags)
            if name is not None:
                trace.metadata = {**(trace.metadata or {}), "name": name}
        except Exception:  # fail-safe
            logger.warning("DemoSpan.set_trace_metadata failed", exc_info=True)


class DemoWriter:
    """Write half of the docs-demo backend: records real spans into the store."""

    def __init__(self, store: TraceStore) -> None:
        self._store = store

    # --- emit (fail-safe) --------------------------------------------------

    @contextmanager
    def start_span(
        self,
        *,
        name: str,
        kind: SpanKind,
        trace_context: TraceContext | None = None,
        input: Any = None,
        model: str | None = None,
        model_parameters: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Iterator[Span]:
        if _DISABLED.get():
            yield _InertSpan()
            return
        span: Span = _InertSpan()
        stack_token = None
        obs: MonitoringObservation | None = None
        trace_id: str | None = None
        try:
            now = _now()
            trace_id = self._resolve_trace_id(trace_context)
            self._store.ensure_trace(
                trace_id,
                timestamp=now,
                tags=list(trace_context.tags) if trace_context and trace_context.tags else None,
                metadata=trace_context.metadata if trace_context else None,
            )
            parent_id = self._current_span_id(trace_context)
            obs = MonitoringObservation(
                id=uuid.uuid4().hex,
                trace_id=trace_id,
                parent_id=parent_id,
                type=_KIND_TO_TYPE.get(kind, "SPAN"),
                name=name,
                level=DEFAULT_LEVEL.value,
                input=input,
                model=model,
                metadata=metadata,
                start=now,
            )
            self._store.add_observation(trace_id, obs)
            stack_token = _SPAN_STACK.set((*_SPAN_STACK.get(), (trace_id, obs.id)))
            span = DemoSpan(self._store, trace_id, obs)
        except Exception:  # fail-safe: never break the wrapped block
            logger.warning("DemoWriter.start_span setup failed", exc_info=True)
        try:
            yield span
        finally:
            try:
                if obs is not None:
                    obs.end = _now()
                if stack_token is not None:
                    _SPAN_STACK.reset(stack_token)
            except Exception:  # fail-safe teardown
                logger.warning("DemoWriter.start_span teardown failed", exc_info=True)

    def record_span(
        self,
        *,
        name: str,
        kind: SpanKind,
        start: datetime,
        end: datetime,
        trace_context: TraceContext,
        input: Any = None,
        output: Any = None,
        level: MonitoringLevel | None = None,
        status_message: str | None = None,
        model: str | None = None,
        usage_details: dict[str, Any] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        # The explicit-time path has no ambient context to fall back to — a
        # missing trace_id is a caller bug and RAISES (per the contract).
        if not trace_context.trace_id:
            raise ValueError("record_span requires trace_context.trace_id")
        if _DISABLED.get():
            return
        try:
            self._store.ensure_trace(
                trace_context.trace_id,
                timestamp=start,
                tags=list(trace_context.tags) if trace_context.tags else None,
                metadata=trace_context.metadata,
            )
            self._store.add_observation(
                trace_context.trace_id,
                MonitoringObservation(
                    id=uuid.uuid4().hex,
                    trace_id=trace_context.trace_id,
                    parent_id=trace_context.parent_span_id,
                    type=_KIND_TO_TYPE.get(kind, "SPAN"),
                    name=name,
                    level=(level or DEFAULT_LEVEL).value,
                    status_message=status_message,
                    input=input,
                    output=output,
                    model=model,
                    usage=usage_details,
                    metadata=metadata,
                    start=start,
                    end=end,
                ),
            )
        except Exception:  # fail-safe (the precondition above already raised)
            logger.warning("DemoWriter.record_span failed", exc_info=True)

    def create_event(
        self,
        *,
        name: str,
        level: MonitoringLevel = DEFAULT_LEVEL,
        trace_context: TraceContext | None = None,
        input: Any = None,
        output: Any = None,
        status_message: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        if _DISABLED.get():
            return
        try:
            trace_id = self._resolve_trace_id(trace_context)
            now = _now()
            self._store.ensure_trace(trace_id, timestamp=now)
            self._store.add_observation(
                trace_id,
                MonitoringObservation(
                    id=uuid.uuid4().hex,
                    trace_id=trace_id,
                    parent_id=self._current_span_id(trace_context),
                    type="EVENT",
                    name=name,
                    level=level.value,
                    status_message=status_message,
                    input=input,
                    output=output,
                    metadata=metadata,
                    start=now,
                    end=now,
                ),
            )
        except Exception:  # fail-safe
            logger.warning("DemoWriter.create_event failed", exc_info=True)

    def update_current_span(
        self,
        *,
        level: MonitoringLevel | None = None,
        status_message: str | None = None,
        metadata: dict[str, Any] | None = None,
        output: Any = None,
    ) -> None:
        if _DISABLED.get():
            return
        try:
            stack = _SPAN_STACK.get()
            if not stack:
                return
            trace_id, obs_id = stack[-1]
            trace = self._store.get(trace_id)
            if trace is None:
                return
            obs = next((o for o in trace.observations if o.id == obs_id), None)
            if obs is None:
                return
            if level is not None:
                obs.level = level.value
            if status_message is not None:
                obs.status_message = status_message
            if metadata is not None:
                obs.metadata = {**(obs.metadata or {}), **metadata}
            if output is not None:
                obs.output = output
        except Exception:  # fail-safe
            logger.warning("DemoWriter.update_current_span failed", exc_info=True)

    @contextmanager
    def trace_attributes(
        self,
        *,
        name: str | None = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> Iterator[None]:
        # Honor disable(): emission is suppressed within the block, so trace
        # attributes are not written either (matching the other emit methods).
        if not _DISABLED.get():
            try:
                stack = _SPAN_STACK.get()
                trace = self._store.get(stack[-1][0]) if stack else None
                if trace is not None:
                    if tags is not None:
                        trace.tags = list(tags)
                    if metadata is not None or name is not None:
                        extra = dict(metadata or {})
                        if name is not None:
                            extra["name"] = name
                        trace.metadata = {**(trace.metadata or {}), **extra}
            except Exception:  # fail-safe
                logger.warning("DemoWriter.trace_attributes failed", exc_info=True)
        yield

    # --- guard query (never raises) ---------------------------------------

    def current_trace_id(self) -> str | None:
        stack = _SPAN_STACK.get()
        return stack[-1][0] if stack else None

    # --- propagation / callbacks ------------------------------------------

    def inject_context(self, ctx: TraceContext) -> dict[str, Any]:
        # In-process backend: no cross-boundary propagation blob is needed.
        return {}

    def get_monitoring_callbacks(self, ctx: TraceContext) -> list[object]:
        # This backend records via start_span/record_span, not LangChain
        # callbacks, so it contributes no handlers (documented, not a failure).
        return []

    # --- scoping / suppression --------------------------------------------

    @contextmanager
    def scope(self, public_key: str) -> Iterator[None]:
        # Single-project backend: nothing to switch. A no-op success is allowed.
        yield

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
        pass

    def shutdown(self) -> None:
        # No background client to evict.
        pass

    # --- helpers -----------------------------------------------------------

    def _resolve_trace_id(self, trace_context: TraceContext | None) -> str:
        if trace_context and trace_context.trace_id:
            return trace_context.trace_id
        stack = _SPAN_STACK.get()
        if stack:
            return stack[-1][0]
        return f"live-{uuid.uuid4().hex}"

    def _current_span_id(self, trace_context: TraceContext | None) -> str | None:
        if trace_context and trace_context.parent_span_id:
            return trace_context.parent_span_id
        stack = _SPAN_STACK.get()
        return stack[-1][1] if stack else None
