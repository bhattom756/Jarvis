from app.schemas import AssistantState


class InvalidStateTransition(ValueError):
    pass


class AssistantStateMachine:
    def __init__(self) -> None:
        self._state = AssistantState.IDLE

    @property
    def state(self) -> AssistantState:
        return self._state

    def transition(self, next_state: AssistantState) -> AssistantState:
        if next_state == self._state:
            return self._state
        self._state = next_state
        return self._state

