class PersonalityEngine:
    def wrap_response(self, text: str) -> str:
        if not text:
            return "Certainly, sir."
        lowered = text.lower()
        if lowered.startswith(("certainly", "interesting", "i have", "i've")):
            return text
        return f"Certainly, sir. {text}"

