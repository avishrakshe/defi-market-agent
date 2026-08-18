import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { createAgentServer } from "../../shared/agent-server.js";

const SNOWTRACE_API = "https://api-testnet.snowtrace.io/api";

async function fetchContractSource(contractAddress, network = "fuji") {
  const apiUrl = network === "mainnet"
    ? "https://api.snowtrace.io/api"
    : SNOWTRACE_API;

  const url = `${apiUrl}?module=contract&action=getsourcecode&address=${contractAddress}`;
  const resp = await fetch(url);
  const data = await resp.json();

  if (data.status === "1" && data.result?.[0]?.SourceCode) {
    return {
      source: data.result[0].SourceCode,
      contractName: data.result[0].ContractName || "Unknown",
      compiler: data.result[0].CompilerVersion,
      verified: true,
    };
  }

  return { source: null, contractName: "Unknown", verified: false };
}

function runSlither(source, contractName) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-"));
  const solFile = path.join(tmpDir, `${contractName}.sol`);

  try {
    let code = source;
    if (code.startsWith("{{")) {
      try { code = JSON.parse(code.slice(1, -1)).sources?.[Object.keys(JSON.parse(code.slice(1, -1)).sources)[0]]?.content || code; } catch (_) {}
    }
    fs.writeFileSync(solFile, code);

    const output = execSync(`slither "${solFile}" --json -`, {
      timeout: 60000,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const parsed = JSON.parse(output);
    const detectors = parsed.results?.detectors || [];

    const criticalIssues = detectors
      .filter((d) => d.impact === "High")
      .map((d) => ({ check: d.check, description: d.description }));
    const mediumIssues = detectors
      .filter((d) => d.impact === "Medium")
      .map((d) => ({ check: d.check, description: d.description }));
    const gasOptimizations = detectors
      .filter((d) => d.impact === "Optimization" || d.impact === "Informational")
      .map((d) => ({ check: d.check, description: d.description }));

    return { criticalIssues, mediumIssues, gasOptimizations, tool: "slither" };
  } catch (err) {
    return heuristicAudit(source);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true }); } catch (_) {}
  }
}

function heuristicAudit(source) {
  const criticalIssues = [];
  const mediumIssues = [];
  const gasOptimizations = [];

  if (!source) {
    return {
      criticalIssues: [{ check: "no-source", description: "Contract source not verified on Snowtrace" }],
      mediumIssues: [],
      gasOptimizations: [],
      tool: "heuristic",
      summary: "Source unavailable — bytecode-only analysis not possible without verification.",
    };
  }

  if (/selfdestruct|delegatecall/i.test(source)) {
    mediumIssues.push({ check: "dangerous-opcodes", description: "Contains delegatecall or selfdestruct patterns" });
  }
  if (/tx\.origin/i.test(source)) {
    mediumIssues.push({ check: "tx-origin", description: "Uses tx.origin for authorization" });
  }
  if (/onlyOwner|Ownable/i.test(source) && !/renounceOwnership/i.test(source)) {
    mediumIssues.push({ check: "centralization", description: "Owner-controlled functions detected" });
  }
  if (/for\s*\(/i.test(source)) {
    gasOptimizations.push({ check: "loops", description: "Loops detected — review gas costs" });
  }

  return {
    criticalIssues,
    mediumIssues,
    gasOptimizations,
    tool: "heuristic",
    summary: `Heuristic scan: ${criticalIssues.length} critical, ${mediumIssues.length} medium, ${gasOptimizations.length} optimizations.`,
  };
}

async function auditContract(contractAddress, network = "fuji") {
  const fetched = await fetchContractSource(contractAddress, network);

  let audit;
  if (fetched.verified && fetched.source) {
    try {
      execSync("slither --version", { stdio: "pipe" });
      audit = runSlither(fetched.source, fetched.contractName);
    } catch {
      audit = heuristicAudit(fetched.source);
    }
  } else if (fetched.source) {
    audit = heuristicAudit(fetched.source);
  } else {
    audit = heuristicAudit(null);
  }

  return {
    contractAddress,
    network,
    contractName: fetched.contractName,
    verified: fetched.verified,
    criticalIssues: audit.criticalIssues,
    mediumIssues: audit.mediumIssues,
    gasOptimizations: audit.gasOptimizations,
    summary: audit.summary || `${audit.criticalIssues.length} critical, ${audit.mediumIssues.length} medium, ${audit.gasOptimizations.length} gas optimizations found.`,
    tool: audit.tool,
    dataSource: fetched.verified ? "Snowtrace API + Slither/heuristic" : "Snowtrace API (unverified)",
  };
}

const { start } = createAgentServer({
  skill: "contract-audit",
  name: "Smart Contract Auditor",
  description:
    "Runs Slither static analysis on the target contract's verified source (fetched from Snowtrace) and reports critical issues, medium issues, and gas optimizations.",
  priceUSDC: "0.05",
  port: parseInt(process.env.AUDITOR_PORT || "4001", 10),
  privateKeyEnv: "AGENT_AUDITOR_PRIVATE_KEY",
  routePath: "/audit",
  handler: async (body) => auditContract(body.contractAddress, body.network || "fuji"),
});

start().catch((e) => {
  console.error(e);
  process.exit(1);
});
