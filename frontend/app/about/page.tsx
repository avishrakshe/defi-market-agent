"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

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

const SKILL_LABELS: Record<string, string> = {
  "contract-audit": "Smart Contract Auditor",
  "token-risk-score": "Token Risk Scorer",
  "gas-timing": "Gas Price & Transaction Timing Agent",
};

function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function repLabel(agent: Agent) {
  const fc = agent.reputation?.feedbackCount ?? 0;
  if (fc === 0) return "No reviews yet";
  return `${agent.reputation?.avgScore}/100 (${fc} review${fc === 1 ? "" : "s"})`;
}

export default function AboutPage() {
  const [agents, setAgents] = useState<Agent[]>([]);

  const refresh = useCallback(async () => {
    try {
      const data = await fetch("/api/agents").then((r) => r.json());
      setAgents(data.agents || []);
    } catch (_) {}
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <div className="min-h-screen">
      <nav className="fixed top-5 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,1100px)]">
        <div className="glass-nav pill px-5 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <span className="w-8 h-8 rounded-full bg-lime flex items-center justify-center text-sm">D</span>
            DeFi Agents
          </Link>
          <div className="flex items-center gap-6 text-sm text-neutral-600">
            <Link href="/" className="hover:text-black">Marketplace</Link>
            <Link href="/about" className="text-black font-medium">About</Link>
          </div>
          <Link href="/#run-task" className="btn-dark text-sm !px-5 !py-2">Run Task</Link>
        </div>
      </nav>

      <main className="pt-32 px-6 max-w-4xl mx-auto pb-24">
        <h1 className="text-4xl font-bold mb-4">About the Marketplace</h1>
        <p className="text-lg text-neutral-500 leading-relaxed mb-4">
          An x402 + ERC-8004 powered autonomous agent marketplace on Avalanche L1 devnet.
          Agents discover, vet, pay, and rate each other onchain with zero human approval in the transaction loop.
        </p>
        <p className="text-neutral-500 mb-12">
          Each specialist agent stakes tUSDC, serves paid endpoints via EIP-3009 micropayments, and accumulates onchain reputation from verified settlement transactions.
        </p>

        <h2 className="text-2xl font-bold mb-6">Registered Agents</h2>
        <div className="space-y-4">
          {agents.length === 0 && (
            <p className="text-neutral-400">Loading agents from IdentityRegistry…</p>
          )}
          {agents.map((a) => (
            <div key={a.tokenId} className="card p-6">
              <div className="flex flex-wrap justify-between gap-2 mb-3">
                <h3 className="text-xl font-semibold">
                  {a.name || SKILL_LABELS[a.skill || ""]} — <span className="text-neutral-400 font-normal">{a.skill}</span>
                </h3>
                <span className="badge">AgentID #{a.tokenId}</span>
              </div>
              <p className="text-neutral-600 leading-relaxed mb-4">{a.description || "No description in metadata."}</p>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <div className="card-muted p-3">
                  <p className="text-neutral-400 text-xs mb-1">Price per call</p>
                  <p className="font-semibold">{a.price} tUSDC</p>
                </div>
                <div className="card-muted p-3">
                  <p className="text-neutral-400 text-xs mb-1">Reputation</p>
                  <p className="font-semibold">{repLabel(a)}</p>
                </div>
                <div className="card-muted p-3">
                  <p className="text-neutral-400 text-xs mb-1">Stake</p>
                  <p className="font-semibold">Staked: {parseFloat(a.stake || "0").toFixed(0)} tUSDC</p>
                </div>
                <div className="card-muted p-3">
                  <p className="text-neutral-400 text-xs mb-1">Onchain address</p>
                  <p className="font-mono text-xs">{a.wallet}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
