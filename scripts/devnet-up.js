const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const ROOT = path.join(__dirname, "..");
const ENV_PATH = path.join(ROOT, ".env");
const CHAIN_ID = process.env.CHAIN_ID || "99999";

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  return execSync(cmd, { stdio: "inherit", cwd: ROOT, ...opts });
}

function writeEnv(vars) {
  const lines = Object.entries(vars).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(ENV_PATH, lines.join("\n") + "\n");
  console.log("Wrote", ENV_PATH);
}

function tryAvalancheDocker() {
  console.log("\n=== Phase 1: Avalanche Subnet-EVM via Docker ===\n");
  const image = "agentmarket-avalanche-cli";

  run(`docker build -t ${image} -f docker/Dockerfile.avalanche-cli docker`);

  const projectPath = ROOT.replace(/\\/g, "/");
  const dockerCmd = [
    "docker run --rm",
    "-v /var/run/docker.sock:/var/run/docker.sock",
    `-v "${projectPath}:/workspace"`,
    "-e CHAIN_ID=" + CHAIN_ID,
    "-w /workspace",
    image,
    "bash scripts/devnet-setup.sh",
  ].join(" ");

  try {
    execSync(dockerCmd, { stdio: "inherit", cwd: ROOT, shell: true });
    return true;
  } catch (err) {
    console.warn("Avalanche Docker setup failed:", err.message);
    return false;
  }
}

function startHardhatDevnet() {
  console.log("\n=== Fallback: Hardhat local node (Cancun EVM) ===\n");
  const hardhat = path.join(ROOT, "contracts", "node_modules", ".bin", "hardhat");
  const hardhatCmd = process.platform === "win32" ? `"${hardhat}.cmd"` : hardhat;

  const child = spawnSync(
    hardhatCmd,
    ["node", "--port", "9650", "--hostname", "127.0.0.1"],
    {
      cwd: path.join(ROOT, "contracts"),
      detached: true,
      stdio: "ignore",
      shell: true,
    }
  );

  if (child.error) throw child.error;
  // Hardhat default funded account #0
  const devKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbdfe5d93f0fb8d5d9a493e";
  writeEnv({
    RPC_URL: "http://127.0.0.1:9650",
    CHAIN_ID,
    DEV_PRIVATE_KEY: devKey,
    NATIVE_TOKEN_SYMBOL: "tAGT",
    DEVNET_MODE: "hardhat",
  });
  return true;
}

function parseAvalancheOutput() {
  // Try to read from avalanche describe output saved by setup script
  const describePath = path.join(ROOT, "shared", "devnet-info.json");
  if (fs.existsSync(describePath)) {
    const info = JSON.parse(fs.readFileSync(describePath, "utf8"));
    writeEnv({
      RPC_URL: info.rpcUrl,
      CHAIN_ID: String(info.chainId || CHAIN_ID),
      DEV_PRIVATE_KEY: info.privateKey || process.env.DEV_PRIVATE_KEY,
      NATIVE_TOKEN_SYMBOL: "tAGT",
      DEVNET_MODE: "avalanche",
    });
    return;
  }

  // Default Avalanche local RPC pattern
  writeEnv({
    RPC_URL: `http://127.0.0.1:9650/ext/bc/agentmarket/rpc`,
    CHAIN_ID,
    DEV_PRIVATE_KEY: "0x56289e99c94b691298b729174e4a4ad5a0b11df0e004d877a0e9a05d0540f9db",
    NATIVE_TOKEN_SYMBOL: "tAGT",
    DEVNET_MODE: "avalanche",
  });
}

async function main() {
  const ok = tryAvalancheDocker();
  if (!ok) {
    startHardhatDevnet();
    // Wait for node
    await new Promise((r) => setTimeout(r, 3000));
  } else {
    parseAvalancheOutput();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
