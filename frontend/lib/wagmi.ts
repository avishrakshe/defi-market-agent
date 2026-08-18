import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { defineChain } from "viem";
import deployed from "../../shared/deployed.json";

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || deployed.rpcUrl || "http://127.0.0.1:9650";
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || deployed.chainId || 99999);

export const agentMarketChain = defineChain({
  id: chainId,
  name: "Avalanche L1 Devnet",
  nativeCurrency: { name: "tAGT", symbol: "tAGT", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  blockExplorers: { default: { name: "Local", url: rpcUrl } },
});

export const wagmiConfig = getDefaultConfig({
  appName: "DeFi Agent Marketplace",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "demo-agent-marketplace-local",
  chains: [agentMarketChain],
  transports: { [agentMarketChain.id]: http(rpcUrl) },
  ssr: true,
});

export const CHAIN_ID = chainId;
