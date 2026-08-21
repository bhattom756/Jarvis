from pathlib import Path

from app.actions import ActionEngine, BrowserActionProvider, WindowsActionProvider
from app.config import Settings


class NoOpBrowser(BrowserActionProvider):
    def search(self, query: str):  # type: ignore[override]
        return super().search(query)


class NoOpWindows(WindowsActionProvider):
    def open_application(self, target: str):  # type: ignore[override]
        return super().open_application(target)


def test_action_engine_requires_confirmation_for_dangerous_actions(tmp_path: Path) -> None:
    settings = Settings(approved_write_roots=[str(tmp_path)])
    engine = ActionEngine(settings, BrowserActionProvider(), WindowsActionProvider())
    result = engine.evaluate("Delete everything in Downloads.")
    assert result.confirmation is not None
    assert result.ok is False


def test_action_engine_allows_file_create_within_approved_root(tmp_path: Path) -> None:
    settings = Settings(approved_write_roots=[str(tmp_path)])
    engine = ActionEngine(settings, BrowserActionProvider(), WindowsActionProvider())
    target = tmp_path / "note.txt"
    result = engine.evaluate(f"create file {target}")
    assert result.ok is True
    assert target.exists()

