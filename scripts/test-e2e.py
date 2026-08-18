import httpx
import json
import os

os.environ.pop("OPENAI_API_KEY", None)

task = (
    "Is token 0xd00ae084303577FA9DDB4Ee0e131e3fb38d0ACBB safe, "
    "audit contract 0xd00ae084303577FA9DDB4Ee0e131e3fb38d0ACBB, "
    "and tell me if gas is good right now on Avalanche."
)

events = []
with httpx.Client(timeout=180) as c:
    with c.stream(
        "POST",
        "http://localhost:5000/run-task",
        json={"task": task},
        headers={"Accept": "text/event-stream"},
    ) as r:
        buf = ""
        for chunk in r.iter_text():
            buf += chunk
            while "\n\n" in buf:
                part, buf = buf.split("\n\n", 1)
                ev, data = "message", ""
                for line in part.split("\n"):
                    if line.startswith("event:"):
                        ev = line[6:].strip()
                    if line.startswith("data:"):
                        data = line[5:].strip()
                if not data:
                    continue
                parsed = json.loads(data)
                events.append((ev, parsed))
                if ev == "step":
                    phase = parsed.get("phase", "")
                    msg = parsed.get("message") or parsed.get("skill") or ""
                    print(f"[{phase}] {msg}")
                if ev == "error":
                    print("ERROR:", json.dumps(parsed))
                if ev == "done":
                    print("\n=== FINAL JSON ===")
                    print(json.dumps(parsed, indent=2))
                    answer = parsed.get("synthesizedAnswer", "")
                    print("\n=== SYNTHESIZED ANSWER ===")
                    print(answer)
                    assert "No LLM response" not in answer, "FAIL: placeholder in answer"
                    assert len(answer) > 20, "FAIL: answer too short"
                    print("\nPASS: real synthesized answer without LLM")
