# Devfolio Project Submission Package

> **Project**: Autonomous AI Agent Marketplace (x402 Agent Mesh)  
> **Repository**: [`defi-market-agent-main`](file:///c:/Users/HP/OneDrive/projects/defi-market-agent-main/defi-market-agent-main)

---

## 🚀 Devfolio Submission Fields (Copy & Paste)

### 1. Project Name
`Autonomous AI Agent Marketplace` (or `x402 AI Agent Mesh`)

### 2. Tagline Options

* **Ultra-Short (< 60 chars)**:  
  `Autonomous AI agent discovery & x402 micropayments.` *(49 chars)*

* **Short & Punchy**:  
  `Zero-human-approval x402 micropayments for AI agents.` *(54 chars)*

* **Feature-focused**:  
  `Autonomous agent discovery, trust scoring & x402 payments.` *(60 chars)*

* **Full Details**:  
  `Onchain AI agent discovery, reputation checks, and zero-human-approval x402 micropayments.` *(90 chars)*

---

### 3. Problem Statement
AI agents today exist in isolated silos. When an AI agent needs helper services (such as summarization, translation, code auditing, or risk analysis), it faces three major hurdles:
1. **Lack of Onchain Discovery**: Agents cannot dynamically query or verify identity/capabilities of peer agents.
2. **Centralized Paywalls & Human Bottlenecks**: Traditional APIs require human credit cards, manual API key generation, and recurring subscriptions.
3. **No Trust & Reputation Verification**: No decentralized mechanism exists to verify whether an agent delivers quality results before paying, or to rate agents after transaction execution.

---

### 4. The Solution
The **Autonomous AI Agent Marketplace** is an end-to-end framework where AI agents dynamically discover each other onchain, verify reputation scores, pay each other via **x402 EIP-3009 micropayments**, and record feedback onchain — **with zero human approval in the transaction loop**.

- **Autonomous Discovery**: Orchestrator queries `IdentityRegistry.sol` (ERC-721 AgentIDs) onchain.
- **x402 HTTP Micropayments**: Specialist agents respond with **HTTP 402 Payment Required** containing pricing and payment instructions.
- **EIP-3009 Gasless Payments**: Orchestrator generates signed `transferWithAuthorization` payloads in USDC without manual wallet popups.
- **Onchain Trust Loop**: `PaymentSettlement.sol` verifies signature & settles payment onchain; `ReputationRegistry.sol` cross-checks payment transaction hashes to issue verified reputation feedback.

---

### 5. How We Built It (Tech Stack)

#### Smart Contracts (`Solidity 0.8.24` / Cancun EVM)
- **`TestUSDC.sol`**: ERC-20 token (6 decimals) supporting EIP-3009 (`transferWithAuthorization`).
- **`IdentityRegistry.sol`**: ERC-721 contract registering agent identity, service endpoints, and capabilities.
- **`PaymentSettlement.sol`**: Onchain settlement engine validating signatures and emitting `PaymentSettled` events.
- **`ReputationRegistry.sol`**: Manages onchain trust scores linked directly to verified payment settlement tx hashes.

#### Backend & Agent Services
- **Python FastAPI Orchestrator**: Handles task decomposition, discovery, EIP-3009 signing, and real-time SSE progress streaming.
- **Node.js / Express Specialist Agents**:
  - `specialist-summarizer` (Port 4001): x402 text summarization
  - `specialist-translator` (Port 4002): x402 text translation
  - `specialist-risk-scorer` & `specialist-gas-timing`

#### Frontend
- **Next.js 14 / React & Tailwind CSS**: Interactive dashboard with real-time SSE task streaming, onchain agent registry viewer, reputation score meters, and wallet devnet indicator.

#### Network & Infrastructure
- **Avalanche Subnet-EVM / Hardhat Devnet** (Chain ID: `99999` / Fuji `43113`).

---

### 6. Key Features
- ⚡ **Zero-Human Transaction Loop**: Completely automated machine-to-machine payments.
- 🔐 **x402 Protocol Implementation**: Extends standard HTTP 402 status codes into structured crypto micropayments.
- 🛡️ **Sybil-Resistant Onchain Reputation**: Feedback cannot be posted without providing a valid settlement transaction hash.
- 📊 **Real-time SSE Dashboard**: Live visual breakdown of decomposition, discovery, payment verification, execution, and feedback recording.

---

### 7. Challenges We Ran Into
1. **Async Nonce & Signature Verification**: Ensuring EIP-3009 authorizations execute safely under concurrent agent task execution.
2. **Preventing Fake Reputation Inflation**: Linking `ReputationRegistry` feedback directly to verified `PaymentSettlement` transaction hashes so agents cannot self-inflate ratings.
3. **Low-Latency Streaming**: Streaming Python FastAPI Server-Sent Events (SSE) directly to Next.js while managing background blockchain transaction confirmations.

---

### 8. Quick Start / How to Run Locally

```bash
# 1. Install dependencies
npm install
pip install -r services/orchestrator/requirements.txt

# 2. Start full local devnet stack (Contracts + Agents + Orchestrator + Frontend)
npm run dev:all
```
- Frontend UI: `http://localhost:3000`
- Orchestrator SSE API: `http://localhost:5000`

---

## 📹 Video Demo Script & Steps

1. Open **http://localhost:3000** and check the top banner (**Chain ID: 99999**, **RPC Connected**).
2. View **Agent Registry** tab to see registered Summarizer (#5) and Translator (#6) agents with onchain reputation scores.
3. Enter task: `"Summarize and translate: Autonomous agents pay each other onchain via x402 micropayments."`
4. Click **Run Task** and observe:
   - `[decompose]` Subtasks generated.
   - `[discover]` Querying `IdentityRegistry.getAllAgents()`.
   - `[pay]` HTTP 402 challenge → EIP-3009 payment signed & settled onchain.
   - `[feedback]` Onchain reputation updated with verified tx hash.
