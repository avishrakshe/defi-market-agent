export type StrategyType = "Aave" | "Curve" | "Yearn" | "RWA" | "AI";

export type Strategy = {
  id: string;
  name: string;
  type: StrategyType;
  description: string;
  apy: number;
  tvl: string;
  riskScore: number;
  audited: boolean;
  minInvestment: number;
  composition: string;
  trend: number[];
  performance: { label: string; value: string }[];
  contractAddress: string;
};

export const strategies: Strategy[] = [
  {
    id: "aave-usdc-boost",
    name: "Aave USDC Yield Boost",
    type: "Aave",
    description: "A concentrated stablecoin strategy that rotates liquidity across the strongest Aave lending markets on Avalanche.",
    apy: 16.8,
    tvl: "$84M",
    riskScore: 24,
    audited: true,
    minInvestment: 100,
    composition: "60% Aave USDC, 25% Aave USDT, 15% liquidity reserve",
    trend: [11.4, 13.2, 14.8, 15.7, 16.8],
    performance: [
      { label: "30d", value: "+7.3%" },
      { label: "90d", value: "+18.4%" },
      { label: "1y", value: "+29.1%" },
    ],
    contractAddress: "0xAave...123",
  },
  {
    id: "curve-stable-surge",
    name: "Curve Stable Surge",
    type: "Curve",
    description: "Low-volatility farming across stable liquidity pools with compounded reward harvesting.",
    apy: 14.2,
    tvl: "$61M",
    riskScore: 31,
    audited: true,
    minInvestment: 250,
    composition: "45% Curve USDC/USDT, 35% Curve USDt/DAI, 20% reward reserve",
    trend: [10.1, 11.5, 12.7, 13.9, 14.2],
    performance: [
      { label: "30d", value: "+6.1%" },
      { label: "90d", value: "+16.2%" },
      { label: "1y", value: "+24.8%" },
    ],
    contractAddress: "0xCurve...234",
  },
  {
    id: "yearn-rwa-hedged",
    name: "Yearn RWA Hedged Vault",
    type: "Yearn",
    description: "A cross-asset vault that pairs treasury exposure with protected upside from Yearn automation.",
    apy: 18.4,
    tvl: "$119M",
    riskScore: 42,
    audited: true,
    minInvestment: 500,
    composition: "40% Yearn vaults, 35% RWA notes, 25% cash buffer",
    trend: [12.6, 14.1, 15.8, 17.2, 18.4],
    performance: [
      { label: "30d", value: "+8.8%" },
      { label: "90d", value: "+21.2%" },
      { label: "1y", value: "+33.7%" },
    ],
    contractAddress: "0xYearn...345",
  },
  {
    id: "treasury-rwa-alpha",
    name: "Treasury RWA Alpha",
    type: "RWA",
    description: "Institutional-grade private credit exposure wrapped in a public marketplace for verified investors.",
    apy: 12.9,
    tvl: "$38M",
    riskScore: 18,
    audited: true,
    minInvestment: 1000,
    composition: "70% private credit notes, 20% treasury bills, 10% reserve",
    trend: [9.8, 10.8, 11.4, 12.1, 12.9],
    performance: [
      { label: "30d", value: "+4.2%" },
      { label: "90d", value: "+11.9%" },
      { label: "1y", value: "+16.8%" },
    ],
    contractAddress: "0xRWA...456",
  },
  {
    id: "ai-momentum-index",
    name: "AI Momentum Index",
    type: "AI",
    description: "A rules-based strategy that rebalances toward the strongest on-chain momentum signals each week.",
    apy: 21.1,
    tvl: "$27M",
    riskScore: 68,
    audited: false,
    minInvestment: 250,
    composition: "50% momentum basket, 30% trend filters, 20% cash management",
    trend: [13.7, 15.4, 17.2, 19.1, 21.1],
    performance: [
      { label: "30d", value: "+10.4%" },
      { label: "90d", value: "+24.6%" },
      { label: "1y", value: "+39.8%" },
    ],
    contractAddress: "0xAI...567",
  },
  {
    id: "aave-eth-hedged",
    name: "Aave ETH Hedged",
    type: "Aave",
    description: "A high-conviction ETH strategy with dynamic hedging overlays for better drawdown control.",
    apy: 19.3,
    tvl: "$92M",
    riskScore: 57,
    audited: true,
    minInvestment: 300,
    composition: "55% Aave ETH, 25% hedged reserve, 20% stable yield",
    trend: [12.4, 14.6, 16.8, 18.2, 19.3],
    performance: [
      { label: "30d", value: "+9.1%" },
      { label: "90d", value: "+22.9%" },
      { label: "1y", value: "+31.4%" },
    ],
    contractAddress: "0xAave...789",
  },
];

export const portfolioPositions = [
  { strategy: "Aave USDC Yield Boost", amount: "$12,400", earnings: "$2,180", apy: "16.8%" },
  { strategy: "Treasury RWA Alpha", amount: "$8,950", earnings: "$675", apy: "12.9%" },
  { strategy: "Curve Stable Surge", amount: "$6,300", earnings: "$490", apy: "14.2%" },
];
