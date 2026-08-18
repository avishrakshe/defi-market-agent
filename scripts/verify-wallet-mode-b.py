"""Verify Mode B: user wallet signs EIP-3009, orchestrator orchestrates."""
import base64
import json
import random
import time

import httpx
from eth_account import Account
from eth_account.messages import encode_typed_data
from web3 import Web3

ORCH = "http://localhost:5000"
ROOT = __file__.replace("\\", "/").rsplit("/", 2)[0]
DEPLOYED = json.load(open(ROOT + "/shared/deployed.json"))
CHAIN_ID = DEPLOYED["chainId"]

# Hardhat account #1 — distinct from orchestrator #0
USER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
ORCH_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
ORCH_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
TASK = "Check token 0xd00ae084303577FA9DDB4Ee0e131e3fb38d0ACBB for risk and tell me if gas is good on Avalanche."

user = Account.from_key(USER_KEY)


def sign_eip3009(from_addr, to, value, nonce, valid_before):
    domain = {
        "name": "Test USD Coin", "version": "1", "chainId": CHAIN_ID,
        "verifyingContract": DEPLOYED["contracts"]["TestUSDC"],
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
    signed = user.sign_message(typed)
    return {
        "from": message["from"], "to": message["to"], "value": str(value),
        "validAfter": 0, "validBefore": valid_before,
        "nonce": "0x" + nonce.hex(),
        "v": signed.v, "r": "0x" + signed.r.to_bytes(32, "big").hex(),
        "s": "0x" + signed.s.to_bytes(32, "big").hex(),
    }


def fund_user_usdc():
    w3 = Web3(Web3.HTTPProvider(DEPLOYED["rpcUrl"]))
    orch = Account.from_key(ORCH_KEY)
    usdc = w3.eth.contract(
        address=Web3.to_checksum_address(DEPLOYED["contracts"]["TestUSDC"]),
        abi=DEPLOYED["abis"]["TestUSDC"],
    )
    bal = usdc.functions.balanceOf(user.address).call()
    if bal < 10**6:
        tx = usdc.functions.faucet(user.address, 1000 * 10**6).transact({"from": orch.address})
        w3.eth.wait_for_transaction_receipt(tx)
        print("Funded user wallet with tUSDC via orchestrator faucet")


def main():
    print("USER WALLET:", user.address)
    assert user.address.lower() != ORCH_ADDR.lower()
    fund_user_usdc()

    with httpx.Client(timeout=30) as c:
        plan = c.post(f"{ORCH}/plan-task", json={"task": TASK}).json()
    reqs = plan.get("paymentRequirements", {})
    user_payments = {}
    for skill, info in reqs.items():
        price = float(info.get("priceUSDC") or info.get("price", "0.01"))
        value = int(price * 1_000_000)
        nonce = random.randbytes(32)
        valid_before = int(time.time()) + 3600
        user_payments[skill] = sign_eip3009(user.address, info["payTo"], value, nonce, valid_before)
        print(f"Signed payment for {skill} -> {info['payTo']}")

    payers = []
    with httpx.Client(timeout=180) as c:
        with c.stream(
            "POST", f"{ORCH}/run-task",
            json={"task": TASK, "payerMode": "user", "userPayments": user_payments},
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
                        raise SystemExit(1)
                    if ev == "done":
                        print("DONE payerMode=", parsed.get("payerMode"), "spent=", parsed.get("sessionSpent"))

    assert len(payers) >= 1
    assert all(p and p.lower() == user.address.lower() for p in payers)
    assert all(p.lower() != ORCH_ADDR.lower() for p in payers)
    print(f"PASS Mode B: {len(payers)} payment(s) from USER {user.address}")


if __name__ == "__main__":
    main()
