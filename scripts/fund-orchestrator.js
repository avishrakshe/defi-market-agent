const hre = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", "services", "orchestrator", ".env") });

async function main() {
  const deployed = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "shared", "deployed.json"), "utf8"));
  const pk = process.env.ORCHESTRATOR_PRIVATE_KEY || process.env.DEV_PRIVATE_KEY;
  const wallet = new hre.ethers.Wallet(pk, hre.ethers.provider);

  const usdc = await hre.ethers.getContractAt("TestUSDC", deployed.contracts.TestUSDC, wallet);
  const balance = await usdc.balanceOf(wallet.address);
  const min = hre.ethers.parseUnits("100", 6);

  console.log("Orchestrator wallet:", wallet.address);
  console.log("Current tUSDC balance:", hre.ethers.formatUnits(balance, 6));

  if (balance < min) {
    const tx = await usdc.faucet(wallet.address, hre.ethers.parseUnits("1000", 6));
    await tx.wait();
    console.log("Faucet tx:", tx.hash);
    const newBal = await usdc.balanceOf(wallet.address);
    console.log("New tUSDC balance:", hre.ethers.formatUnits(newBal, 6));
  } else {
    console.log("Balance sufficient — no faucet needed");
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
