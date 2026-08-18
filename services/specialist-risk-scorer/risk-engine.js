import { createPublicClient, http, formatUnits, parseAbi, parseAbiItem, zeroAddress } from "viem";
import { avalanche, avalancheFuji } from "viem/chains";

const FUJI_RPC = process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc";
const MAINNET_RPC = process.env.AVAX_RPC_URL || "https://api.avax.network/ext/bc/C/rpc";

const erc20Abi = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function owner() view returns (address)",
  "function balanceOf(address) view returns (uint256)",
  "function paused() view returns (bool)",
  "function decimals() view returns (uint8)",
]);

const transferEvent = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

// Common dangerous selectors in bytecode
const DANGEROUS_SELECTORS = {
  mint: "0x40c10f19",
  pause: "0x8456cb59",
  unpause: "0x3f4ba83a",
  blacklist: "0x537df3b6",
};

function getClient(network) {
  if (network === "mainnet" || network === "avalanche-c-chain") {
    return createPublicClient({ chain: avalanche, transport: http(MAINNET_RPC) });
  }
  return createPublicClient({ chain: avalancheFuji, transport: http(FUJI_RPC) });
}

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

function hasSelector(bytecode, selector) {
  return bytecode?.toLowerCase().includes(selector.slice(2).toLowerCase());
}

async function fetchDexScreener(tokenAddress) {
  try {
    const resp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}`, pairs: [] };
    const data = await resp.json();
    const pairs = data.pairs || [];
    if (!pairs.length) {
      return { ok: true, pairs: [], liquidityUSD: 0, volumeH24: 0, pairCount: 0, pairAgeHours: null };
    }

    const best = pairs.reduce((a, b) => ((a.liquidity?.usd || 0) > (b.liquidity?.usd || 0) ? a : b));
    const liquidityUSD = best.liquidity?.usd ?? 0;
    const volumeH24 = best.volume?.h24 ?? 0;
    const pairCreatedAt = best.pairCreatedAt ? Number(best.pairCreatedAt) : null;
    const pairAgeHours = pairCreatedAt
      ? Math.round((Date.now() - pairCreatedAt) / (1000 * 60 * 60) * 10) / 10
      : null;

    return {
      ok: true,
      raw: data,
      pairs,
      pairCount: pairs.length,
      liquidityUSD,
      volumeH24,
      pairAgeHours,
      bestPair: best.pairAddress,
      dexId: best.dexId,
    };
  } catch (e) {
    return { ok: false, error: String(e), pairs: [] };
  }
}

async function fetchCoinGecko(tokenAddress, network) {
  const platform = network === "mainnet" || network === "avalanche-c-chain" ? "avalanche" : "avalanche";
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${platform}/contract/${tokenAddress.toLowerCase()}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (resp.status === 404) {
      return { ok: true, listed: false, marketCap: null, priceChange24h: null };
    }
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}`, listed: false };
    const data = await resp.json();
    const md = data.market_data || {};
    return {
      ok: true,
      listed: true,
      raw: data,
      name: data.name,
      symbol: data.symbol,
      marketCap: md.market_cap?.usd ?? null,
      priceChange24h: md.price_change_percentage_24h ?? null,
    };
  } catch (e) {
    return { ok: false, error: String(e), listed: false };
  }
}

async function analyzeOnchain(client, tokenAddress) {
  const signals = [];
  let ownerRenounced = false;
  let hasOwner = false;
  let hasPause = false;
  let hasMint = false;
  let hasBlacklist = false;
  let totalSupply = 0n;
  let decimals = 18;
  let topHolderPct = null;
  let topHolder = null;
  let hasBytecode = true;

  try {
    decimals = Number(await client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "decimals" }));
  } catch {
    /* default 18 */
  }

  try {
    totalSupply = await client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "totalSupply" });
    signals.push(`Total supply: ${formatUnits(totalSupply, decimals)}`);
  } catch {
    signals.push("Could not read totalSupply — may not be standard ERC-20");
  }

  try {
    const owner = await client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "owner" });
    hasOwner = true;
    if (owner.toLowerCase() === zeroAddress) {
      ownerRenounced = true;
      signals.push("Ownership renounced (owner is zero address)");
    } else {
      signals.push(`Owner: ${owner} — not renounced`);
      if (totalSupply > 0n) {
        try {
          const ownerBal = await client.readContract({
            address: tokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [owner],
          });
          const pct = Number((ownerBal * 10000n) / totalSupply) / 100;
          if (pct > 0) {
            topHolderPct = pct;
            topHolder = owner;
            signals.push(`Owner holds ${pct.toFixed(1)}% of supply`);
          }
        } catch { /* ignore */ }
      }
    }
  } catch {
    signals.push("No owner() function — likely not Ownable");
  }

  try {
    const paused = await client.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "paused" });
    if (paused) {
      hasPause = true;
      signals.push("Contract is currently paused");
    } else {
      signals.push("pause() callable — centralization risk if owner-controlled");
      hasPause = true;
    }
  } catch {
    signals.push("No pause() detected");
  }

  const code = await client.getBytecode({ address: tokenAddress });
  if (!code || code === "0x") {
    hasBytecode = false;
    signals.push("No contract bytecode at address");
  } else {
    hasMint = hasSelector(code, DANGEROUS_SELECTORS.mint);
    hasBlacklist = hasSelector(code, DANGEROUS_SELECTORS.blacklist);
    if (hasMint) signals.push("mint() selector detected in bytecode");
    if (hasBlacklist) signals.push("blacklist() selector detected in bytecode");
    if (!hasPause && hasSelector(code, DANGEROUS_SELECTORS.pause)) {
      hasPause = true;
      signals.push("pause() selector detected in bytecode");
    }
  }

  if (hasBytecode && totalSupply > 0n && topHolderPct == null) {
    const holder = await analyzeTransferHolders(client, tokenAddress, totalSupply);
    if (holder.topHolderPct != null) {
      topHolderPct = holder.topHolderPct;
      topHolder = holder.topHolder;
      signals.push(`Top holder (Transfer analysis): ${topHolderPct.toFixed(1)}% of supply`);
    }
  }

  return {
    signals,
    ownerRenounced,
    hasOwner,
    hasPause,
    hasMint,
    hasBlacklist,
    hasBytecode,
    totalSupply,
    decimals,
    topHolderPct,
    topHolder,
  };
}

async function analyzeTransferHolders(client, tokenAddress, totalSupply) {
  try {
    const latest = await client.getBlockNumber();
    const fromBlock = latest > 200000n ? latest - 200000n : 0n;
    const logs = await client.getLogs({
      address: tokenAddress,
      event: transferEvent,
      fromBlock,
      toBlock: latest,
    });

    const candidates = new Set();
    for (const log of logs.slice(-500)) {
      const { from, to } = log.args;
      if (from && from !== zeroAddress) candidates.add(from);
      if (to && to !== zeroAddress) candidates.add(to);
    }

    const sample = [...candidates].slice(-40);
    let maxBalance = 0n;
    let maxHolder = null;

    for (const addr of sample) {
      try {
        const bal = await client.readContract({
          address: tokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [addr],
        });
        if (bal > maxBalance) {
          maxBalance = bal;
          maxHolder = addr;
        }
      } catch { /* skip */ }
    }

    if (maxBalance > 0n && totalSupply > 0n) {
      return {
        topHolder: maxHolder,
        topHolderPct: Number((maxBalance * 10000n) / totalSupply) / 100,
      };
    }
  } catch {
    /* RPC may limit log range */
  }
  return { topHolder: null, topHolderPct: null };
}

function scoreOnchain(o) {
  if (!o.hasBytecode) return 5;

  let s = 70;
  if (o.ownerRenounced) s += 20;
  else if (o.hasOwner) s -= 25;
  if (o.hasPause) s -= 20;
  if (o.hasMint) s -= 25;
  if (o.hasBlacklist) s -= 15;
  if (o.topHolderPct != null) {
    if (o.topHolderPct > 50) s -= 30;
    else if (o.topHolderPct > 20) s -= 15;
    else if (o.topHolderPct > 10) s -= 5;
    else s += 5;
  }
  if (o.totalSupply === 0n) s -= 20;

  return clamp(s);
}

function scoreLiquidity(dex) {
  if (!dex.ok || dex.pairCount === 0) return 25;

  let s = 50;
  const liq = dex.liquidityUSD ?? 0;
  if (liq >= 50000) s = 95;
  else if (liq >= 10000) s = 75;
  else if (liq >= 5000) s = 55;
  else s = 15;

  if (dex.pairAgeHours != null) {
    if (dex.pairAgeHours < 24) s = Math.min(s, 25);
    else if (dex.pairAgeHours < 72) s = Math.min(s, 45);
    else if (dex.pairAgeHours > 720) s += 5;
  }

  return clamp(s);
}

function scoreListing(cg) {
  if (!cg.ok) return 40;
  if (!cg.listed) return 30;

  let s = 70;
  if (cg.marketCap != null) {
    if (cg.marketCap >= 100_000_000) s = 95;
    else if (cg.marketCap >= 10_000_000) s = 85;
    else if (cg.marketCap >= 1_000_000) s = 70;
    else s = 50;
  }
  if (cg.priceChange24h != null && cg.priceChange24h < -30) s -= 10;

  return clamp(s);
}

function computeWeightedScore(onchainScore, liquidityScore, listingScore) {
  return Math.round(onchainScore * 0.4 + liquidityScore * 0.35 + listingScore * 0.25);
}

function buildExplanation(onchain, dex, cg, score) {
  const notes = [...onchain.signals];

  if (!dex.ok || dex.pairCount === 0) {
    notes.push("Off-exchange / no liquidity data available on DexScreener");
  } else {
    notes.push(
      `DexScreener: $${Math.round(dex.liquidityUSD).toLocaleString()} liquidity, ` +
      `${dex.pairCount} pair(s), age ${dex.pairAgeHours ?? "unknown"}h`,
    );
    if (dex.liquidityUSD < 5000) notes.push("High risk: liquidity below $5,000");
    if (dex.pairAgeHours != null && dex.pairAgeHours < 24) notes.push("High risk: pair younger than 24 hours");
  }

  if (!cg.ok) {
    notes.push("CoinGecko lookup failed — listing status unknown");
  } else if (!cg.listed) {
    notes.push("Not listed on CoinGecko — lower visibility / higher risk");
  } else {
    notes.push(
      `CoinGecko: listed${cg.marketCap != null ? `, market cap $${Math.round(cg.marketCap).toLocaleString()}` : ""}` +
      (cg.priceChange24h != null ? `, 24h ${cg.priceChange24h.toFixed(1)}%` : ""),
    );
  }

  notes.push(`Weighted score ${score}/100 (onchain 40%, liquidity 35%, listing 25%)`);
  return notes.join(". ") + ".";
}

export async function analyzeToken(tokenAddress, network = "mainnet") {
  const client = getClient(network);

  const [onchain, dex, cg] = await Promise.all([
    analyzeOnchain(client, tokenAddress),
    fetchDexScreener(tokenAddress),
    fetchCoinGecko(tokenAddress, network),
  ]);

  const onchainScore = scoreOnchain(onchain);
  const liquidityScore = scoreLiquidity(dex);
  const listingScore = scoreListing(cg);
  const score = computeWeightedScore(onchainScore, liquidityScore, listingScore);

  const highRiskFlags = [];
  if (!onchain.hasBytecode) highRiskFlags.push("no_contract");
  if (onchain.hasMint) highRiskFlags.push("mint_function");
  if (onchain.hasPause) highRiskFlags.push("pause_function");
  if (onchain.hasBlacklist) highRiskFlags.push("blacklist_function");
  if (!onchain.ownerRenounced && onchain.hasOwner) highRiskFlags.push("owner_not_renounced");
  if (dex.pairCount === 0) highRiskFlags.push("no_dex_pairs");
  if (dex.liquidityUSD != null && dex.liquidityUSD < 5000) highRiskFlags.push("low_liquidity");
  if (dex.pairAgeHours != null && dex.pairAgeHours < 24) highRiskFlags.push("young_pair");
  if (!cg.listed) highRiskFlags.push("not_listed");

  return {
    score,
    tokenAddress,
    network,
    explanation: buildExplanation(onchain, dex, cg, score),
    signals: onchain.signals,
    liquidityUSD: dex.liquidityUSD ?? null,
    volumeH24: dex.volumeH24 ?? null,
    pairCount: dex.pairCount ?? 0,
    pairAgeHours: dex.pairAgeHours ?? null,
    topHolderPct: onchain.topHolderPct ?? null,
    topHolder: onchain.topHolder ?? null,
    listed: cg.listed ?? false,
    marketCap: cg.marketCap ?? null,
    priceChange24h: cg.priceChange24h ?? null,
    highRiskFlags,
    subscores: {
      onchain: onchainScore,
      liquidity: liquidityScore,
      listing: listingScore,
    },
    dataSources: [
      "Avalanche RPC (eth_call, Transfer logs)",
      dex.ok ? "DexScreener API" : "DexScreener (unavailable)",
      cg.ok ? "CoinGecko API" : "CoinGecko (unavailable)",
    ],
    rawApiData: {
      dexScreener: dex.raw
        ? { pairCount: dex.pairCount, topPairs: (dex.pairs || []).slice(0, 3), bestLiquidityUSD: dex.liquidityUSD }
        : (dex.error ? { error: dex.error } : { pairs: [] }),
      coinGecko: cg.raw
        ? {
            id: cg.raw.id,
            symbol: cg.raw.symbol,
            name: cg.raw.name,
            market_cap: cg.raw.market_data?.market_cap?.usd,
            price_change_24h: cg.raw.market_data?.price_change_percentage_24h,
          }
        : (cg.error ? { error: cg.error } : { listed: cg.listed }),
    },
  };
}
