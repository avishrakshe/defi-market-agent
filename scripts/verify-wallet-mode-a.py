import httpx
import json
import sys

ORCH = "http://localhost:5000"
ORCH_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
TASK = (
    "Check token 0xd00ae084303577FA9DDB4Ee0e131e3fb38d0ACBB for risk "
    "and tell me if gas is good on Avalanche."
)

def main():
    with httpx.Client(timeout=10) as c:
        w = c.get(f"{ORCH}/orchestrator-wallet").json()
        print("ORCHESTRATOR WALLET:", json.dumps(w, indent=2))
        assert w.get("address", "").lower() == ORCH_ADDR.lower()
        assert not w.get("lowBalance"), "Orchestrator balance too low"

    payers = []
    with httpx.Client(timeout=180) as c:
        with c.stream(
            "POST", f"{ORCH}/run-task",
            json={"task": TASK, "payerMode": "orchestrator"},
            headers={"Accept": "text/event-stream"},
        ) as r:
            buf = ""
            for chunk in r.iter_text():
                buf += chunk
                while "\n\n" in buf:
                    part, buf = buf.split("\n\n", 1)
                    ev, data = "message", ""
                    for line in part.split("\n"):
                        if line.startswith("event:"): ev = line[6:].strip()
                        if line.startswith("data:"): data = line[5:].strip()
                    if not data: continue
                    parsed = json.loads(data)
                    if ev == "step" and parsed.get("phase") == "feedback":
                        payers.append(parsed.get("payerAddress"))
                        print(f"PAID skill={parsed.get('skill')} payer={parsed.get('payerAddress')}")
                    if ev == "error":
                        print("ERROR:", parsed)
                        sys.exit(1)
                    if ev == "done":
                        print("DONE spent=", parsed.get("sessionSpent"))
                        assert len(payers) >= 1, "No payments completed"
                        assert all(p and p.lower() == ORCH_ADDR.lower() for p in payers)
                        print(f"PASS Mode A: {len(payers)} payment(s) from orchestrator")

if __name__ == "__main__":
    main()
