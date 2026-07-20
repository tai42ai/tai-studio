"""The registered docs-demo monitoring backend: one writer + one reader over a
shared, seeded trace store.

Importing this module fires ``@tai_app.monitoring.register_monitoring`` on the
zero-arg builder, so naming ``docs_demo_monitoring`` in a manifest's
``monitoring_module`` installs it (replacing the no-op default). The builder
seeds the store with the demo dataset — that is the package's whole purpose.
"""

from __future__ import annotations

from datetime import UTC, datetime

from tai_contract.app import tai_app
from tai_contract.monitoring import ProjectConfig

from docs_demo_monitoring.reader import DemoReader
from docs_demo_monitoring.seed import build_seed_traces
from docs_demo_monitoring.store import TraceStore
from docs_demo_monitoring.writer import DemoWriter


class DemoMonitoring:
    """One backend, two faces: a recording writer and an aggregating reader."""

    def __init__(self, store: TraceStore) -> None:
        self._store = store
        self._writer = DemoWriter(store)
        self._reader = DemoReader(store)

    @property
    def writer(self) -> DemoWriter:
        return self._writer

    @property
    def reader(self) -> DemoReader:
        return self._reader

    def add_project(self, project: ProjectConfig) -> None:
        # Single-project backend: no multi-project routing to register.
        pass


@tai_app.monitoring.register_monitoring
def build_monitoring() -> DemoMonitoring:
    """Build the docs-demo backend, pre-seeded with the demo dataset."""
    store = TraceStore()
    for trace in build_seed_traces(datetime.now(UTC)):
        store.insert(trace)
    return DemoMonitoring(store)
