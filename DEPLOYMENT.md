# Deployment Guide

This project is **not a single Vercel app**. It has five runtime pieces:

| Component | Technology | Host on Vercel? |
|-----------|------------|-----------------|
| **Frontend** | Next.js 15 | **Yes** |
| **Orchestrator** | Python FastAPI + SSE | **No** — use Railway, Render, Fly.io, or VPS |
| **3 specialist agents** | Node.js Express | **No** — same as above |
| **Smart contracts** | Solidity on EVM | **No** — deploy to Avalanche Fuji or C-chain |
| **RPC / chain** | Hardhat (local) or public RPC | Local dev only unless you use Fuji/mainnet |

Vercel is ideal for the **UI only**. The orchestrator streams SSE for 30–90 seconds per task, runs Web3 signing, and must stay reachable from the browser — that does not fit Vercel serverless limits.

---

## Recommended public demo architecture

```
                    ┌─────────────────────┐
                    │  Vercel (Next.js)   │  ← users visit your-app.vercel.app
                    └──────────┬──────────┘
                               │ HTTPS
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Orchestrator    │  │ Risk scorer     │  │ Auditor / Gas   │
│ Railway :5000   │  │ Railway :4002   │  │ Railway :4001/3 │
└────────┬────────┘  └────────┬────────┘  └────────┬────────┘
         │                    │                    │
         └────────────────────┼────────────────────┘
                              ▼
                 ┌────────────────────────┐
                 │ Avalanche Fuji RPC     │
                 │ + deployed contracts   │
                 └────────────────────────┘
```

---

## One-click backend (Docker)

For Railway, Render, or a VPS — run all four backend services:

```bash
cp .env.production.example .env   # fill in keys + Fuji RPC
docker compose -f docker-compose.prod.yml up --build
```

Or: `npm run docker:backends`

Expose ports **5000**, **4001–4003** publicly (Railway assigns HTTPS URLs per service).

## Fuji deploy script

```bash
# Fund deployer from https://faucet.avax.network/ first
npm run deploy:fuji
```

Then start backends + Vercel frontend (see steps below).

## Step 0 — Run locally first (sanity check)

```bash
npm install
pip install -r services/orchestrator/requirements.txt
npm run dev:all
```

Open http://localhost:3000 and run a task end-to-end before deploying anything.

---

## Step 1 — Deploy contracts to Avalanche Fuji (public testnet)

Local chainId `99999` only works on your machine. For a public URL you need a **public chain**.

1. Get Fuji AVAX from the [Avalanche faucet](https://faucet.avax.network/).
2. Add your deployer private key to `.env` (never commit it).
3. Point Hardhat at Fuji:

```bash
# In .env for one-time deploy:
RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
CHAIN_ID=43113
```

4. Deploy:

```bash
cd contracts
npx hardhat compile
npx hardhat run scripts/deploy.js --network agentmarket
npx hardhat run scripts/verify-agents.js --network agentmarket
node ../scripts/fund-orchestrator.js
```

5. Commit **`shared/deployed.json`** (addresses + ABIs only — no private keys) so the frontend and agents know contract addresses on Fuji.

6. Update agent metadata URLs: specialist agents register with `http://localhost:4001` etc. For production, re-register agents with public HTTPS URLs (or redeploy agents first, then run `verify-agents.js` again).

---

## Step 2 — Deploy backend services (Railway example)

[Railway](https://railway.app) works well for long-running Node/Python services. Repeat similar steps on [Render](https://render.com) or [Fly.io](https://fly.io).

### 2a. Orchestrator

1. New project → **Deploy from GitHub repo**.
2. Service settings:
   - **Root directory**: leave as repo root
   - **Dockerfile path**: `docker/Dockerfile.orchestrator`
   - **Port**: `5000`
3. **Variables** (from `.env.production.example`):
   - `RPC_URL`, `CHAIN_ID`, `ORCHESTRATOR_PRIVATE_KEY`, `DEV_PRIVATE_KEY`
   - `ORCHESTRATOR_PORT=5000`
4. Deploy → copy public URL, e.g. `https://orchestrator-production.up.railway.app`

### 2b. Each specialist agent (3 services)

Create **three** Railway services from the same repo:

| Service | Dockerfile | Build arg `SERVICE` | Port |
|---------|------------|----------------------|------|
| Auditor | `docker/Dockerfile.agent` | `specialist-auditor` | 4001 |
| Risk scorer | `docker/Dockerfile.agent` | `specialist-risk-scorer` | 4002 |
| Gas timing | `docker/Dockerfile.agent` | `specialist-gas-timing` | 4003 |

Each service needs env vars: `RPC_URL`, `CHAIN_ID`, matching `AGENT_*_PRIVATE_KEY`, and `AUDITOR_PORT` / `RISK_SCORER_PORT` / `GAS_TIMING_PORT`.

After deploy, each agent gets a public URL. Update registration metadata to use those URLs (not localhost).

**Alternative without Docker on Railway:**

- Orchestrator: set start command `pip install -r services/orchestrator/requirements.txt && cd services/orchestrator && python main.py`
- Each agent: `cd services/specialist-auditor && npm install && node server.js`

---

## Step 3 — Deploy frontend to Vercel

### Option A — Vercel Dashboard (easiest)

1. Push the repo to **GitHub**.
2. Go to [vercel.com/new](https://vercel.com/new) → Import repository.
3. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend` ← important
   - **Build Command**: `npm run build` (default)
   - **Install Command**: `npm install` (runs in `frontend/`; parent `shared/` is still in the clone for imports)
4. **Environment variables** (Production):

| Variable | Example |
|----------|---------|
| `NEXT_PUBLIC_ORCHESTRATOR_URL` | `https://your-orchestrator.up.railway.app` |
| `ORCHESTRATOR_URL` | same as above (for API routes) |
| `NEXT_PUBLIC_RPC_URL` | `https://api.avax-test.network/ext/bc/C/rpc` |
| `NEXT_PUBLIC_CHAIN_ID` | `43113` |
| `RPC_URL` | same RPC (server-side API routes) |
| `CHAIN_ID` | `43113` |
| `DEV_PRIVATE_KEY` | deployer key (server `/api/status` only — use a read-only wallet in prod if possible) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | from [WalletConnect Cloud](https://cloud.walletconnect.com) |

5. Click **Deploy**.

6. After deploy, open your site → **Connect Wallet** → add Fuji network (RainbowKit uses `NEXT_PUBLIC_CHAIN_ID` from `shared/deployed.json` at build time — rebuild after changing chain).

### Option B — Vercel CLI

```bash
npm i -g vercel
cd frontend
vercel login
vercel link
vercel env add NEXT_PUBLIC_ORCHESTRATOR_URL
vercel env add NEXT_PUBLIC_RPC_URL
vercel env add NEXT_PUBLIC_CHAIN_ID
vercel env add NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
vercel env add ORCHESTRATOR_URL
vercel env add RPC_URL
vercel env add CHAIN_ID
vercel env add DEV_PRIVATE_KEY
vercel --prod
```

### Vercel monorepo note

The frontend imports `../../shared/deployed.json`. Vercel clones the **full repo** and only sets the working directory to `frontend/`, so that import still works. Do **not** set the Vercel project root to a subfolder that excludes `shared/`.

---

## Step 4 — Wire URLs together

1. **Orchestrator** must allow browser origin — already configured (`allow_origins=["*"]` in `main.py`). Tighten to your Vercel domain in production if you prefer.
2. **Agents** must be reachable from the orchestrator (public HTTPS URLs in agent metadata).
3. **Frontend** `NEXT_PUBLIC_ORCHESTRATOR_URL` must point to the public orchestrator (browser calls `/run-task` directly for SSE).
4. Rebuild Vercel after any env change.

---

## What stays local-only

| Setup | Use case |
|-------|----------|
| `npm run dev:all` + localhost | Development, hackathons, demos on your laptop |
| Hardhat `:9650` + chainId `99999` | Cannot be reached from Vercel or users’ MetaMask remotely |
| Private keys in `.env` | Never put in Vercel public env for client bundles — only `NEXT_PUBLIC_*` are exposed to the browser |

---

## WalletConnect (required for production Connect Wallet)

1. Create a project at https://cloud.walletconnect.com  
2. Add `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` to Vercel  
3. Add your Vercel domain to allowed origins in WalletConnect dashboard  

Without this, RainbowKit may fail outside localhost.

---

## Environment variable cheat sheet

| Variable | Where | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_ORCHESTRATOR_URL` | Vercel | Browser → orchestrator SSE |
| `ORCHESTRATOR_URL` | Vercel | Server API routes proxy |
| `NEXT_PUBLIC_RPC_URL` | Vercel | wagmi / MetaMask chain |
| `NEXT_PUBLIC_CHAIN_ID` | Vercel | Custom devnet or `43113` Fuji |
| `RPC_URL` / `CHAIN_ID` | Railway + Vercel | Onchain reads |
| `ORCHESTRATOR_PRIVATE_KEY` | Railway orchestrator | Mode A autonomous payments |
| `AGENT_*_PRIVATE_KEY` | Railway agents | Agent wallets + x402 receive |

See `.env.production.example` for a full template.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| “Devnet offline” on Vercel | `RPC_URL` wrong or contracts not on that chain |
| Run Task hangs / CORS | Orchestrator URL wrong or not HTTPS |
| MetaMask wrong network | Match `NEXT_PUBLIC_CHAIN_ID` to deployed chain |
| Agents 500 after deploy | Redeploy contracts + restart agents with new `deployed.json` |
| SSE timeout on Vercel | Do **not** proxy SSE through Vercel — call orchestrator URL directly |

---

## Quick reference commands

```bash
# Local full stack
npm run dev:all

# Frontend production build test
cd frontend && npm run build && npm start

# Verify risk APIs (after agents up)
node scripts/verify-risk-apis.js

# Fuji contract deploy
cd contracts && npx hardhat run scripts/deploy.js --network agentmarket
```

---

## Cost estimate (demo tier)

| Service | Typical cost |
|---------|----------------|
| Vercel Hobby | Free |
| Railway (4 services) | ~$5–20/mo credit |
| Avalanche Fuji | Free testnet gas |
| WalletConnect | Free tier |

For a portfolio demo, **Vercel (frontend) + Railway (4 backends) + Fuji** is the simplest path that matches how this repo is built.
