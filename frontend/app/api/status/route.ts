import path from "path";
import { NextResponse } from "next/server";
import dotenv from "dotenv";
import { createPublicClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

export const dynamic = "force-dynamic";

function getClient() {
  const rpcUrl = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "http://127.0.0.1:9650";
  const chainId = parseInt(process.env.CHAIN_ID || "99999", 10);
  const chain = {
    id: chainId,
    name: "agentmarket",
    nativeCurrency: { name: "tAGT", symbol: "tAGT", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  };
  return createPublicClient({ chain, transport: http(rpcUrl) });
}

export async function GET() {
  try {
    const client = getClient();
    const chainId = await client.getChainId();
    const pk = process.env.DEV_PRIVATE_KEY!;
    const account = privateKeyToAccount(pk as `0x${string}`);
    const balance = await client.getBalance({ address: account.address });
    return NextResponse.json({
      chainId,
      connected: true,
      balance: formatEther(balance),
      wallet: account.address,
    });
  } catch (e) {
    return NextResponse.json({ connected: false, error: String(e) }, { status: 503 });
  }
}
