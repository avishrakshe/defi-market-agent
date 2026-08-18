import { NextResponse } from "next/server";
import { createPublicClient, formatUnits, http } from "viem";
import deployed from "../../../../shared/deployed.json";

export const dynamic = "force-dynamic";

const PAYMENT_SETTLED = {
  type: "event",
  name: "PaymentSettled",
  inputs: [
    { indexed: true, name: "from", type: "address" },
    { indexed: true, name: "to", type: "address" },
    { indexed: false, name: "amount", type: "uint256" },
    { indexed: true, name: "nonce", type: "bytes32" },
    { indexed: false, name: "tokenAddress", type: "address" },
  ],
} as const;

export async function GET() {
  try {
    const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:9650";
    const chainId = parseInt(process.env.CHAIN_ID || "99999", 10);
    const client = createPublicClient({
      chain: {
        id: chainId,
        name: "agentmarket",
        nativeCurrency: { name: "tAGT", symbol: "tAGT", decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
      },
      transport: http(rpcUrl),
    });

    const address = deployed.contracts.PaymentSettlement as `0x${string}`;
    const latest = await client.getBlockNumber();
    const fromBlock = latest > BigInt(500) ? latest - BigInt(500) : BigInt(0);

    const logs = await client.getLogs({
      address,
      event: PAYMENT_SETTLED,
      fromBlock,
      toBlock: latest,
    });

    const payments = logs
      .map((log) => ({
        from: log.args.from as string,
        to: log.args.to as string,
        amount: formatUnits(log.args.amount as bigint, 6),
        txHash: log.transactionHash,
        blockNumber: Number(log.blockNumber),
      }))
      .reverse()
      .slice(0, 20);

    return NextResponse.json({ payments });
  } catch (e) {
    return NextResponse.json({ payments: [], error: String(e) });
  }
}
