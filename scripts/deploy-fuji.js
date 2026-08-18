#!/usr/bin/env node
/**
 * Deploy contracts to Avalanche Fuji and fund orchestrator.
 * Prerequisites: .env with DEV_PRIVATE_KEY + Fuji AVAX on deployer wallet.
 *
 * Usage:
 *   node scripts/deploy-fuji.js
 */
const { spawn } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CONTRACTS = path.join(ROOT, "contracts");

const FUJI_ENV = {
  ...process.env,
  RPC_URL: process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc",
  CHAIN_ID: "43113",
};

function run(label, args) {
  return new Promise((resolve, reject) => {
    const cmd = process.platform === "win32"
      ? `cmd.exe /c npx hardhat ${args.join(" ")}`
      : `npx hardhat ${args.join(" ")}`;
    console.log(`\n[fuji] ${label}: ${cmd}`);
    const child = spawn(cmd, { cwd: CONTRACTS, env: FUJI_ENV, stdio: "inherit", shell: true });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${label} failed (${code})`))));
  });
}

async function main() {
  require("dotenv").config({ path: path.join(ROOT, ".env") });
  console.log("Deploying to Avalanche Fuji (chainId 43113)...");
  console.log("RPC:", FUJI_ENV.RPC_URL);
  await run("compile", ["compile"]);
  await run("deploy", ["run", "scripts/deploy.js", "--network", "fuji"]);
  try {
    await run("fund", ["run", "../scripts/fund-orchestrator.js", "--network", "fuji"]);
  } catch (e) {
    console.warn("[fuji] fund step skipped:", e.message);
  }
  console.log("\nDone. Update shared/deployed.json is committed — redeploy agents with public URLs, then verify-agents.");
  console.log("Next: docker compose -f docker-compose.prod.yml up --build");
  console.log("Then: cd frontend && vercel --prod");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
