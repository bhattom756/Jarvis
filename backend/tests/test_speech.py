from app.speech import SpeechEngine


def test_speech_only_dispatches_after_completed_phrase() -> None:
    engine = SpeechEngine()
    partial = engine.ingest_text("Open VS Code")
    assert partial.is_final is False
    assert engine.consume_if_final(partial) is None

    final = engine.ingest_text("and summarize my emails.")
    assert final.is_final is True
    assert engine.consume_if_final(final) == "Open VS Code and summarize my emails."

