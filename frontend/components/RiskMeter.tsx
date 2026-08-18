"use client";

type RiskMeterProps = {
  riskScore: number;
};

export function RiskMeter({ riskScore }: RiskMeterProps) {
  const tone = riskScore < 35 ? "from-emerald-400 to-lime-400" : riskScore < 65 ? "from-amber-400 to-orange-400" : "from-rose-500 to-red-500";
  const label = riskScore < 35 ? "Low Risk" : riskScore < 65 ? "Medium Risk" : "High Risk";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-600">Risk score</span>
        <span className="font-semibold text-neutral-900">{riskScore}/100</span>
      </div>
      <div className="h-2 rounded-full bg-neutral-200 overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${tone}`} style={{ width: `${Math.min(riskScore, 100)}%` }} />
      </div>
      <div className="text-xs text-neutral-500">{label} · volatility, concentration, and contract risk balanced across the strategy.</div>
    </div>
  );
}
