"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StrategyCard } from "@/components/StrategyCard";
import { strategies, type StrategyType } from "@/lib/marketplace-data";

export default function MarketplacePage() {
  const [type, setType] = useState<StrategyType | "All">("All");
  const [minApy, setMinApy] = useState(8);
  const [auditOnly, setAuditOnly] = useState(false);
  const [sort, setSort] = useState("apy");

  const filtered = useMemo(() => {
    const result = strategies.filter((strategy) => {
      const passType = type === "All" || strategy.type === type;
      const passApy = strategy.apy >= minApy;
      const passAudit = !auditOnly || strategy.audited;
      return passType && passApy && passAudit;
    });

    result.sort((a, b) => {
      if (sort === "tvl") return Number(b.tvl.replace(/[^\d.]/g, "")) - Number(a.tvl.replace(/[^\d.]/g, ""));
      if (sort === "risk") return a.riskScore - b.riskScore;
      if (sort === "newest") return b.apy - a.apy;
      return b.apy - a.apy;
    });

    return result;
  }, [auditOnly, minApy, sort, type]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(200,245,66,0.18),_transparent_32%),linear-gradient(180deg,#f8f8f5_0%,#f4f4ee_100%)]">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
        <Link href="/" className="text-lg font-semibold text-neutral-900">DeFi Market Manager</Link>
        <div className="flex items-center gap-3 text-sm text-neutral-600">
          <Link href="/marketplace" className="rounded-full bg-black px-4 py-2 text-white">Marketplace</Link>
          <Link href="/portfolio" className="hover:text-black">Portfolio</Link>
        </div>
      </nav>

      <main className="mx-auto flex max-w-7xl flex-col gap-8 px-6 pb-16 lg:flex-row lg:px-8">
        <aside className="w-full rounded-[32px] border border-neutral-200 bg-white/80 p-6 shadow-sm lg:sticky lg:top-6 lg:w-[320px] lg:self-start">
          <div className="space-y-6">
            <div>
              <p className="section-title">Discover</p>
              <h1 className="mt-2 text-3xl font-semibold text-neutral-900">Explore strategies</h1>
              <p className="mt-3 text-sm leading-6 text-neutral-600">Compare risk-adjusted yields, audit status, and private settlement options in one place.</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">Strategy type</label>
              <select value={type} onChange={(e) => setType(e.target.value as StrategyType | "All")} className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
                <option value="All">All</option>
                <option value="Aave">Aave</option>
                <option value="Curve">Curve</option>
                <option value="Yearn">Yearn</option>
                <option value="RWA">RWA</option>
                <option value="AI">AI</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">Minimum APY</label>
              <input type="range" min="8" max="24" value={minApy} onChange={(e) => setMinApy(Number(e.target.value))} className="w-full accent-lime-500" />
              <div className="mt-2 text-sm text-neutral-500">{minApy}% and above</div>
            </div>

            <label className="flex items-center gap-3 text-sm text-neutral-700">
              <input type="checkbox" checked={auditOnly} onChange={(e) => setAuditOnly(e.target.checked)} />
              Audited strategies only
            </label>

            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700">Sort by</label>
              <select value={sort} onChange={(e) => setSort(e.target.value)} className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm">
                <option value="apy">APY</option>
                <option value="risk">Lower risk first</option>
                <option value="tvl">TVL</option>
                <option value="newest">Newest</option>
              </select>
            </div>
          </div>
        </aside>

        <section className="flex-1">
          <div className="mb-6 flex flex-col gap-3 rounded-[32px] border border-neutral-200 bg-white/80 p-6 shadow-sm sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="section-title">Live market</p>
              <h2 className="text-2xl font-semibold text-neutral-900">{filtered.length} strategies available</h2>
            </div>
            <div className="rounded-full border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm text-neutral-600">Private settlement available for $100k+ investments</div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {filtered.map((strategy) => (
              <StrategyCard key={strategy.id} strategy={strategy} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
