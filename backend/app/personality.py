import random

class PersonalityEngine:
    FOLLOW_UPS = [
        "Is there anything else I can help you with, Boss?",
        "Shall I help you with anything else, Boss?",
        "Is that everything for now, Boss?",
        "Let me know if you need anything else, Boss.",
    ]

    def wrap_response(self, text: str) -> str:
        if not text:
            return "Certainly, Boss. I'm right here if you need anything."
        cleaned = text.strip()
        lowered = cleaned.lower()
        
        # Avoid double-adding follow-up if response already ends with a question mark or follow-up phrase
        if not cleaned.endswith("?") and not any(phrase.lower() in lowered for phrase in ["anything else", "boss?", "for now?"]):
            follow_up = random.choice(self.FOLLOW_UPS)
            cleaned = f"{cleaned} {follow_up}"

        return cleaned

