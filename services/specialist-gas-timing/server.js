import { createPublicClient, http, formatGwei } from "viem";
import { avalanche, avalancheFuji } from "viem/chains";
import { createAgentServer } from "../../shared/agent-server.js";

const FUJI_RPC = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
const MAINNET_RPC = process.env.AVAX_RPC_URL || "https://api.avax.network/ext/bc/C/rpc";

const gasHistory = [];
const HISTORY_MAX = 20;

function getClient(network) {
  if (network === "avalanche-c-chain" || network === "mainnet") {
    return createPublicClient({ chain: avalanche, transport: http(MAINNET_RPC) });
  }
  return createPublicClient({ chain: avalancheFuji, transport: http(FUJI_RPC) });
}

async function fetchDefiLlamaContext() {
  try {
    const resp = await fetch("https://api.llama.fi/v2/chains", { signal: AbortSignal.timeout(6000) });
    if (!resp.ok) return null;
    const chains = await resp.json();
    const avax = chains.find((c) =>
      c.name?.toLowerCase().includes("avalanche") && !c.name?.toLowerCase().includes("evm"),
    ) || chains.find((c) => c.gecko_id === "avalanche-2" || c.tokenSymbol === "AVAX");
    if (!avax) return null;
    const tvl = avax.tvl ?? 0;
    const change = avax.change_1d ?? avax.change1d ?? null;
    return {
      tvlUSD: tvl,
      tvlChange24hPct: change,
      note: change != null
        ? `Avalanche TVL is ${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)}% in the last 24h ($${Math.round(tvl).toLocaleString()} total).`
        : `Avalanche TVL: $${Math.round(tvl).toLocaleString()}.`,
    };
  } catch {
    return null;
  }
}

async function getGasRecommendation(network = "avalanche-fuji") {
  const client = getClient(network);
  const gasPrice = await client.getGasPrice();
  const gwei = parseFloat(formatGwei(gasPrice));

  let feeHistory = null;
  try {
    const latest = await client.getBlockNumber();
    feeHistory = await client.request({
      method: "eth_feeHistory",
      params: ["0x4", `0x${latest.toString(16)}`, [25, 50, 75]],
    });
  } catch {
    /* optional */
  }

  gasHistory.push({ ts: Date.now(), gwei });
  if (gasHistory.length > HISTORY_MAX) gasHistory.shift();

  let trend = "stable";
  if (gasHistory.length >= 3) {
    const recent = gasHistory.slice(-3).map((h) => h.gwei);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const latest = recent[recent.length - 1];
    if (latest > avg * 1.1) trend = "rising";
    else if (latest < avg * 0.9) trend = "falling";
  }

  let recommendation = "transact now";
  let confidenceNote = "Gas is within normal range for Avalanche.";

  if (trend === "rising" && gwei > 30) {
    recommendation = "wait — gas spike, likely temporary";
    confidenceNote = "Gas is trending up; consider waiting 5-10 minutes.";
  } else if (trend === "falling") {
    recommendation = "wait — gas trending down";
    confidenceNote = "Gas fees are decreasing; waiting may save costs.";
  } else if (gwei < 25) {
    recommendation = "transact now";
    confidenceNote = "Current gas is low — good time to transact.";
  }

  const llama = await fetchDefiLlamaContext();

  return {
    currentGasPriceGwei: gwei.toFixed(2),
    trend,
    recommendation,
    confidenceNote,
    network,
    feeHistorySample: feeHistory ? feeHistory.baseFeePerGas?.length : null,
    avalancheTvlUSD: llama?.tvlUSD ?? null,
    avalancheTvlChange24hPct: llama?.tvlChange24hPct ?? null,
    tvlContext: llama?.note ?? null,
    dataSource: llama
      ? "Avalanche RPC (eth_gasPrice, eth_feeHistory) + DefiLlama"
      : "Avalanche RPC (eth_gasPrice)",
    sampledAt: new Date().toISOString(),
  };
}

const { start } = createAgentServer({
  skill: "gas-timing",
  name: "Gas Price & Transaction Timing Agent",
  description:
    "Polls live gas prices on Avalanche via RPC (eth_gasPrice / eth_feeHistory) and recommends optimal transaction timing; optional DefiLlama TVL context.",
  priceUSDC: "0.01",
  port: parseInt(process.env.GAS_TIMING_PORT || "4003", 10),
  privateKeyEnv: "AGENT_GAS_TIMING_PRIVATE_KEY",
  routePath: "/gas-recommendation",
  handler: async (body) => getGasRecommendation(body.network || "avalanche-fuji"),
});

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
