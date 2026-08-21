import asyncio

from app.monitoring import MonitoringEngine, StubConnector


def test_monitoring_engine_emits_initial_connector_status() -> None:
    engine = MonitoringEngine([StubConnector("discord")])
    alerts = asyncio.run(engine.poll_once())
    assert len(alerts) == 1
    assert alerts[0].source == "discord"

