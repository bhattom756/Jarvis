from types import SimpleNamespace
from app.orchestrator import Orchestrator


def make_orchestrator() -> Orchestrator:
    orchestrator = object.__new__(Orchestrator)
    orchestrator.settings = SimpleNamespace(
        hotword_enabled=True,
        hotword_phrase="friday",
        hotword_follow_up_timeout_ms=300_000,
    )
    orchestrator._follow_up_deadline = None
    return orchestrator


def test_hotword_requires_friday_before_dispatching_a_command() -> None:
    orchestrator = make_orchestrator()

    assert orchestrator._command_from_microphone_text("open VS Code") is None
    assert orchestrator._command_from_microphone_text("Hey Friday, open VS Code") == "open VS Code"


def test_standalone_hotword_enables_live_mode_follow_ups() -> None:
    orchestrator = make_orchestrator()

    assert orchestrator._command_from_microphone_text("Friday") == ""
    assert orchestrator._command_from_microphone_text("summarize my unread email") == "summarize my unread email"
    assert orchestrator._command_from_microphone_text("what is the weather today") == "what is the weather today"

