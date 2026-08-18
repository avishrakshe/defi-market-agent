const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
const { randomBytes } = require("crypto");

function loadDeployed() {
  const p = path.join(__dirname, "..", "..", "shared", "deployed.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

async function main() {
  const deployed = loadDeployed();
  const [deployer, agent1, agent2] = await hre.ethers.getSigners();
  const payer = deployer;

  const identity = await hre.ethers.getContractAt(
    "IdentityRegistry",
    deployed.contracts.IdentityRegistry
  );
  const reputation = await hre.ethers.getContractAt(
    "ReputationRegistry",
    deployed.contracts.ReputationRegistry
  );
  const payment = await hre.ethers.getContractAt(
    "PaymentSettlement",
    deployed.contracts.PaymentSettlement
  );
  const usdc = await hre.ethers.getContractAt("TestUSDC", deployed.contracts.TestUSDC);

  console.log("\n=== 1. Register dummy agents ===");
  let agents = await identity.getAllAgents();
  if (agents.length < 2) {
    const tx1 = await identity.registerAgent(agent1.address, "ipfs://agent1-metadata");
    const receipt1 = await tx1.wait();
    console.log("Agent1 registration tx:", receipt1.hash);

    const tx2 = await identity.registerAgent(agent2.address, "ipfs://agent2-metadata");
    const receipt2 = await tx2.wait();
    console.log("Agent2 registration tx:", receipt2.hash);
    agents = await identity.getAllAgents();
  } else {
    console.log("Agents already registered, skipping");
  }
  console.log("Registered agents:", agents.length);

  console.log("\n=== 2. EIP-3009 payment via PaymentSettlement ===");
  const amount = 10_000n; // 0.01 tUSDC (6 decimals)
  await (await usdc.faucet(payer.address, 1_000_000n)).wait();

  const nonce = "0x" + randomBytes(32).toString("hex");
  const validAfter = 0;
  const validBefore = Math.floor(Date.now() / 1000) + 3600;

  const domain = {
    name: "Test USD Coin",
    version: "1",
    chainId: (await hre.ethers.provider.getNetwork()).chainId,
    verifyingContract: deployed.contracts.TestUSDC,
  };

  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  };

  const value = {
    from: payer.address,
    to: agent1.address,
    value: amount,
    validAfter,
    validBefore,
    nonce,
  };

  const signature = await payer.signTypedData(domain, types, value);
  const sig = hre.ethers.Signature.from(signature);

  const balanceBefore = await usdc.balanceOf(agent1.address);

  const settleTx = await payment.verifyAndSettle({
    from: payer.address,
    to: agent1.address,
    value: amount,
    validAfter,
    validBefore,
    nonce,
    v: sig.v,
    r: sig.r,
    s: sig.s,
  });
  const settleReceipt = await settleTx.wait();
  console.log("Settlement tx:", settleReceipt.hash);

  const linkTx = await payment.linkTxHash(nonce, settleReceipt.hash);
  await linkTx.wait();
  console.log("Linked tx hash for reputation check");

  const balanceAfter = await usdc.balanceOf(agent1.address);
  console.log("Agent1 balance change:", (balanceAfter - balanceBefore).toString(), "units");

  console.log("\n=== 3. Submit sample feedback ===");
  const feedbackTx = await reputation.submitFeedback(
    1,
    85,
    settleReceipt.hash,
    "Great service on sample task"
  );
  const feedbackReceipt = await feedbackTx.wait();
  console.log("Feedback tx:", feedbackReceipt.hash);

  const rep = await reputation.getReputation(1);
  console.log("Agent1 reputation:", rep.avgScore.toString(), "avg,", rep.feedbackCount.toString(), "feedback(s)");

  console.log("\n=== VERIFICATION PASSED ===");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
