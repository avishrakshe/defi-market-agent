# Autonomous AI Agent Marketplace

A working prototype where AI agents discover each other onchain, check reputation, pay via x402-style EIP-3009 micropayments, and write feedback onchain — with zero human approval in the transaction loop.

## Architecture

```
Browser (Next.js :3000)
    └── Orchestrator (FastAPI :5000) ── SSE progress stream
            ├── IdentityRegistry (onchain agent discovery)
            ├── ReputationRegistry (onchain reputation checks + feedback)
            ├── Specialist Summarizer (:4001) ── HTTP 402 → EIP-3009 pay → /summarize
            └── Specialist Translator (:4002) ── HTTP 402 → EIP-3009 pay → /translate
                        └── PaymentSettlement.verifyAndSettle → TestUSDC (EIP-3009)
Local EVM Devnet (Hardhat node :9650, chainId 99999, Cancun EVM / Subnet-EVM compatible)
```

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.12+
- Docker (optional, for Avalanche CLI on Linux/macOS)

### 1. Install dependencies

```bash
npm install
pip install -r services/orchestrator/requirements.txt
```

### 2. Configure environment

Copy `.env` (already present) — key variables:

| Variable | Description |
|----------|-------------|
| `RPC_URL` | `http://127.0.0.1:9650` |
| `CHAIN_ID` | `99999` |
| `DEV_PRIVATE_KEY` | Orchestrator/deployer wallet |
| `AGENT_SUMMARIZE_PRIVATE_KEY` | Summarizer agent wallet |
| `AGENT_TRANSLATE_PRIVATE_KEY` | Translator agent wallet |

### 3. Start everything

```bash
npm run dev:all
```

This starts:
1. Hardhat local node (Cancun EVM, chainId 99999) on port **9650**
2. Contract deployment (if `shared/deployed.json` missing)
3. Summarizer agent on **4001**
4. Translator agent on **4002**
5. Orchestrator on **5000**
6. Next.js frontend on **3000**

### 4. Manual start (individual services)

```bash
# Terminal 1 — Devnet
cd contracts && npx hardhat node --port 9650 --hostname 127.0.0.1

# Terminal 2 — Deploy contracts
cd contracts && npx hardhat run scripts/deploy.js --network agentmarket

# Terminal 3 — Summarizer
cd services/specialist-summarizer && node server.js

# Terminal 4 — Translator
cd services/specialist-translator && node server.js

# Terminal 5 — Orchestrator
cd services/orchestrator && python main.py

# Terminal 6 — Frontend
cd frontend && npm run dev
```

## Demo Script

1. Open **http://localhost:3000**
2. Confirm header shows **Chain ID: 99999**, **RPC: connected**, wallet balance
3. Check **Agent Registry** — summarizer (#5) and translator (#6) with reputation scores
4. In **Run a Task**, use the default text or enter:
   ```
   Summarize and translate: Autonomous agents pay each other onchain via x402 micropayments.
   ```
5. Click **Run Task**
6. Watch live progress:
   - `decompose` → task split into summarize + translate subtasks
   - `discover` → reads IdentityRegistry.getAllAgents()
   - `reputation_ok` → checks ReputationRegistry (min score 60, new agents pass)
   - `pay` → signs EIP-3009 transferWithAuthorization, retries with X-PAYMENT
   - `result` → settlement tx hash + specialist output
   - `feedback` → onchain feedback tx hash + reputation before/after
   - `done` → full JSON summary

### Expected output (abbreviated)

```
[result] settlementTxHash: 0x34483e26...
[feedback] feedbackTxHash: 0x981e700d...
[result] settlementTxHash: 0xb9e92a3e...
[feedback] feedbackTxHash: 0x7be404dc...
sessionSpent: 0.02 tUSDC
```

## Smart Contracts (`/contracts`)

| Contract | Purpose |
|----------|---------|
| `TestUSDC.sol` | ERC-20 tUSDC (6 decimals) + EIP-3009 `transferWithAuthorization` |
| `IdentityRegistry.sol` | ERC-721 AgentID tokens, `registerAgent`, `getAllAgents` |
| `ReputationRegistry.sol` | `submitFeedback` cross-checked against PaymentSettlement tx hashes |
| `PaymentSettlement.sol` | `verifyAndSettle` EIP-3009 auth, emits `PaymentSettled` |

Solidity **0.8.24** with **`evmVersion: "cancun"`** (required for Subnet-EVM).

### Deploy & verify

```bash
cd contracts
npx hardhat compile
npx hardhat run scripts/deploy.js --network agentmarket
npx hardhat run scripts/verify.js --network agentmarket
node ../scripts/verify-devnet.js
```

Deployment addresses + ABIs are written to `shared/deployed.json`.

## Avalanche Subnet-EVM (Linux/macOS)

On Linux/macOS with Docker, use the Avalanche CLI path:

```bash
npm run devnet:up   # builds docker/avalanche-cli image, creates & deploys agentmarket L1
```

On **Windows**, the stack uses a **Hardhat local node** configured with Cancun EVM and chainId 99999 — functionally equivalent for development (same EIP-3009, same contract bytecode targeting Cancun).

To use real Avalanche Subnet-EVM on Windows, install WSL2 + Ubuntu and run `scripts/devnet-setup.sh` inside the Docker container.

## x402 Payment Flow

1. Orchestrator calls specialist endpoint without `X-PAYMENT` → **HTTP 402** with `{ price, payTo, tokenAddress, chainId }`
2. Orchestrator signs EIP-3009 `TransferWithAuthorization` with its wallet
3. Retries with `X-PAYMENT: base64(JSON authorization)`
4. Specialist calls `PaymentSettlement.verifyAndSettle()` onchain
5. Specialist calls `linkTxHash(nonce, txHash)` for reputation cross-check
6. Specialist executes task and returns `{ settlementTxHash, result }`
7. Orchestrator calls `ReputationRegistry.submitFeedback(agentId, score, txHash, comment)`

## Deployment (Vercel + backends)

This repo is multi-service. **Only the Next.js frontend goes on Vercel**; the orchestrator and specialist agents need Railway/Render/Fly.io, and contracts must live on a public chain (e.g. Avalanche Fuji) for remote users.

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for step-by-step Vercel, Railway, Fuji contract deploy, and env var setup.


Set `OPENAI_API_KEY` in `.env` for live GPT-4o-mini responses instead of mock output.

## Project Structure

```
├── contracts/          Hardhat + Solidity (Cancun)
├── shared/             deployed.json + blockchain helpers
├── services/
│   ├── specialist-summarizer/
│   ├── specialist-translator/
│   └── orchestrator/   Python FastAPI + SSE
├── frontend/           Next.js + Tailwind
├── scripts/            dev-all.js, verify-devnet.js, devnet-setup.sh
└── docker/             Avalanche CLI image for Linux
```
