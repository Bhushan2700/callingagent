import os
import sys
from pathlib import Path

os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("OPENAI_API_KEY", "test-key")
os.environ.setdefault("DATABASE_URL", "")
sys.path.insert(0, str(Path(__file__).parent.parent))

from main import classify_call_resolution  # noqa: E402


def t(msgs, tools=None, status="completed"):
    transcript = [{"role": r, "content": c} for r, c in msgs]
    tool_calls = [{"function": {"name": n}} for n in (tools or [])]
    return classify_call_resolution({"status": status, "transcript": transcript}, tool_calls)


cases = [
    (t([("user", "hi"), ("assistant", "anything else I can help with?"), ("user", "no that's all")]), "ai_resolved"),
    (t([("user", "hi"), ("assistant", "have a great day!")]), "ai_resolved"),
    (t([("user", "bye"), ("assistant", "goodbye")]), "ai_resolved"),
    (t([("user", "I need a dentist"), ("assistant", "sure, when?")], tools=["book_appointment"]), "appointment_completed"),
    (t([("user", "my bill is wrong"), ("assistant", "let me create a ticket")], tools=["raise_ticket"]), "ticket_created"),
    (t([("user", "speak to a human")], tools=["escalate"]), "escalated"),
    (t([], status="failed"), "abandoned"),
    (t([], status="completed"), "abandoned"),
    (t([("user", "hello"), ("assistant", "how can I help?")]), "unresolved"),
    (t([("user", "hello")], status="ended"), "unresolved"),
]

fails = 0
for i, (res, expected) in enumerate(cases):
    ok = res[0] == expected
    fails += not ok
    print(f"case {i}: {res[0]:<22} expected {expected:<22} {'OK' if ok else 'FAIL'}")
print(f"\n{fails} failures")
sys.exit(1 if fails else 0)