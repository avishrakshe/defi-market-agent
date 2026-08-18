import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { parseUnits } from "viem";
import {
  loadDeployed,
  getPublicClient,
  getWalletClient,
  getChainConfig,
} from "./blockchain.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

export function createAgentServer(config) {
  const {
    skill,
    name,
    description,
    priceUSDC,
    port,
    privateKeyEnv,
    routePath,
    handler,
  } = config;

  process.on("uncaughtException", (err) => {
    console.error(`[${skill}] Uncaught exception:`, err);
  });
  process.on("unhandledRejection", (reason) => {
    console.error(`[${skill}] Unhandled rejection:`, reason);
  });

  let deployed;

  let walletClient;
  let publicClient;
  let agentWallet;
  let agentTokenId = null;

  const app = express();
  app.use(cors());
  app.use(express.json());

  function getMetadataUrl() {
    return `http://localhost:${port}/metadata`;
  }

  app.get("/metadata", (_req, res) => {
    res.json({
      name,
      skill,
      priceUSDC,
      price: priceUSDC,
      currency: "tUSDC",
      description,
      wallet: agentWallet,
      endpoint: `http://localhost:${port}`,
      chainId: getChainConfig().id,
      tokenAddress: deployed?.contracts?.TestUSDC,
    });
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", skill, name, agentTokenId });
  });

  async function ensureUsdcBalance() {
    const usdcAbi = deployed.abis.TestUSDC;
    const usdcAddress = deployed.contracts.TestUSDC;
    const balance = await publicClient.readContract({
      address: usdcAddress,
      abi: usdcAbi,
      functionName: "balanceOf",
      args: [agentWallet],
    });
    const minNeeded = parseUnits("20", 6);
    if (balance < minNeeded) {
      const hash = await walletClient.writeContract({
        address: usdcAddress,
        abi: usdcAbi,
        functionName: "faucet",
        args: [agentWallet, parseUnits("1000", 6)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`[${skill}] Faucet tx:`, hash);
    }
  }

  async function registerAndStake() {
    const identityAbi = deployed.abis.IdentityRegistry;
    const identityAddress = deployed.contracts.IdentityRegistry;
    const stakeAbi = deployed.abis.StakeManager;
    const stakeAddress = deployed.contracts.StakeManager;
    const usdcAbi = deployed.abis.TestUSDC;
    const usdcAddress = deployed.contracts.TestUSDC;

    const agents = await publicClient.readContract({
      address: identityAddress,
      abi: identityAbi,
      functionName: "getAllAgents",
    });

    const existing = agents.find((a) => a.wallet.toLowerCase() === agentWallet.toLowerCase());
    if (existing) {
      agentTokenId = Number(existing.tokenId);
      console.log(`[${skill}] Already registered as tokenId ${agentTokenId}`);
    } else {
      const hash = await walletClient.writeContract({
        address: identityAddress,
        abi: identityAbi,
        functionName: "registerAgent",
        args: [agentWallet, getMetadataUrl()],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      console.log(`[${skill}] Registered agent, tx:`, receipt.transactionHash);

      const updated = await publicClient.readContract({
        address: identityAddress,
        abi: identityAbi,
        functionName: "getAllAgents",
      });
      const mine = updated.find((a) => a.wallet.toLowerCase() === agentWallet.toLowerCase());
      agentTokenId = mine ? Number(mine.tokenId) : null;
    }

    const currentStake = await publicClient.readContract({
      address: stakeAddress,
      abi: stakeAbi,
      functionName: "getStake",
      args: [BigInt(agentTokenId)],
    });

    const minStake = await publicClient.readContract({
      address: stakeAddress,
      abi: stakeAbi,
      functionName: "minimumStake",
    });

    if (currentStake < minStake) {
      await ensureUsdcBalance();
      const approveHash = await walletClient.writeContract({
        address: usdcAddress,
        abi: usdcAbi,
        functionName: "approve",
        args: [stakeAddress, minStake],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      const stakeHash = await walletClient.writeContract({
        address: stakeAddress,
        abi: stakeAbi,
        functionName: "stake",
        args: [BigInt(agentTokenId), minStake],
      });
      const stakeReceipt = await publicClient.waitForTransactionReceipt({ hash: stakeHash });
      console.log(`[${skill}] Staked ${Number(minStake) / 1e6} tUSDC, tx:`, stakeReceipt.transactionHash);
    } else {
      console.log(`[${skill}] Stake OK: ${Number(currentStake) / 1e6} tUSDC`);
    }
  }

  async function settlePayment(paymentHeader) {
    const auth = JSON.parse(Buffer.from(paymentHeader, "base64").toString("utf8"));
    const paymentAbi = deployed.abis.PaymentSettlement;
    const paymentAddress = deployed.contracts.PaymentSettlement;

    const hash = await walletClient.writeContract({
      address: paymentAddress,
      abi: paymentAbi,
      functionName: "verifyAndSettle",
      args: [{
        from: auth.from,
        to: auth.to,
        value: BigInt(auth.value),
        validAfter: BigInt(auth.validAfter),
        validBefore: BigInt(auth.validBefore),
        nonce: auth.nonce,
        v: auth.v,
        r: auth.r,
        s: auth.s,
      }],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    await walletClient.writeContract({
      address: paymentAddress,
      abi: paymentAbi,
      functionName: "linkTxHash",
      args: [auth.nonce, receipt.transactionHash],
    });

    return receipt.transactionHash;
  }

  function paymentRequired(res) {
    return res.status(402).json({
      price: priceUSDC,
      priceUSDC,
      currency: "tUSDC",
      payTo: agentWallet,
      chainId: getChainConfig().id,
      tokenAddress: deployed.contracts.TestUSDC,
      agentTokenId,
    });
  }

  app.post(routePath, async (req, res) => {
    try {
      const paymentHeader = req.headers["x-payment"];
      if (!paymentHeader) return paymentRequired(res);

      const settlementTxHash = await settlePayment(paymentHeader);
      const result = await handler(req.body);

      res.json({
        success: true,
        skill,
        agentTokenId,
        settlementTxHash,
        result,
      });
    } catch (err) {
      console.error(`[${skill}]`, err);
      res.status(500).json({ error: err.message });
    }
  });

  async function start() {
    deployed = loadDeployed();
    publicClient = getPublicClient();
    const pk = process.env[privateKeyEnv] || process.env.DEV_PRIVATE_KEY;
    walletClient = getWalletClient(pk);
    agentWallet = walletClient.account.address;

    try {
      await registerAndStake();
    } catch (err) {
      console.warn(`[${skill}] Registration/staking warning:`, err.message);
    }

    app.listen(port, () => {
      console.log(`[${skill}] ${name} listening on http://localhost:${port}`);
      console.log(`[${skill}] Wallet: ${agentWallet}, tokenId: ${agentTokenId}`);
    });
  }

  return { app, start };
}
