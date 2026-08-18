"use client";

import Link from "next/link";
import { portfolioPositions } from "@/lib/marketplace-data";

export default function PortfolioPage() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f8f5_0%,#f4f4ee_100%)]">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-8">
        <Link href="/" className="text-lg font-semibold text-neutral-900">DeFi Market Manager</Link>
        <div className="flex items-center gap-3 text-sm text-neutral-600">
          <Link href="/marketplace" className="hover:text-black">Marketplace</Link>
          <Link href="/portfolio" className="rounded-full bg-black px-4 py-2 text-white">Portfolio</Link>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 pb-16 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-4">
          {[
            { label: "Total invested", value: "$27,650", hint: "Across 3 strategies" },
            { label: "Total earnings", value: "$3,345", hint: "+12.1%" },
            { label: "Current APY", value: "16.9%", hint: "Blended" },
            { label: "Risk score", value: "6/10", hint: "Balanced" },
          ].map((item) => (
            <div key={item.label} className="rounded-[28px] border border-neutral-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-neutral-500">{item.label}</p>
              <p className="mt-3 text-3xl font-semibold text-neutral-900">{item.value}</p>
              <p className="mt-2 text-sm text-neutral-500">{item.hint}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[32px] border border-neutral-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold text-neutral-900">Positions</h2>
            <div className="mt-6 overflow-hidden rounded-2xl border border-neutral-200">
              <table className="min-w-full divide-y divide-neutral-200 text-sm">
                <thead className="bg-neutral-50 text-left text-neutral-600">
                  <tr>
                    <th className="px-4 py-3 font-medium">Strategy</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Earnings</th>
                    <th className="px-4 py-3 font-medium">APY</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 bg-white">
                  {portfolioPositions.map((position) => (
                    <tr key={position.strategy}>
                      <td className="px-4 py-3 font-medium text-neutral-900">{position.strategy}</td>
                      <td className="px-4 py-3 text-neutral-600">{position.amount}</td>
                      <td className="px-4 py-3 text-emerald-600">{position.earnings}</td>
                      <td className="px-4 py-3 text-neutral-600">{position.apy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-[32px] border border-neutral-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold text-neutral-900">Portfolio insight</h2>
            <p className="mt-3 text-sm leading-7 text-neutral-600">Your portfolio is diversified across three low-correlation strategies. Consider adding a lower-volatility RWA allocation if you want smoother exposure.</p>
            <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
              <div className="flex items-center justify-between"><span>Highest concentration</span><span className="font-semibold text-neutral-900">35% Aave</span></div>
              <div className="mt-2 flex items-center justify-between"><span>Private settlement</span><span className="font-semibold text-neutral-900">3 positions</span></div>
              <div className="mt-2 flex items-center justify-between"><span>Recommendation</span><span className="font-semibold text-neutral-900">Add RWA</span></div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
