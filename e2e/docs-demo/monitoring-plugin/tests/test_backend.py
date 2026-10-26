"""The writer and reader carry every member of their contract protocols, the check the platform runs
before it installs a monitoring backend."""

from __future__ import annotations

import typing

import pytest
from tai42_contract.monitoring import MonitoringReader, MonitoringWriter

from docs_demo_monitoring.reader import DemoReader
from docs_demo_monitoring.store import TraceStore
from docs_demo_monitoring.writer import DemoWriter


@pytest.mark.parametrize(("face", "protocol"), [(DemoWriter, MonitoringWriter), (DemoReader, MonitoringReader)])
def test_each_face_implements_every_protocol_member(face: type, protocol: type) -> None:
    implementation = face(TraceStore())
    assert sorted(m for m in typing.get_protocol_members(protocol) if not hasattr(implementation, m)) == []
