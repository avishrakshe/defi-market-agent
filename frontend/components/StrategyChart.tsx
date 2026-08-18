"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type StrategyChartProps = {
  data: number[];
};

const labels = ["Week 1", "Week 2", "Week 3", "Week 4", "Month"];

export function StrategyChart({ data }: StrategyChartProps) {
  const series = data.map((value, index) => ({ name: labels[index], value }));

  return (
    <div className="h-64 rounded-3xl border border-neutral-200 bg-white p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series}>
          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#6b7280", fontSize: 12 }} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#6b7280", fontSize: 12 }} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke="#c8f542" strokeWidth={3} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
