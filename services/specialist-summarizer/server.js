import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import {
  loadDeployed,
  getPublicClient,
  getWalletClient,
  getChainConfig,
} from "../../shared/blockchain.js";

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".env") });

const SKILL = process.env.AGENT_SKILL || "summarize";
const PORT = parseInt(process.env.PORT || "4001", 10);
const PRICE = process.env.AGENT_PRICE || "0.01";
const PRICE_UNITS = BigInt(Math.round(parseFloat(PRICE) * 1_000_000));

let deployed;
let walletClient;
let publicClient;
let agentWallet;
let agentTokenId = null;

const app = express();
app.use(cors());
app.use(express.json());

function getMetadataUrl() {
  return `http://localhost:${PORT}/metadata`;
}

app.get("/metadata", (_req, res) => {
  res.json({
    name: `Specialist ${SKILL}`,
    skill: SKILL,
    price: PRICE,
    currency: "tUSDC",
    wallet: agentWallet,
    endpoint: `http://localhost:${PORT}`,
    chainId: getChainConfig().id,
    tokenAddress: deployed?.contracts?.TestUSDC,
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", skill: SKILL, agentTokenId });
});

async function registerAgent() {
  const identityAbi = deployed.abis.IdentityRegistry;
  const identityAddress = deployed.contracts.IdentityRegistry;

  const agents = await publicClient.readContract({
    address: identityAddress,
    abi: identityAbi,
    functionName: "getAllAgents",
  });

  const existing = agents.find((a) => a.wallet.toLowerCase() === agentWallet.toLowerCase());
  if (existing) {
    agentTokenId = Number(existing.tokenId);
    console.log(`Agent already registered as tokenId ${agentTokenId}`);
    return;
  }

  const hash = await walletClient.writeContract({
    address: identityAddress,
    abi: identityAbi,
    functionName: "registerAgent",
    args: [agentWallet, getMetadataUrl()],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log("Registered agent, tx:", receipt.transactionHash);

  const updated = await publicClient.readContract({
    address: identityAddress,
    abi: identityAbi,
    functionName: "getAllAgents",
  });
  const mine = updated.find((a) => a.wallet.toLowerCase() === agentWallet.toLowerCase());
  agentTokenId = mine ? Number(mine.tokenId) : null;
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

async function runTask(body, taskType) {
  const text = body.text || body.task || "";
  if (process.env.OPENAI_API_KEY) {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: taskType === "summarize"
              ? "You are a concise summarizer. Return a 2-3 sentence summary."
              : "You are a translator. Translate the text to Spanish.",
          },
          { role: "user", content: text },
        ],
      }),
    });
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || "No LLM response";
  }

  if (taskType === "summarize") {
    const words = text.split(/\s+/).slice(0, 20).join(" ");
    return `[Mock Summary] ${words}${text.split(/\s+/).length > 20 ? "..." : ""}`;
  }
  return `[Mock Translation → ES] ${text}`;
}

function paymentRequired(res) {
  return res.status(402).json({
    price: PRICE,
    currency: "tUSDC",
    payTo: agentWallet,
    chainId: getChainConfig().id,
    tokenAddress: deployed.contracts.TestUSDC,
    agentTokenId,
  });
}

function createHandler(taskType) {
  return async (req, res) => {
    try {
      const paymentHeader = req.headers["x-payment"];
      if (!paymentHeader) return paymentRequired(res);

      const settlementTxHash = await settlePayment(paymentHeader);
      const result = await runTask(req.body, taskType);

      res.json({
        success: true,
        skill: SKILL,
        agentTokenId,
        settlementTxHash,
        result,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  };
}

app.post("/summarize", createHandler("summarize"));
app.post("/translate", createHandler("translate"));

async function main() {
  deployed = loadDeployed();
  publicClient = getPublicClient();
  walletClient = getWalletClient(
    process.env[`AGENT_${SKILL.toUpperCase()}_PRIVATE_KEY`] ||
      (SKILL === "summarize" ? process.env.AGENT_SUMMARIZE_PRIVATE_KEY : process.env.AGENT_TRANSLATE_PRIVATE_KEY) ||
      process.env.DEV_PRIVATE_KEY
  );
  agentWallet = walletClient.account.address;

  await registerAgent();

  app.listen(PORT, () => {
    console.log(`Specialist ${SKILL} listening on http://localhost:${PORT}`);
    console.log(`Wallet: ${agentWallet}, tokenId: ${agentTokenId}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
