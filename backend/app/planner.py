from __future__ import annotations

from app.schemas import PlanPayload, PlanStep


class PlannerEngine:
    def build_plan(self, utterance: str) -> PlanPayload:
        goal = utterance.strip() or "Awaiting task"
        step_titles = self._infer_steps(goal)
        steps = [PlanStep(title=title) for title in step_titles]
        if steps:
            steps[0].status = "in_progress"
        return PlanPayload(
            goal=goal,
            status="in_progress",
            current_step_id=steps[0].id if steps else None,
            confidence=0.82,
            requires_confirmation=self._requires_confirmation(goal),
            steps=steps,
        )

    def _infer_steps(self, utterance: str) -> list[str]:
        text = utterance.lower()
        if any(keyword in text for keyword in ("compare", "research", "find", "summarize")):
            return ["Collect context", "Analyze options", "Report findings"]
        if any(keyword in text for keyword in ("open", "launch", "start")):
            return ["Validate target", "Execute action", "Confirm result"]
        if any(keyword in text for keyword in ("remind", "schedule")):
            return ["Capture reminder", "Store schedule", "Notify user"]
        return ["Understand request", "Plan execution", "Respond"]

    def _requires_confirmation(self, utterance: str) -> bool:
        risky_terms = ("delete", "send", "purchase", "transfer", "move", "execute script", "close all")
        lowered = utterance.lower()
        return any(term in lowered for term in risky_terms)

