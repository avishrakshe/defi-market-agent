import { NextResponse } from "next/server";
import { createPublicClient, formatUnits, http } from "viem";
import deployed from "../../../../shared/deployed.json";

export const dynamic = "force-dynamic";

const DEFI_SKILLS = ["contract-audit", "token-risk-score", "gas-timing"];

function getClient() {
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:9650";
  const chainId = parseInt(process.env.CHAIN_ID || "99999", 10);
  return createPublicClient({
    chain: {
      id: chainId,
      name: "agentmarket",
      nativeCurrency: { name: "tAGT", symbol: "tAGT", decimals: 18 },
      rpcUrls: { default: { http: [rpcUrl] } },
    },
    transport: http(rpcUrl),
  });
}

export async function GET() {
  try {
    const client = getClient();
    const identityAbi = deployed.abis.IdentityRegistry as readonly unknown[];
    const reputationAbi = deployed.abis.ReputationRegistry as readonly unknown[];
    const stakeAbi = deployed.abis.StakeManager as readonly unknown[];
    const identityAddress = deployed.contracts.IdentityRegistry as `0x${string}`;
    const reputationAddress = deployed.contracts.ReputationRegistry as `0x${string}`;
    const stakeAddress = deployed.contracts.StakeManager as `0x${string}`;

    const agents = await client.readContract({
      address: identityAddress,
      abi: identityAbi,
      functionName: "getAllAgents",
    }) as Array<{ tokenId: bigint; wallet: string; metadataURI: string }>;

    const enriched = await Promise.all(
      agents.map(async (a) => {
        let meta: Record<string, string> = {};
        try {
          if (a.metadataURI.startsWith("http")) {
            const resp = await fetch(a.metadataURI, { cache: "no-store" });
            meta = await resp.json();
          }
        } catch (_) {}

        const rep = await client.readContract({
          address: reputationAddress,
          abi: reputationAbi,
          functionName: "getReputation",
          args: [a.tokenId],
        }) as { avgScore: bigint; feedbackCount: bigint };

        let stake = BigInt(0);
        try {
          stake = await client.readContract({
            address: stakeAddress,
            abi: stakeAbi,
            functionName: "getStake",
            args: [a.tokenId],
          }) as bigint;
        } catch (_) {}

        return {
          tokenId: Number(a.tokenId),
          wallet: a.wallet,
          metadataURI: a.metadataURI,
          name: meta.name,
          skill: meta.skill,
          description: meta.description,
          price: meta.priceUSDC || meta.price,
          endpoint: meta.endpoint,
          reputation: {
            avgScore: Number(rep.avgScore),
            feedbackCount: Number(rep.feedbackCount),
          },
          stake: formatUnits(stake, 6),
        };
      })
    );

    const defiAgents = enriched.filter((a) => DEFI_SKILLS.includes(a.skill || ""));

    return NextResponse.json({ agents: defiAgents, total: defiAgents.length });
  } catch (e) {
    return NextResponse.json({ agents: [], error: String(e) });
  }
}
