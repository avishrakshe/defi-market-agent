"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { Strategy } from "@/lib/marketplace-data";

function typeIcon(type: Strategy["type"]) {
  switch (type) {
    case "Aave":
      return "⚡";
    case "Curve":
      return "⛓";
    case "Yearn":
      return "🧠";
    case "RWA":
      return "🏦";
    default:
      return "🤖";
  }
}

export function StrategyCard({ strategy }: { strategy: Strategy }) {
  return (
    <motion.article
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ duration: 0.2 }}
      className="card p-6 flex h-full flex-col gap-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-neutral-500">
            <span className="text-lg">{typeIcon(strategy.type)}</span>
            <span>{strategy.type}</span>
          </div>
          <h3 className="text-xl font-semibold text-neutral-900">{strategy.name}</h3>
        </div>
        {strategy.audited ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Audited</span> : <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Reviewing</span>}
      </div>

      <p className="text-sm leading-6 text-neutral-600">{strategy.description}</p>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-3xl font-semibold text-emerald-600">{strategy.apy.toFixed(1)}%</p>
          <p className="text-sm text-neutral-500">Projected APY</p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-neutral-900">{strategy.tvl}</p>
          <p className="text-sm text-neutral-500">TVL</p>
        </div>
      </div>

      <div className="h-2 rounded-full bg-neutral-100">
        <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-400" style={{ width: `${Math.min(strategy.riskScore, 100)}%` }} />
      </div>

      <div className="mt-auto flex items-center justify-between text-sm text-neutral-500">
        <span>Min invest ${strategy.minInvestment}</span>
        <Link href={`/marketplace/${strategy.id}`} className="font-semibold text-black hover:text-emerald-600">
          View Details →
        </Link>
      </div>
    </motion.article>
  );
}
