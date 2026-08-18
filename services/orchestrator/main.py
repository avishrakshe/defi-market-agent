import asyncio
import base64
import json
import os
import random
import re
import time
from pathlib import Path
from typing import AsyncGenerator

import httpx
from dotenv import load_dotenv
from eth_account import Account
from eth_account.messages import encode_typed_data
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from web3 import Web3

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / ".env")
load_dotenv(ROOT / "services" / "orchestrator" / ".env", override=True)

RPC_URL = os.getenv("RPC_URL", "http://127.0.0.1:9650")
CHAIN_ID = int(os.getenv("CHAIN_ID", "99999"))
PRIVATE_KEY = os.getenv("ORCHESTRATOR_PRIVATE_KEY") or os.getenv("DEV_PRIVATE_KEY", "")
MIN_SCORE = int(os.getenv("MIN_REPUTATION_SCORE", "50"))
MIN_STAKE = 10.0
SPEND_CAP = float(os.getenv("SESSION_SPEND_CAP", "1.0"))

DEPLOYED_PATH = ROOT / "shared" / "deployed.json"
deployed = json.loads(DEPLOYED_PATH.read_text())

w3 = Web3(Web3.HTTPProvider(RPC_URL))
account = Account.from_key(PRIVATE_KEY)

SKILL_ROUTES = {
    "contract-audit": ("/audit", lambda s: {"contractAddress": s.get("contractAddress"), "network": s.get("network", "fuji")}),
    "token-risk-score": ("/score-token", lambda s: {"tokenAddress": s.get("tokenAddress"), "network": s.get("network", "fuji")}),
    "gas-timing": ("/gas-recommendation", lambda s: {"network": s.get("network", "avalanche-fuji")}),
}

app = FastAPI(title="DeFi Agent Orchestrator")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class TaskRequest(BaseModel):
    task: str
    payerMode: str = "orchestrator"  # "orchestrator" | "user"
    userPayments: dict | None = None


def get_usdc_balance(address: str) -> float:
    usdc = get_contract("TestUSDC")
    bal = usdc.functions.balanceOf(Web3.to_checksum_address(address)).call()
    return int(bal) / 1e6


def fund_orchestrator_usdc() -> str:
    usdc = get_contract("TestUSDC")
    amount = 1000 * 10**6
    tx = usdc.functions.faucet(account.address, amount).transact({"from": account.address})
    w3.eth.wait_for_transaction_receipt(tx)
    return Web3.to_hex(tx)


def sse(event: str, data: dict) -> str:
    def default(o):
        if hasattr(o, "hex"):
            return o.hex() if callable(o.hex) else str(o)
        raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")
    return f"event: {event}\ndata: {json.dumps(data, default=default)}\n\n"


def get_contract(name: str):
    address = deployed["contracts"][name]
    abi = deployed["abis"][name]
    return w3.eth.contract(address=Web3.to_checksum_address(address), abi=abi)


def decompose_task(task_text: str) -> list[dict]:
    subtasks = []
    addresses = re.findall(r"0x[a-fA-F0-9]{40}", task_text)

    if re.search(r"risk|safe|token", task_text, re.I) and addresses:
        subtasks.append({"skill": "token-risk-score", "tokenAddress": addresses[0], "network": "fuji"})
    if re.search(r"audit|contract|vulnerab", task_text, re.I) and addresses:
        subtasks.append({"skill": "contract-audit", "contractAddress": addresses[-1], "network": "fuji"})
    if re.search(r"gas|timing|transact|fee", task_text, re.I):
        subtasks.append({"skill": "gas-timing", "network": "avalanche-fuji"})

    return subtasks


def build_summary(results: dict) -> str:
    parts = []
    if results.get("riskScore"):
        r = results["riskScore"]
        liq = r.get("liquidityUSD")
        liq_str = f"${liq:,.0f}" if isinstance(liq, (int, float)) else "unknown"
        age = r.get("pairAgeHours")
        age_str = str(age) if age is not None else "unknown"
        holder = r.get("topHolderPct")
        holder_str = f"{holder}%" if holder is not None else "unknown"
        listing_note = ", not listed on major trackers" if r.get("listed") is False else ""
        parts.append(
            f"Token risk score: {r.get('score', '?')}/100. "
            f"Liquidity: {liq_str}, pair age: {age_str} hours, "
            f"top holder: {holder_str} of supply{listing_note}."
        )
    if results.get("gasTiming"):
        g = results["gasTiming"]
        gas_line = (
            f"Gas on Avalanche: {g.get('currentGasPriceGwei', '?')} gwei, trend {g.get('trend', '?')}. "
            f"Recommendation: {g.get('recommendation', '?')}."
        )
        if g.get("tvlContext"):
            gas_line += f" {g['tvlContext']}"
        parts.append(gas_line)
    if results.get("audit"):
        a = results["audit"]
        parts.append(
            f"Contract audit: {len(a.get('criticalIssues', []))} critical issue(s), "
            f"{len(a.get('mediumIssues', []))} medium issue(s), "
            f"{len(a.get('gasOptimizations', []))} gas optimization(s) found."
        )
    return " ".join(parts) if parts else "No data was returned from the selected agents."


async def fetch_agent_metadata(uri: str) -> dict:
    if uri.startswith("http"):
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(uri)
            resp.raise_for_status()
            return resp.json()
    return {"skill": "unknown", "endpoint": uri, "price": "0.01"}


def sign_eip3009(from_addr: str, to: str, value: int, nonce: bytes, valid_before: int) -> dict:
    domain = {
        "name": "Test USD Coin", "version": "1", "chainId": CHAIN_ID,
        "verifyingContract": deployed["contracts"]["TestUSDC"],
    }
    message = {
        "from": Web3.to_checksum_address(from_addr),
        "to": Web3.to_checksum_address(to),
        "value": value,
        "validAfter": 0, "validBefore": valid_before, "nonce": nonce,
    }
    typed = encode_typed_data(domain, {"TransferWithAuthorization": [
        {"name": "from", "type": "address"}, {"name": "to", "type": "address"},
        {"name": "value", "type": "uint256"}, {"name": "validAfter", "type": "uint256"},
        {"name": "validBefore", "type": "uint256"}, {"name": "nonce", "type": "bytes32"},
    ]}, message)
    signed = account.sign_message(typed)
    return {
        "from": message["from"], "to": message["to"], "value": str(value),
        "validAfter": 0, "validBefore": valid_before,
        "nonce": "0x" + nonce.hex(),
        "v": signed.v, "r": "0x" + signed.r.to_bytes(32, "big").hex(),
        "s": "0x" + signed.s.to_bytes(32, "big").hex(),
    }


async def call_specialist(endpoint: str, skill: str, subtask: dict, payment_auth: dict | None = None):
    route, body_fn = SKILL_ROUTES[skill]
    url = f"{endpoint.rstrip('/')}{route}"
    body = body_fn(subtask)
    headers = {}
    if payment_auth:
        headers["X-PAYMENT"] = base64.b64encode(json.dumps(payment_auth).encode()).decode()

    async with httpx.AsyncClient(timeout=90) as client:
        resp = await client.post(url, json=body, headers=headers)

    if resp.status_code == 402:
        return {"needs_payment": True, "payment_info": resp.json()}
    resp.raise_for_status()
    return {"needs_payment": False, "result": resp.json()}


async def match_agent(skill: str, agents_raw, identity, reputation, stake_mgr):
    candidates = []
    for agent in agents_raw:
        token_id, wallet, metadata_uri = agent
        meta = await fetch_agent_metadata(metadata_uri)
        if meta.get("skill") != skill:
            continue

        rep = reputation.functions.getReputation(token_id).call()
        avg_score, feedback_count = rep
        rep_before = {"avgScore": int(avg_score), "feedbackCount": int(feedback_count)}

        if feedback_count > 0 and int(avg_score) < MIN_SCORE:
            continue

        staked_raw = stake_mgr.functions.getStake(token_id).call()
        staked = int(staked_raw) / 1e6
        if staked < MIN_STAKE:
            continue

        candidates.append({
            "tokenId": token_id, "wallet": wallet, "metadata": meta,
            "reputationBefore": rep_before, "stake": staked,
        })

    if not candidates:
        return None
    return sorted(candidates, key=lambda c: c["tokenId"], reverse=True)[0]


async def execute_subtask(subtask: dict, agents_raw, session_spent: float, payer_mode: str = "orchestrator", user_payments: dict | None = None):
    try:
        skill = subtask["skill"]
        identity = get_contract("IdentityRegistry")
        reputation = get_contract("ReputationRegistry")
        stake_mgr = get_contract("StakeManager")

        matched = await match_agent(skill, agents_raw, identity, reputation, stake_mgr)
        if not matched:
            return None, session_spent, {"error": f"No suitable {skill} agent (reputation/stake gate)"}

        endpoint = matched["metadata"].get("endpoint", "")
        price = float(matched["metadata"].get("priceUSDC") or matched["metadata"].get("price", "0.01"))
        if session_spent + price > SPEND_CAP:
            return None, session_spent, {"error": f"Spend cap exceeded ({SPEND_CAP} tUSDC)"}

        call_result = await call_specialist(endpoint, skill, subtask)
        payer_address = account.address

        if call_result["needs_payment"]:
            pay_info = call_result["payment_info"]
            if payer_mode == "user" and user_payments and skill in user_payments:
                auth = user_payments[skill]
                payer_address = auth.get("from", "")
            else:
                orch_bal = get_usdc_balance(account.address)
                if orch_bal < SPEND_CAP:
                    return None, session_spent, {
                        "error": "Orchestrator wallet balance low — top up via faucet",
                        "orchestratorAddress": account.address,
                        "orchestratorUsdcBalance": orch_bal,
                    }
                value = int(float(pay_info.get("priceUSDC") or pay_info.get("price", "0.01")) * 1_000_000)
                nonce = random.randbytes(32)
                valid_before = int(time.time()) + 3600
                auth = sign_eip3009(account.address, pay_info["payTo"], value, nonce, valid_before)
                payer_address = account.address
            call_result = await call_specialist(endpoint, skill, subtask, auth)
            session_spent += price

        result_data = call_result["result"]
        settlement_tx = result_data.get("settlementTxHash")
        agent_result = result_data.get("result", result_data)

        quality = 85
        if isinstance(agent_result, dict) and agent_result.get("score"):
            quality = min(100, max(50, int(agent_result["score"])))

        tx_hash_bytes = Web3.to_bytes(hexstr=settlement_tx)
        feedback_tx = reputation.functions.submitFeedback(
            matched["tokenId"], quality, tx_hash_bytes, f"Auto feedback for {skill}",
        ).transact({"from": account.address})
        receipt = w3.eth.wait_for_transaction_receipt(feedback_tx)

        rep_after_raw = reputation.functions.getReputation(matched["tokenId"]).call()
        stake_after = stake_mgr.functions.getStake(matched["tokenId"]).call()

        step = {
            "subtask": subtask, "agentId": matched["tokenId"], "skill": skill,
            "settlementTxHash": settlement_tx,
            "feedbackTxHash": Web3.to_hex(receipt.transactionHash),
            "payerAddress": payer_address,
            "payerMode": payer_mode,
            "reputationBefore": matched["reputationBefore"],
            "reputationAfter": {"avgScore": int(rep_after_raw[0]), "feedbackCount": int(rep_after_raw[1])},
            "stake": int(stake_after) / 1e6,
            "output": agent_result,
        }
        return step, session_spent, None
    except Exception as e:
        return None, session_spent, {"error": f"{subtask.get('skill')}: {str(e)}"}


async def run_task_stream(task: str, payer_mode: str = "orchestrator", user_payments: dict | None = None) -> AsyncGenerator[str, None]:
    session_spent = 0.0
    steps = []
    collected = {}

    yield sse("step", {"phase": "start", "message": f"Decomposing task: {task[:100]}...", "payerMode": payer_mode})
    subtasks = decompose_task(task)

    if not subtasks:
        yield sse("error", {"message": "Could not decompose task. Include a 0x address and mention risk/audit/gas keywords."})
        return

    yield sse("step", {"phase": "decompose", "subtasks": subtasks})

    identity = get_contract("IdentityRegistry")
    agents_raw = identity.functions.getAllAgents().call()
    yield sse("step", {"phase": "discover", "agentCount": len(agents_raw)})

    for i, subtask in enumerate(subtasks):
        skill = subtask["skill"]
        yield sse("step", {"phase": "match", "subtaskIndex": i, "skill": skill})

    # Run independent subtasks in parallel
    async def run_one(st):
        return await execute_subtask(st, agents_raw, 0, payer_mode, user_payments)

    results = await asyncio.gather(*[run_one(st) for st in subtasks])

    for i, (step, spent_delta, err) in enumerate(results):
        session_spent += spent_delta if step else 0
        if err:
            yield sse("error", err)
            continue
        if not step:
            continue

        skill = step["skill"]
        yield sse("step", {"phase": "reputation_ok", "agentId": step["agentId"], "reputation": step["reputationBefore"], "stake": step["stake"]})
        yield sse("step", {"phase": "result", "settlementTxHash": step["settlementTxHash"], "output": step["output"], "skill": skill})
        yield sse("step", {"phase": "feedback", **step})
        steps.append(step)

        out = step["output"]
        if skill == "token-risk-score" and isinstance(out, dict):
            collected["riskScore"] = out
        elif skill == "gas-timing" and isinstance(out, dict):
            collected["gasTiming"] = out
        elif skill == "contract-audit" and isinstance(out, dict):
            collected["audit"] = out

    final_answer = build_summary(collected)

    if os.getenv("OPENAI_API_KEY") or os.getenv("ANTHROPIC_API_KEY"):
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {os.getenv('OPENAI_API_KEY', '')}", "Content-Type": "application/json"},
                    json={"model": "gpt-4o-mini", "messages": [{"role": "user", "content": f"Rewrite naturally, keep all numbers exact: {final_answer}"}], "max_tokens": 300},
                )
                if resp.status_code == 200:
                    polished = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                    if polished and polished.strip():
                        final_answer = polished.strip()
        except Exception as e:
            print(f"[orchestrator] LLM polish failed, using template: {e}")

    yield sse("done", {
        "task": task, "steps": steps, "sessionSpent": session_spent,
        "synthesizedAnswer": final_answer, "collected": collected, "payerMode": payer_mode,
    })


async def plan_task_payments(task: str) -> dict:
    subtasks = decompose_task(task)
    if not subtasks:
        return {"subtasks": [], "paymentRequirements": {}}

    identity = get_contract("IdentityRegistry")
    agents_raw = identity.functions.getAllAgents().call()
    requirements = {}

    for subtask in subtasks:
        skill = subtask["skill"]
        stake_mgr = get_contract("StakeManager")
        reputation = get_contract("ReputationRegistry")
        matched = await match_agent(skill, agents_raw, identity, reputation, stake_mgr)
        if not matched:
            continue
        endpoint = matched["metadata"].get("endpoint", "")
        call_result = await call_specialist(endpoint, skill, subtask)
        if call_result["needs_payment"]:
            requirements[skill] = {
                **call_result["payment_info"],
                "endpoint": endpoint,
                "subtask": subtask,
            }

    return {"subtasks": subtasks, "paymentRequirements": requirements}


@app.get("/orchestrator-wallet")
def orchestrator_wallet():
    tagt = w3.from_wei(w3.eth.get_balance(account.address), "ether")
    usdc = get_usdc_balance(account.address)
    return {
        "address": account.address,
        "tagtBalance": str(tagt),
        "usdcBalance": usdc,
        "spendCap": SPEND_CAP,
        "lowBalance": usdc < SPEND_CAP,
    }


@app.post("/orchestrator-wallet/faucet")
def orchestrator_faucet():
    tx = fund_orchestrator_usdc()
    return {
        "txHash": tx,
        "address": account.address,
        "usdcBalance": get_usdc_balance(account.address),
    }


@app.post("/plan-task")
async def plan_task(req: TaskRequest):
    return await plan_task_payments(req.task)


@app.get("/health")
def health():
    return {"status": "ok", "wallet": account.address}


@app.post("/run-task")
async def run_task(req: TaskRequest):
    payer_mode = req.payerMode if req.payerMode in ("orchestrator", "user") else "orchestrator"
    async def gen():
        async for chunk in run_task_stream(req.task, payer_mode, req.userPayments):
            yield chunk
    return StreamingResponse(gen(), media_type="text/event-stream")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("ORCHESTRATOR_PORT", "5000")))
