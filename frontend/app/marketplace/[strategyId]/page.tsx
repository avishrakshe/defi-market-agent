"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { StrategyChart } from "@/components/StrategyChart";
import { RiskMeter } from "@/components/RiskMeter";
import { strategies } from "@/lib/marketplace-data";
import { useParams } from "next/navigation";

export default function StrategyDetailPage() {
  const params = useParams<{ strategyId: string }>();
  const strategy = useMemo(() => strategies.find((item) => item.id === params?.strategyId), [params?.strategyId]);
  const [step, setStep] = useState(1);
  const [investment, setInvestment] = useState(2500);

  if (!strategy) {
    return <div className="px-6 py-20 text-center text-neutral-600">Strategy not found.</div>;
  }

  const annualReturn = (strategy.apy / 100) * investment;
  const privateSettlement = investment > 100000;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f8f5_0%,#f4f4ee_100%)]">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
        <Link href="/" className="text-lg font-semibold text-neutral-900">DeFi Market Manager</Link>
        <Link href="/marketplace" className="rounded-full bg-black px-4 py-2 text-white">Back to marketplace</Link>
      </nav>

      <main className="mx-auto grid max-w-7xl gap-8 px-6 pb-16 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
        <section className="space-y-6">
          <div className="rounded-[32px] border border-neutral-200 bg-white p-8 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700">{strategy.type}</span>
              {strategy.audited ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">Audited</span> : <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">Pending audit</span>}
            </div>
            <h1 className="mt-4 text-4xl font-semibold text-neutral-900">{strategy.name}</h1>
            <p className="mt-4 text-lg leading-8 text-neutral-600">{strategy.description}</p>
          </div>

          <div className="rounded-[32px] border border-neutral-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold text-neutral-900">Historical APY</h2>
            <p className="mt-2 text-sm text-neutral-500">A rolling view of the strategy’s recent performance.</p>
            <div className="mt-6">
              <StrategyChart data={strategy.trend} />
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-[32px] border border-neutral-200 bg-white p-8 shadow-sm">
              <h3 className="text-xl font-semibold text-neutral-900">Risk breakdown</h3>
              <div className="mt-6">
                <RiskMeter riskScore={strategy.riskScore} />
              </div>
            </div>
            <div className="rounded-[32px] border border-neutral-200 bg-white p-8 shadow-sm">
              <h3 className="text-xl font-semibold text-neutral-900">Strategy composition</h3>
              <p className="mt-3 text-sm leading-7 text-neutral-600">{strategy.composition}</p>
            </div>
          </div>
        </section>

        <aside className="space-y-6">
          <div className="rounded-[32px] border border-neutral-200 bg-white p-8 shadow-sm">
            <p className="section-title">Summary</p>
            <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-4xl font-semibold text-emerald-600">{strategy.apy.toFixed(1)}%</p>
                <p className="text-sm text-neutral-500">Current APY</p>
              </div>
              <div className="text-right">
                <p className="text-xl font-semibold text-neutral-900">{strategy.tvl}</p>
                <p className="text-sm text-neutral-500">TVL</p>
              </div>
            </div>

            <div className="mt-6 space-y-3 text-sm text-neutral-600">
              <div className="flex items-center justify-between rounded-2xl bg-neutral-50 px-4 py-3"><span>Min investment</span><span className="font-semibold text-neutral-900">${strategy.minInvestment}</span></div>
              <div className="flex items-center justify-between rounded-2xl bg-neutral-50 px-4 py-3"><span>Risk score</span><span className="font-semibold text-neutral-900">{strategy.riskScore}/100</span></div>
              <div className="flex items-center justify-between rounded-2xl bg-neutral-50 px-4 py-3"><span>Audit status</span><span className="font-semibold text-neutral-900">{strategy.audited ? "Verified" : "Pending"}</span></div>
            </div>

            <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
              Annualized return estimate for ${investment.toLocaleString()}: <span className="font-semibold">${annualReturn.toFixed(0)}</span>
            </div>

            <button onClick={() => setStep(2)} className="btn-lime mt-6 w-full">Invest now</button>
          </div>

          <div className="rounded-[32px] border border-neutral-200 bg-white p-8 shadow-sm">
            <p className="section-title">Investment flow</p>
            <AnimatePresence mode="wait">
              {step === 1 ? (
                <motion.div key="step-1" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mt-4 space-y-4">
                  <label className="block text-sm font-medium text-neutral-700">Amount</label>
                  <input type="number" value={investment} onChange={(e) => setInvestment(Number(e.target.value))} className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm" />
                  <input type="range" min="100" max="250000" step="100" value={investment} onChange={(e) => setInvestment(Number(e.target.value))} className="w-full accent-lime-500" />
                  <div className="rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-600">
                    <div>Minimum investment: ${strategy.minInvestment}</div>
                    <div className="mt-2">Estimated gas: ~0.002 AVAX</div>
                    {privateSettlement && <div className="mt-2 font-semibold text-amber-700">Private settlement (eERC) enabled for this amount.</div>}
                  </div>
                  <button onClick={() => setStep(2)} className="btn-dark w-full">Review & confirm</button>
                </motion.div>
              ) : (
                <motion.div key="step-2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="mt-4 space-y-4">
                  <div className="rounded-2xl bg-neutral-50 p-4 text-sm text-neutral-600">
                    <div className="flex items-center justify-between"><span>Strategy</span><span className="font-semibold text-neutral-900">{strategy.name}</span></div>
                    <div className="mt-2 flex items-center justify-between"><span>APY</span><span className="font-semibold text-neutral-900">{strategy.apy.toFixed(1)}%</span></div>
                    <div className="mt-2 flex items-center justify-between"><span>Amount</span><span className="font-semibold text-neutral-900">${investment.toLocaleString()}</span></div>
                    {privateSettlement && <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-800">Private settlement via eERC keeps the amount encrypted on-chain.</div>}
                  </div>
                  <button onClick={() => setStep(3)} className="btn-lime w-full">Confirm investment</button>
                </motion.div>
              )}
            </AnimatePresence>
            {step === 3 && (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                Investment confirmed. The transaction is now visible on the Avalanche Fuji explorer.
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
