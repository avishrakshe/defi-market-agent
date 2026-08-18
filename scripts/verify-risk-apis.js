/**
 * Verify FIX 3e: risk scorer returns DexScreener + CoinGecko data for a known AVAX token.
 * Usage: node scripts/verify-risk-apis.js
 */
import { analyzeToken } from "../services/specialist-risk-scorer/risk-engine.js";

const WAVAX = "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7";

async function main() {
  console.log("=== Direct API probes (WAVAX) ===\n");

  const dexResp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${WAVAX}`);
  const dexRaw = await dexResp.json();
  console.log("DexScreener raw pair count:", dexRaw.pairs?.length ?? 0);
  console.log(JSON.stringify(dexRaw.pairs?.slice(0, 1), null, 2));

  const cgResp = await fetch(`https://api.coingecko.com/api/v3/coins/avalanche/contract/${WAVAX.toLowerCase()}`);
  const cgRaw = cgResp.ok ? await cgResp.json() : { error: cgResp.status };
  console.log("\nCoinGecko raw (truncated):");
  console.log(JSON.stringify({
    id: cgRaw.id,
    symbol: cgRaw.symbol,
    market_cap: cgRaw.market_data?.market_cap?.usd,
    price_change_24h: cgRaw.market_data?.price_change_percentage_24h,
  }, null, 2));

  console.log("\n=== analyzeToken / score-token logic (mainnet) ===\n");
  const result = await analyzeToken(WAVAX, "mainnet");

  console.log("Computed risk score:", result.score);
  console.log("liquidityUSD:", result.liquidityUSD);
  console.log("pairAgeHours:", result.pairAgeHours);
  console.log("pairCount:", result.pairCount);
  console.log("listed:", result.listed);
  console.log("marketCap:", result.marketCap);
  console.log("topHolderPct:", result.topHolderPct);
  console.log("subscores:", result.subscores);
  console.log("\nFull agent response JSON:\n", JSON.stringify(result, null, 2));

  const ok =
    result.score != null &&
    result.liquidityUSD != null &&
    result.pairCount > 0 &&
    result.listed === true;

  if (!ok) {
    console.error("\nFAIL: missing expected fields from live APIs");
    process.exit(1);
  }
  console.log("\nPASS: liquidity, pair age, listing status from real DexScreener + CoinGecko");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
