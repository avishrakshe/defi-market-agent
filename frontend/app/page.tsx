"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { WalletBar, shortAddr } from "@/components/WalletBar";
import { UserWalletActions } from "@/components/UserWalletActions";
import { buildEip3009TypedData, randomNonce, signatureToAuth, type PaymentAuth } from "@/lib/payments";

type Agent = {
  tokenId: number;
  wallet: string;
  name?: string;
  skill?: string;
  description?: string;
  price?: string;
  reputation?: { avgScore: number; feedbackCount: number };
  stake?: string;
};

type Payment = { from: string; to: string; amount: string; txHash: string };
type StepLog = { phase: string; message?: string; [key: string]: unknown };
type OrchWallet = { address?: string; usdcBalance?: number; lowBalance?: boolean; spendCap?: number };

const ORCHESTRATOR = process.env.NEXT_PUBLIC_ORCHESTRATOR_URL || "http://localhost:5000";

const EXAMPLE_PROMPTS = [
  "Is token 0xd00ae084303577FA9DDB4Ee0e131e3fb38d0ACBB safe, audit contract 0xd00ae084303577FA9DDB4Ee0e131e3fb38d0ACBB, and tell me if gas is good right now on Avalanche.",
  "Check token 0xd00ae084303577FA9DDB4Ee0e131e3fb38d0ACBB for risk and tell me if gas is good on Avalanche.",
  "Audit contract 0xd00ae084303577FA9DDB4Ee0e131e3fb38d0ACBB for vulnerabilities and check current gas timing.",
];

const SKILL_LABELS: Record<string, string> = {
  "contract-audit": "Smart Contract Auditor",
  "token-risk-score": "Token Risk Scorer",
  "gas-timing": "Gas & Timing Agent",
};

function txLink(hash: string) {
  return `${process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:9650"}#tx=${hash}`;
}

function repLabel(agent: Agent) {
  const fc = agent.reputation?.feedbackCount ?? 0;
  if (fc === 0) return "No reviews yet";
  return `${agent.reputation?.avgScore} avg · ${fc} review${fc === 1 ? "" : "s"}`;
}

function ReputationChart({ agents }: { agents: Agent[] }) {
  const bars = agents.slice(0, 3);
  if (!bars.length) return <div className="h-40 flex items-center justify-center text-neutral-400 text-sm">Start DeFi agents to see scores</div>;

  return (
    <div className="flex items-end gap-4 h-40 px-2">
      {bars.map((a, i) => {
        const score = a.reputation?.feedbackCount ? (a.reputation.avgScore || 0) : 0;
        const h = Math.max(12, score);
        return (
          <div key={a.tokenId} className="flex-1 flex flex-col items-center gap-2">
            <span className="text-xs font-semibold text-neutral-500">{a.reputation?.feedbackCount ? score : "—"}</span>
            <div className="w-full rounded-t-xl" style={{
              height: `${h}%`,
              background: i === 0 ? "linear-gradient(180deg, #c8f542, #a8d632)" : "linear-gradient(180deg, #e5e7eb, #d1d5db)",
            }} />
            <span className="text-[10px] text-neutral-400 truncate w-full text-center">{SKILL_LABELS[a.skill || ""] || a.skill}</span>
          </div>
        );
      })}
    </div>
  );
}

async function consumeSse(
  resp: Response,
  onEvent: (event: string, parsed: Record<string, unknown>) => void,
) {
  const reader = resp.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (reader) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    for (const part of buffer.split("\n\n").slice(0, -1)) {
      const lines = part.split("\n");
      let event = "message", data = "";
      for (const line of lines) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data = line.slice(5).trim();
      }
      if (!data) continue;
      onEvent(event, JSON.parse(data));
    }
    buffer = buffer.split("\n\n").pop() || "";
  }
}

export default function Home() {
  const { address, isConnected } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [status, setStatus] = useState<{ chainId?: number; connected?: boolean }>({});
  const [orchWallet, setOrchWallet] = useState<OrchWallet>({});
  const [agents, setAgents] = useState<Agent[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [task, setTask] = useState(EXAMPLE_PROMPTS[0]);
  const [running, setRunning] = useState(false);
  const [useUserWallet, setUseUserWallet] = useState(false);
  const [fauceting, setFauceting] = useState(false);
  const [steps, setSteps] = useState<StepLog[]>([]);
  const [finalAnswer, setFinalAnswer] = useState<string | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const payingWith = useUserWallet && isConnected && address
    ? `Your wallet (${shortAddr(address)})`
    : `Orchestrator wallet (${orchWallet.address ? shortAddr(orchWallet.address) : "…"})`;

  const refresh = useCallback(async () => {
    try {
      const [s, a, p, o] = await Promise.all([
        fetch("/api/status").then((r) => r.json()),
        fetch("/api/agents").then((r) => r.json()),
        fetch("/api/payments").then((r) => r.json()),
        fetch("/api/orchestrator-wallet").then((r) => r.json()),
      ]);
      setStatus(s);
      setAgents(a.agents || []);
      setPayments(p.payments || []);
      if (!o.error) setOrchWallet(o);
    } catch {
      setStatus({ connected: false });
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    progressRef.current?.scrollTo({ top: progressRef.current.scrollHeight, behavior: "smooth" });
  }, [steps]);

  async function faucetOrchestrator() {
    setFauceting(true);
    try {
      await fetch("/api/orchestrator-wallet", { method: "POST" });
      await refresh();
    } finally {
      setFauceting(false);
    }
  }

  async function signUserPayments(): Promise<Record<string, PaymentAuth>> {
    if (!address) throw new Error("Connect wallet first");
    const plan = await fetch("/api/plan-task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task }),
    }).then((r) => r.json());

    const reqs = plan.paymentRequirements || {};
    const userPayments: Record<string, PaymentAuth> = {};

    for (const [skill, info] of Object.entries(reqs) as [string, { payTo: string; priceUSDC?: string; price?: string }][]) {
      const price = parseFloat(info.priceUSDC || info.price || "0.01");
      const value = BigInt(Math.round(price * 1_000_000));
      const nonce = randomNonce();
      const validBefore = Math.floor(Date.now() / 1000) + 3600;
      const typed = buildEip3009TypedData(address, info.payTo, value, nonce, validBefore);
      const signature = await signTypedDataAsync(typed);
      userPayments[skill] = signatureToAuth(address, info.payTo, value, nonce, validBefore, signature);
    }
    return userPayments;
  }

  async function runTask() {
    setRunning(true);
    setSteps([]);
    setFinalAnswer(null);

    try {
      let userPayments: Record<string, PaymentAuth> | undefined;
      const payerMode = useUserWallet && isConnected ? "user" : "orchestrator";

      if (payerMode === "user") {
        setSteps([{ phase: "sign", message: "Sign EIP-3009 payment authorizations in MetaMask…" }]);
        userPayments = await signUserPayments();
        setSteps([{ phase: "sign", message: `Signed ${Object.keys(userPayments).length} payment(s). Running task…` }]);
      }

      const resp = await fetch(`${ORCHESTRATOR}/run-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ task, payerMode, userPayments }),
      });
      if (!resp.ok) throw new Error(`Orchestrator ${resp.status}`);

      await consumeSse(resp, (event, parsed) => {
        if (event === "done") {
          setFinalAnswer((parsed.synthesizedAnswer as string) || null);
        } else if (event === "error") {
          setSteps((s) => [...s, { phase: "error", ...parsed } as StepLog]);
        } else {
          setSteps((s) => [...s, { phase: (parsed.phase as string) || event, ...parsed } as StepLog]);
        }
      });
    } catch (err) {
      setSteps((s) => [...s, { phase: "error", message: String(err) }]);
    } finally {
      setRunning(false);
      refresh();
    }
  }

  const canRun = status.connected && !running && !(useUserWallet && !isConnected);

  return (
    <div className="min-h-screen">
      <nav className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[min(96vw,1200px)]">
        <div className="glass-nav pill px-5 py-3 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg shrink-0">
            <span className="w-8 h-8 rounded-full bg-lime flex items-center justify-center text-sm">D</span>
            DeFi Agents
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm text-neutral-600">
            <a href="#registry" className="hover:text-black">Registry</a>
            <a href="#activity" className="hover:text-black">Activity</a>
            <a href="#wallet" className="hover:text-black">Wallet</a>
            <Link href="/about" className="hover:text-black">About</Link>
          </div>
          <div className="flex items-center gap-3">
            <span className={`hidden sm:flex items-center gap-1.5 text-xs ${status.connected ? "text-emerald-600" : "text-red-500"}`}>
              <span className={`w-2 h-2 rounded-full ${status.connected ? "bg-emerald-500 pulse-dot" : "bg-red-500"}`} />
              {status.connected ? `Devnet ${status.chainId}` : "Offline"}
            </span>
            <WalletBar orch={orchWallet} onFaucetOrch={faucetOrchestrator} fauceting={fauceting} />
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-16 px-6 max-w-6xl mx-auto">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div className="space-y-6 animate-fade-up">
            <div className="flex flex-wrap gap-2">
              <span className="badge">Mode A: Autonomous</span>
              <span className="badge">Mode B: Your Wallet</span>
              <span className="badge">x402 Micropayments</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold leading-[1.1] tracking-tight">
              Agents pay agents.<br />
              <span className="text-neutral-400">No wallet required.</span>
            </h1>
            <p className="text-lg text-neutral-500 max-w-md">
              Run tasks instantly — the orchestrator wallet pays specialists via EIP-3009. Optionally connect MetaMask to pay with your own funds.
            </p>
            <a href="#run-task" className="btn-lime inline-block">Run without connecting</a>
          </div>
          <div className="card-muted p-6 lg:p-8">
            <h3 className="font-semibold text-lg mb-1">Agent Reputation</h3>
            <p className="text-sm text-neutral-500 mb-4">Live onchain feedback scores</p>
            <ReputationChart agents={agents} />
          </div>
        </div>
      </section>

      <section id="registry" className="px-6 max-w-6xl mx-auto pb-12">
        <div className="card p-6 lg:p-8">
          <div className="flex justify-between mb-6">
            <div>
              <p className="section-title mb-1">Onchain Registry</p>
              <h2 className="text-2xl font-bold">Agent Registry</h2>
            </div>
            <span className="text-sm text-neutral-500">{agents.length} DeFi agents</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.length === 0 && (
              <p className="col-span-full text-center text-neutral-400 py-8">
                {status.connected ? "Waiting for DeFi agents to register…" : "Devnet offline — run npm run dev:all"}
              </p>
            )}
            {agents.map((a) => (
              <div key={a.tokenId} className="card-muted p-5">
                <div className="flex justify-between mb-2">
                  <span className="font-semibold">{a.name || SKILL_LABELS[a.skill || ""]}</span>
                  <span className="text-xs bg-lime/20 px-2 py-0.5 rounded-full">#{a.tokenId}</span>
                </div>
                <p className="text-xs text-neutral-400 mb-3">{a.skill} · {shortAddr(a.wallet)}</p>
                <div className="flex justify-between items-end">
                  <div>
                    <p className="text-sm font-medium">{repLabel(a)}</p>
                    <p className="text-xs text-neutral-400 mt-1">Staked: {parseFloat(a.stake || "0").toFixed(0)} tUSDC</p>
                  </div>
                  <p className="font-semibold text-sm">{a.price} tUSDC</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="wallet" className="px-6 max-w-6xl mx-auto pb-12">
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="card p-6">
            <h2 className="text-xl font-bold mb-2">Orchestrator wallet (Mode A)</h2>
            <p className="text-sm text-neutral-500 mb-4">Pays specialists automatically — no user wallet needed.</p>
            <div className="card-muted p-4 text-sm space-y-1 font-mono">
              <p>Address: {orchWallet.address || "—"}</p>
              <p>tUSDC: {orchWallet.usdcBalance != null ? orchWallet.usdcBalance.toFixed(2) : "…"}</p>
              <p>Spend cap: {orchWallet.spendCap ?? 1} tUSDC / session</p>
            </div>
            {orchWallet.lowBalance && (
              <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm">
                <p className="font-medium text-amber-900">Orchestrator wallet balance low — top up via faucet</p>
                <button className="btn-lime text-xs mt-2" onClick={faucetOrchestrator} disabled={fauceting}>
                  {fauceting ? "Topping up…" : "Fund orchestrator (admin)"}
                </button>
              </div>
            )}
          </div>
          <UserWalletActions />
        </div>
      </section>

      <section id="activity" className="px-6 max-w-6xl mx-auto pb-12">
        <div className="card p-6 lg:p-8">
          <h2 className="text-2xl font-bold mb-4">Live Activity</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {payments.length === 0 && <p className="text-neutral-400 text-sm">No payments yet</p>}
            {payments.map((p) => (
              <div key={p.txHash} className="flex justify-between p-3 rounded-2xl bg-neutral-50 text-sm">
                <span>{p.amount} tUSDC · {shortAddr(p.from)} → {shortAddr(p.to)}</span>
                <a className="hash-link" href={txLink(p.txHash)} target="_blank" rel="noreferrer">{p.txHash.slice(0, 12)}…</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="run-task" className="px-6 max-w-6xl mx-auto pb-24">
        <div className="card p-6 lg:p-8 space-y-5">
          <h2 className="text-2xl font-bold">Run a Task</h2>
          <p className="text-xs text-neutral-500 bg-neutral-50 rounded-xl px-3 py-2 inline-block">
            Paying with: <span className="font-semibold text-neutral-800">{payingWith}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((p, i) => (
              <button key={i} onClick={() => setTask(p)} className={`text-xs px-3 py-1.5 rounded-full border ${task === p ? "bg-lime/20 border-lime" : "border-neutral-200"}`}>
                Example {i + 1}
              </button>
            ))}
          </div>
          <textarea className="w-full bg-neutral-50 border border-neutral-200 rounded-2xl p-4 min-h-28 text-sm" value={task} onChange={(e) => setTask(e.target.value)} />
          <label className="flex items-center gap-3 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useUserWallet}
              onChange={(e) => setUseUserWallet(e.target.checked)}
              disabled={!isConnected}
              className="w-4 h-4 accent-lime"
            />
            <span>
              Run task with my wallet
              {!isConnected && <span className="text-neutral-400"> (connect wallet first)</span>}
            </span>
          </label>
          <button className="btn-lime" onClick={runTask} disabled={!canRun}>
            {running ? "Running…" : !status.connected ? "Devnet offline" : useUserWallet && !isConnected ? "Connect wallet" : "Run Task"}
          </button>
          <div className="grid lg:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-sm mb-2">Live progress</h3>
              <div ref={progressRef} className="bg-neutral-50 rounded-2xl p-4 max-h-72 overflow-y-auto font-mono text-xs space-y-2">
                {steps.map((s, i) => (
                  <div key={i} className="border-l-2 border-lime pl-2">
                    <span className="font-semibold">[{s.phase}]</span> {s.message || ""}
                    {typeof s.payerAddress === "string" && (
                      <div className="text-neutral-500">payer: {shortAddr(s.payerAddress)}</div>
                    )}
                    {typeof s.settlementTxHash === "string" && (
                      <div><a className="hash-link" href={txLink(s.settlementTxHash)} target="_blank" rel="noreferrer">pay: {String(s.settlementTxHash).slice(0, 20)}…</a></div>
                    )}
                    {typeof s.feedbackTxHash === "string" && (
                      <div><a className="hash-link" href={txLink(s.feedbackTxHash as string)} target="_blank" rel="noreferrer">feedback: {String(s.feedbackTxHash).slice(0, 20)}…</a></div>
                    )}
                    {s.phase === "error" && typeof s.orchestratorAddress === "string" && (
                      <button className="text-lime-700 underline mt-1" onClick={faucetOrchestrator}>Top up orchestrator faucet</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-2">Synthesized answer</h3>
              <div className="bg-neutral-900 text-neutral-100 rounded-2xl p-5 min-h-72 text-sm leading-relaxed">
                {finalAnswer || <span className="text-neutral-500">Template-built summary from real RPC/Slither data appears here</span>}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
