const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.join(__dirname, "..");

const nodeDir = path.dirname(process.execPath);
if (!process.env.PATH.includes(nodeDir)) {
  process.env.PATH = `${nodeDir}${path.delimiter}${process.env.PATH}`;
}
const pyDir = "C:\\Users\\HP\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python";
if (fs.existsSync(pyDir) && !process.env.PATH.includes(pyDir)) {
  process.env.PATH = `${pyDir}${path.delimiter}${pyDir}\\Scripts${path.delimiter}${process.env.PATH}`;
}

function bin(name, workspace) {
  if (name === "hardhat") {
    const hhPath = path.join(ROOT, workspace || "", "node_modules", "hardhat", "internal", "cli", "cli.js");
    if (fs.existsSync(hhPath)) return hhPath;
  }
  if (name === "next") {
    const nextPath = path.join(ROOT, workspace || "", "node_modules", "next", "dist", "bin", "next");
    if (fs.existsSync(nextPath)) return nextPath;
  }
  const candidate = path.join(ROOT, workspace || "", "node_modules", ".bin", name + (process.platform === "win32" ? ".cmd" : ""));
  if (fs.existsSync(candidate)) return candidate;
  const rootCandidate = path.join(ROOT, "node_modules", ".bin", name + (process.platform === "win32" ? ".cmd" : ""));
  if (fs.existsSync(rootCandidate)) return rootCandidate;
  return name;
}

const procs = [];

function start(label, cmd, args, cwd, env = {}) {
  let executable = cmd;
  let finalArgs = args;
  if (!cmd.endsWith(".cmd") && !cmd.endsWith(".exe") && (cmd.endsWith(".js") || cmd.includes("next"))) {
    executable = `"${process.execPath}"`;
    finalArgs = [cmd, ...args];
  }
  console.log(`[dev-all] Starting ${label}: ${executable} ${finalArgs.join(" ")}`);
  const child = spawn(executable, finalArgs, { cwd, env: { ...process.env, ...env }, stdio: "inherit", shell: true });
  child.on("exit", (code) => console.log(`[dev-all] ${label} exited (${code})`));
  procs.push({ label, child });
  return child;
}

async function waitForRpc(url, attempts = 30) {
  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_chainId", params: [], id: 1 }),
      });
      if (resp.ok) { console.log("[dev-all] RPC ready at", url); return; }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("RPC not ready: " + url);
}

async function main() {
  require("dotenv").config({ path: path.join(ROOT, ".env") });
  const rpcUrl = process.env.RPC_URL || "http://127.0.0.1:9650";

  start("devnet", bin("hardhat", "contracts"), ["node", "--port", "9650", "--hostname", "127.0.0.1"], path.join(ROOT, "contracts"));
  await waitForRpc(rpcUrl);

  const hhCli = bin("hardhat", "contracts");
  console.log("[dev-all] Deploying contracts...");
  const deploy = spawn(`"${process.execPath}"`, [hhCli, "run", "scripts/deploy.js", "--network", "agentmarket"], { cwd: path.join(ROOT, "contracts"), stdio: "inherit", shell: true });
  await new Promise((res, rej) => deploy.on("exit", (c) => (c === 0 ? res() : rej(new Error("deploy failed")))));

  console.log("[dev-all] Funding orchestrator...");
  const fund = spawn(`"${process.execPath}"`, [hhCli, "run", "../scripts/fund-orchestrator.js", "--network", "agentmarket"], { cwd: path.join(ROOT, "contracts"), stdio: "inherit", shell: true });
  await new Promise((res) => fund.on("exit", (c) => {
    if (c !== 0) console.warn("[dev-all] fund orchestrator exited", c, "— continuing if balance already OK");
    res();
  }));

  start("auditor", "node", ["server.js"], path.join(ROOT, "services", "specialist-auditor"));
  start("risk-scorer", "node", ["server.js"], path.join(ROOT, "services", "specialist-risk-scorer"));
  start("gas-timing", "node", ["server.js"], path.join(ROOT, "services", "specialist-gas-timing"));
  start("orchestrator", "python", ["main.py"], path.join(ROOT, "services", "orchestrator"));
  start("frontend", bin("next", "frontend"), ["dev", "-p", "3000"], path.join(ROOT, "frontend"));

  process.on("SIGINT", () => { procs.forEach(({ child }) => child.kill()); process.exit(0); });
}

main().catch((e) => { console.error(e); process.exit(1); });
