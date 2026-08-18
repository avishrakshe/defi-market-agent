"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance, useReadContract } from "wagmi";
import { CONTRACTS, testUsdcAbi } from "@/lib/contracts";
import { formatUnits } from "viem";

export function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

type OrchestratorWallet = {
  address?: string;
  usdcBalance?: number;
  tagtBalance?: string;
  lowBalance?: boolean;
  spendCap?: number;
};

export function WalletBar({
  orch,
  onFaucetOrch,
  fauceting,
}: {
  orch: OrchestratorWallet;
  onFaucetOrch: () => void;
  fauceting: boolean;
}) {
  const { address, isConnected } = useAccount();
  const { data: nativeBal } = useBalance({ address });
  const { data: usdcRaw } = useReadContract({
    address: CONTRACTS.TestUSDC as `0x${string}`,
    abi: testUsdcAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const userUsdc = usdcRaw != null ? parseFloat(formatUnits(usdcRaw, 6)) : 0;

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
      <div className="hidden lg:flex flex-col text-[10px] leading-tight text-neutral-500 border-r border-neutral-200 pr-4">
        <span className="font-semibold text-neutral-700">Orchestrator</span>
        <span>{orch.address ? shortAddr(orch.address) : "—"}</span>
        <span>{orch.usdcBalance != null ? `${orch.usdcBalance.toFixed(2)} tUSDC` : "…"}</span>
        {orch.lowBalance && (
          <button onClick={onFaucetOrch} disabled={fauceting} className="text-lime-700 font-semibold mt-0.5 text-left hover:underline">
            {fauceting ? "Topping up…" : "Top up faucet"}
          </button>
        )}
      </div>
      <div className="hidden md:flex flex-col text-[10px] leading-tight text-neutral-500">
        <span className="font-semibold text-neutral-700">{isConnected ? "Your wallet" : "Not connected"}</span>
        {isConnected && address ? (
          <>
            <span>{shortAddr(address)}</span>
            <span>{userUsdc.toFixed(2)} tUSDC · {nativeBal ? Number(nativeBal.formatted).toFixed(2) : "0"} tAGT</span>
          </>
        ) : (
          <span className="text-neutral-400">Connect for Mode B</span>
        )}
      </div>
      <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
    </div>
  );
}
