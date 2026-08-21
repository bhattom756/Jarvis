from app.planner import PlannerEngine


def test_planner_marks_risky_actions_for_confirmation() -> None:
    plan = PlannerEngine().build_plan("Delete the old backups.")
    assert plan.requires_confirmation is True
    assert plan.steps


def test_planner_builds_research_steps() -> None:
    plan = PlannerEngine().build_plan("Find RTX 5090 reviews.")
    assert [step.title for step in plan.steps] == [
        "Collect context",
        "Analyze options",
        "Report findings",
    ]

