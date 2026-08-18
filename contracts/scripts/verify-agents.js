const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function loadDeployed() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "shared", "deployed.json"), "utf8"));
}

async function main() {
  const deployed = loadDeployed();
  const identity = await hre.ethers.getContractAt("IdentityRegistry", deployed.contracts.IdentityRegistry);

  console.log("\n=== IdentityRegistry.getAllAgents() ===");
  const agents = await identity.getAllAgents();
  for (const a of agents) {
    let meta = {};
    try {
      if (a.metadataURI.startsWith("http")) {
        const resp = await fetch(a.metadataURI);
        meta = await resp.json();
      }
    } catch (e) {
      meta = { error: e.message };
    }
    console.log(JSON.stringify({
      tokenId: Number(a.tokenId),
      wallet: a.wallet,
      skill: meta.skill,
      name: meta.name,
      priceUSDC: meta.priceUSDC || meta.price,
      endpoint: meta.endpoint,
      description: meta.description?.slice(0, 80),
    }, null, 2));
  }

  const defiSkills = ["contract-audit", "token-risk-score", "gas-timing"];
  const defiAgents = [];
  for (const a of agents) {
    try {
      const resp = await fetch(a.metadataURI);
      const meta = await resp.json();
      if (defiSkills.includes(meta.skill)) defiAgents.push(meta.skill);
    } catch (_) {}
  }

  console.log(`\nDeFi agents found: ${defiAgents.length}/3 — ${defiAgents.join(", ")}`);
  if (defiAgents.length < 3) {
    console.error("FAIL: missing DeFi agents");
    process.exitCode = 1;
  } else {
    console.log("PASS: all 3 DeFi agents registered");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
