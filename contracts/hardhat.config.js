require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:9650";
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "99999", 10);
const keys = [
  process.env.DEV_PRIVATE_KEY,
  process.env.ORCHESTRATOR_PRIVATE_KEY,
  process.env.AGENT_AUDITOR_PRIVATE_KEY,
  process.env.AGENT_RISK_SCORER_PRIVATE_KEY,
  process.env.AGENT_GAS_TIMING_PRIVATE_KEY,
].filter(Boolean);

const accounts = keys
  .map((k) => (String(k).startsWith("0x") ? String(k) : `0x${k}`))
  .filter((k) => k.replace(/^0x/, "").length === 64);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      chainId: CHAIN_ID,
    },
    agentmarket: {
      url: RPC_URL,
      chainId: CHAIN_ID,
      accounts,
    },
    fuji: {
      url: process.env.FUJI_RPC_URL || "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
      accounts,
    },
    localhost: {
      url: "http://127.0.0.1:9650",
      chainId: CHAIN_ID,
      accounts,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
