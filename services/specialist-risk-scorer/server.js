import { createAgentServer } from "../../shared/agent-server.js";
import { analyzeToken } from "./risk-engine.js";

const { start } = createAgentServer({
  skill: "token-risk-score",
  name: "Token Risk Scorer",
  description:
    "Scores token risk 0-100 using onchain RPC checks (ownership, mint/pause/blacklist, holder concentration), " +
    "DexScreener liquidity/pair age, and CoinGecko listing data.",
  priceUSDC: "0.03",
  port: parseInt(process.env.RISK_SCORER_PORT || "4002", 10),
  privateKeyEnv: "AGENT_RISK_SCORER_PRIVATE_KEY",
  routePath: "/score-token",
  handler: async (body) => {
    const tokenAddress = body.tokenAddress;
    const network = body.network || "mainnet";
    if (!tokenAddress || !/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
      throw new Error("tokenAddress required (0x...)");
    }
    return analyzeToken(tokenAddress, network);
  },
});

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
