"use client";

import { useState } from "react";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  usePublicClient,
} from "wagmi";
import { CONTRACTS, identityRegistryAbi, stakeManagerAbi, testUsdcAbi } from "@/lib/contracts";
import { parseUnits } from "viem";

export function UserWalletActions() {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [name, setName] = useState("My DeFi Agent");
  const [skill, setSkill] = useState("custom-skill");
  const [endpoint, setEndpoint] = useState("http://localhost:4000");
  const [price, setPrice] = useState("0.01");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: minStake } = useReadContract({
    address: CONTRACTS.StakeManager as `0x${string}`,
    abi: stakeManagerAbi,
    functionName: "minimumStake",
  });

  if (!isConnected || !address) {
    return (
      <div className="card-muted p-5 text-sm text-neutral-500">
        <p className="font-semibold text-neutral-700 mb-1">Connected mode (optional)</p>
        <p>Connect a wallet to claim test tUSDC, register your own agent, or pay for tasks with your wallet.</p>
      </div>
    );
  }

  async function claimFaucet() {
    if (!address) return;
    setBusy(true);
    setStatus("Confirm faucet in MetaMask…");
    try {
      await writeContractAsync({
        address: CONTRACTS.TestUSDC as `0x${string}`,
        abi: testUsdcAbi,
        functionName: "faucet",
        args: [address, parseUnits("1000", 6)],
      });
      setStatus("tUSDC claimed to your wallet.");
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function registerAgent() {
    if (!address) return;
    setBusy(true);
    const stakeAmount = minStake ?? parseUnits("10", 6);
    const metadata = JSON.stringify({
      name,
      skill,
      endpoint,
      priceUSDC: price,
      description: `User-registered ${skill} agent`,
    });
    const metadataURI = `data:application/json,${encodeURIComponent(metadata)}`;

    try {
      setStatus("Step 1/3: Approve tUSDC for staking…");
      await writeContractAsync({
        address: CONTRACTS.TestUSDC as `0x${string}`,
        abi: testUsdcAbi,
        functionName: "approve",
        args: [CONTRACTS.StakeManager as `0x${string}`, stakeAmount],
      });

      setStatus("Step 2/3: Register agent identity…");
      const regHash = await writeContractAsync({
        address: CONTRACTS.IdentityRegistry as `0x${string}`,
        abi: identityRegistryAbi,
        functionName: "registerAgent",
        args: [address, metadataURI],
      });
      const receipt = await publicClient!.waitForTransactionReceipt({ hash: regHash });
      const tokenId = BigInt(receipt.logs[0]?.topics?.[3] || "0");

      setStatus("Step 3/3: Stake minimum tUSDC…");
      await writeContractAsync({
        address: CONTRACTS.StakeManager as `0x${string}`,
        abi: stakeManagerAbi,
        functionName: "stake",
        args: [tokenId, stakeAmount],
      });
      setStatus(`Agent #${tokenId} registered and staked.`);
    } catch (e) {
      setStatus(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-muted p-5 space-y-4 text-sm">
      <div>
        <p className="font-semibold text-neutral-800">Connected mode actions</p>
        <p className="text-neutral-500 text-xs mt-1">Your wallet · {address.slice(0, 10)}…</p>
      </div>
      <button className="btn-lime text-xs !py-2" onClick={claimFaucet} disabled={busy}>
        {busy ? "Working…" : "Get test tUSDC"}
      </button>
      <div className="space-y-2 border-t border-neutral-200 pt-3">
        <p className="font-medium text-xs">Register my agent</p>
        <input className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs" value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name" />
        <input className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs" value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="Skill id" />
        <input className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="Endpoint URL" />
        <input className="w-full bg-white border border-neutral-200 rounded-xl px-3 py-2 text-xs" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price tUSDC" />
        <button className="btn-dark text-xs !py-2 w-full" onClick={registerAgent} disabled={busy}>
          Register + stake (3 MetaMask prompts)
        </button>
      </div>
      {status && <p className="text-xs text-neutral-600">{status}</p>}
    </div>
  );
}
